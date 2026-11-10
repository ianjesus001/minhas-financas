import sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment

OUT = sys.argv[1]


# ---------- estilo ----------
FONT = "Arial"
INK = "2D3142"; GRAY = "7A7F8C"; WHITE = "FFFFFF"
TEAL = "2A9D8F"; BLUE = "457B9D"; CORAL = "E76F51"; PURPLE = "7B5EA7"; GOLD = "E9A23B"; NAVY = "264653"
INPUT = "FFF4C2"; LINE = "D9DCE3"
PASTEL = {TEAL: "E3F4F1", BLUE: "E4EEF5", CORAL: "FBE9E4", PURPLE: "EFEAF6", GOLD: "FCF1DE", NAVY: "E6ECEE"}

BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
USD = '"US$" #,##0.00;[Red]-"US$" #,##0.00'
PCT = '0.00%;[Red]-0.00%'
DATE = 'dd/mm/yyyy'

thin = Side(style="thin", color=LINE)
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
BOTTOM = Border(bottom=thin)

def f(size=10, bold=False, color=INK, italic=False):
    return Font(name=FONT, size=size, bold=bold, color=color, italic=italic)

def fill(c):
    return PatternFill("solid", start_color=c, end_color=c)

def put(ws, ref, value=None, size=10, bold=False, color=INK, bg=None, fmt=None,
        h="left", v="center", wrap=False, italic=False, border=None):
    c = ws[ref]
    if value is not None:
        c.value = value
    c.font = f(size, bold, color, italic)
    c.alignment = Alignment(horizontal=h, vertical=v, wrap_text=wrap)
    if bg: c.fill = fill(bg)
    if fmt: c.number_format = fmt
    if border: c.border = border
    return c

def merge(ws, rng, value=None, **kw):
    first = rng.split(":")[0]
    ws.merge_cells(rng)
    bg = kw.get("bg")
    if bg:
        for row in ws[rng]:
            for c in row:
                c.fill = fill(bg)
    return put(ws, first, value, **kw)

def inp(ws, ref, value=None, fmt=None, h="right", size=10, bold=True):
    c = put(ws, ref, value, size=size, bold=bold, color=INK, bg=INPUT, fmt=fmt, h=h, border=BOX)
    c.protection = c.protection.copy(locked=False)
    return c

def unlock(ws, rng):
    for row in ws[rng]:
        for c in row:
            c.protection = c.protection.copy(locked=False)

def setup(ws, widths, tab):
    ws.sheet_view.showGridLines = False
    ws.sheet_properties.tabColor = tab
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

def title(ws, rng, text, sub=None, color=NAVY):
    merge(ws, rng, text, size=20, bold=True, color=color)
    ws.row_dimensions[int(rng.split(":")[0][1:])].height = 36
    if sub:
        r = int(rng.split(":")[0][1:]) + 1
        a, b = rng.split(":")
        merge(ws, f"{a[0]}{r}:{b[0]}{r}", sub, size=10, color=GRAY, italic=True, wrap=True)
        ws.row_dimensions[r].height = 30

def header_row(ws, row, cols_labels, color):
    for col, label in cols_labels:
        put(ws, f"{col}{row}", label, bold=True, color=WHITE, bg=color, h="center", wrap=True, border=BOX)
    ws.row_dimensions[row].height = 32

def section(ws, rng, text, color):
    merge(ws, rng, text, size=11, bold=True, color=WHITE, bg=color)
    ws.row_dimensions[int(rng.split(":")[0][1:])].height = 22

def protect(ws):
    # No Google Sheets a proteção de aba só deixa o dono editar; sem proteção ela pode compartilhar e editar junto.
    pass

def zebra(ws, rng, color="F7F8FA"):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"MOD(ROW(),2)=0"], fill=fill(color)))

def gain_colors(ws, rng):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(ISNUMBER({first}),{first}>0)'], font=Font(name=FONT, color="1B8A5A", bold=True)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(ISNUMBER({first}),{first}<0)'], font=Font(name=FONT, color="C0392B", bold=True)))


# =====================================================================
# Planilha para Google Sheets: só reais (entradas e saídas) e dólares.
# Uso: python tools/gerar_planilha_dolares.py saida.xlsx  → subir no Google Drive (converte para Google Sheets).
# =====================================================================
S0 = "👋 Comece aqui"; S1 = "🏠 Resumo"; S2 = "📒 Meus Reais"; S4 = "💵 Meus Dólares"; SL = "Listas"
q = lambda s: f"'{s}'"

N = 400
FIRST = 6; LAST = FIRST + N - 1

wb = Workbook()
ws0 = wb.active; ws0.title = S0
ws1 = wb.create_sheet(S1); ws2 = wb.create_sheet(S2); ws4 = wb.create_sheet(S4); wl = wb.create_sheet(SL)

# ---------- Listas (oculta) ----------
cats = [
    ("🏠 Moradia (aluguel, condomínio)", "Gasto"), ("🛒 Mercado", "Gasto"), ("🚌 Transporte", "Gasto"),
    ("💡 Contas (luz, água, internet)", "Gasto"), ("💊 Saúde", "Gasto"), ("🍔 Comer fora / delivery", "Gasto"),
    ("🎉 Lazer", "Gasto"), ("🛍️ Compras (roupa, casa)", "Gasto"), ("📚 Educação", "Gasto"),
    ("📱 Assinaturas (streaming, celular)", "Gasto"), ("🎁 Presentes", "Gasto"), ("❓ Outros gastos", "Gasto"),
    ("💼 Salário", "Entrada"), ("✨ Renda extra", "Entrada"), ("↩️ Outras entradas", "Entrada"),
    ("💵 Comprei dólar", "Investimento"), ("🌱 Guardei (caixinha / CDI)", "Investimento"),
]
NC = len(cats); NG = sum(1 for _, t in cats if t == "Gasto")
wl["A1"], wl["B1"] = "Categoria", "Tipo"
for i, (c, t) in enumerate(cats, start=2):
    wl[f"A{i}"], wl[f"B{i}"] = c, t
CAT_RNG = f"{SL}!$A$2:$A${NC+1}"; TIPO_RNG = f"{SL}!$B$2:$B${NC+1}"
wl["D1"] = "Início do mês escolhido"; wl["E1"] = f"=DATE(YEAR({q(S2)}!$I$4),MONTH({q(S2)}!$I$4),1)"
wl["D2"] = "Fim do mês escolhido";    wl["E2"] = "=EOMONTH(E1,0)"
wl["D3"] = "Início do mês atual";     wl["E3"] = "=DATE(YEAR(TODAY()),MONTH(TODAY()),1)"
wl["D4"] = "Fim do mês atual";        wl["E4"] = "=EOMONTH(E3,0)"
wl.sheet_state = "hidden"

# =====================================================================
# 📒 Meus Reais
# =====================================================================
ws = ws2
setup(ws, {"A": 2, "B": 12, "C": 30, "D": 31, "E": 14, "F": 12, "G": 15, "H": 3, "I": 30, "J": 15, "K": 15, "L": 12}, CORAL)
title(ws, "B1:L1", "📒 Meus Reais — tudo o que entrou e saiu",
      "Uma linha para cada dinheiro que entrou ou saiu da sua conta em reais. Escreva só nas células amarelinhas; o resto a planilha calcula.", CORAL)
section(ws, "B4:G4", "✍️ Meus registros", CORAL)
header_row(ws, 5, [("B", "Data"), ("C", "Descrição (o que foi?)"), ("D", "Categoria (escolha na lista ▾)"),
                   ("E", "Valor (R$)"), ("F", "Tipo\n(automático)"), ("G", "Acumulado\n(entrou − gastei)")], CORAL)
for r in range(FIRST, LAST + 1):
    for col, fmt, h in (("B", DATE, "center"), ("C", None, "left"), ("D", None, "left"), ("E", BRL, "right")):
        put(ws, f"{col}{r}", fmt=fmt, h=h, bg=INPUT, border=BOX)
    put(ws, f"F{r}", f'=IF(D{r}="","",IFERROR(INDEX({TIPO_RNG},MATCH(D{r},{CAT_RNG},0)),"?"))',
        color=GRAY, h="center", border=BOX, size=9)
    put(ws, f"G{r}", f'=IF(D{r}="","",SUMIFS($E${FIRST}:E{r},$F${FIRST}:F{r},"Entrada")-SUMIFS($E${FIRST}:E{r},$F${FIRST}:F{r},"Gasto"))',
        fmt=BRL, h="right", border=BOX)
dv = DataValidation(type="list", formula1=CAT_RNG, allow_blank=True,
                    showErrorMessage=True, errorTitle="Categoria", error="Escolha uma categoria da lista ▾")
ws.add_data_validation(dv); dv.add(f"D{FIRST}:D{LAST}")
dvd = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                     showErrorMessage=True, errorTitle="Data", error="Escreva uma data, por exemplo 05/11/2026")
ws.add_data_validation(dvd); dvd.add(f"B{FIRST}:B{LAST}")
dvn = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                     showErrorMessage=True, errorTitle="Valor", error="Escreva o valor sem sinal de menos. A categoria já diz se entrou ou saiu.")
ws.add_data_validation(dvn); dvn.add(f"E{FIRST}:E{LAST}")
zebra(ws, f"F{FIRST}:G{LAST}")
gain_colors(ws, f"G{FIRST}:G{LAST}")

put(ws, "I4", "📅 Mês que quero ver:", bold=True, size=11)
inp(ws, "J4", "=DATE(YEAR(TODAY()),MONTH(TODAY()),1)", fmt='mmmm/yyyy', h="center")
ws["J4"].comment = Comment("Já mostra o mês atual. Para ver outro mês, escreva qualquer data dele (ex: 01/10/2026).", "Planilha")
put(ws, "K4", "← mude para ver outro mês", size=9, color=GRAY, italic=True)
# a aba Listas lê o mês escolhido em I4: aponta para J4
wl["E1"] = f"=DATE(YEAR({q(S2)}!$J$4),MONTH({q(S2)}!$J$4),1)"
section(ws, "I6:K6", "📊 Resumo do mês", NAVY)
rng_m = f'$B:$B,">="&{SL}!$E$1,$B:$B,"<="&{SL}!$E$2'
for r, lab, fml, fmt, note in [
        (7, "⬆️ Entrou", f'=SUMIFS($E:$E,$F:$F,"Entrada",{rng_m})', BRL, "salário e outras entradas"),
        (8, "⬇️ Gastei", f'=SUMIFS($E:$E,$F:$F,"Gasto",{rng_m})', BRL, "tudo o que foi gasto"),
        (9, "🟰 Sobrou (entrou − gastei)", "=J7-J8", BRL, "investimento não é gasto"),
        (10, "💵 Guardei / comprei dólar", f'=SUMIFS($E:$E,$F:$F,"Investimento",{rng_m})', BRL, "sai do que sobrou"),
        (11, "📊 Da minha renda, guardei", "=IF(J7>0,J10/J7,0)", PCT, "meta comum: 10% a 20%")]:
    put(ws, f"I{r}", lab, bold=True, border=BOTTOM)
    put(ws, f"J{r}", fml, fmt=fmt, h="right", bold=True, size=11, border=BOTTOM)
    put(ws, f"K{r}", note, size=8, color=GRAY, italic=True, border=BOTTOM, wrap=True)
    ws.row_dimensions[r].height = 22
put(ws, "I12", "💰 Acumulado em reais (tudo que entrou − tudo que gastei)", bold=True, border=BOTTOM, wrap=True)
put(ws, "J12", f'=SUMIFS($E${FIRST}:$E${LAST},$F${FIRST}:$F${LAST},"Entrada")-SUMIFS($E${FIRST}:$E${LAST},$F${FIRST}:$F${LAST},"Gasto")',
    fmt=BRL, h="right", bold=True, size=12, color=CORAL, border=BOTTOM)
ws.row_dimensions[12].height = 30
gain_colors(ws, "J9:J9")

header_row(ws, 14, [("I", "Categoria"), ("J", "Tipo"), ("K", "Total no mês"), ("L", "% dos gastos")], NAVY)
for i in range(NC):
    r = 15 + i
    put(ws, f"I{r}", f"={SL}!A{i+2}", border=BOX)
    put(ws, f"J{r}", f"={SL}!B{i+2}", color=GRAY, size=9, h="center", border=BOX)
    put(ws, f"K{r}", f"=SUMIFS($E:$E,$D:$D,I{r},{rng_m})", fmt=BRL, h="right", border=BOX)
    put(ws, f"L{r}", f'=IF(AND(J{r}="Gasto",$J$8>0),K{r}/$J$8,"")', fmt='0%', h="center", border=BOX, color=GRAY)
zebra(ws, f"I15:L{14+NC}")
ch = BarChart(); ch.type = "bar"; ch.style = 10; ch.title = "Onde gastei neste mês"
ch.add_data(Reference(ws, min_col=11, min_row=15, max_row=14 + NG), titles_from_data=False)
ch.set_categories(Reference(ws, min_col=9, min_row=15, max_row=14 + NG))
ch.legend = None; ch.y_axis.numFmt = '"R$" #,##0'; ch.y_axis.majorGridlines = None
ch.x_axis.scaling.orientation = "maxMin"
ch.series[0].graphicalProperties.solidFill = CORAL
ch.series[0].graphicalProperties.line.solidFill = CORAL
ch.height = 10; ch.width = 16
ch.x_axis.delete = False; ch.y_axis.delete = False
ws.add_chart(ch, f"I{16 + NC}")
ws.freeze_panes = "A6"

# =====================================================================
# 💵 Meus Dólares
# =====================================================================
ws = ws4
setup(ws, {"A": 2, "B": 12, "C": 16, "D": 15, "E": 14, "F": 14, "G": 12, "H": 13, "I": 14, "J": 14,
           "K": 14, "L": 15, "M": 15, "N": 3, "O": 46, "P": 17}, BLUE)
title(ws, "B1:P1", "💵 Meus Dólares — minha reserva em moeda forte",
      "Copie os dados do comprovante do Wise. O dólar de hoje e o dólar do dia de cada compra vêm sozinhos (Google Finance); a planilha separa o que foi variação do dólar e o que foi taxa.", BLUE)
section(ws, "B4:G4", "✍️ Do comprovante (Wise → Transaction details)", BLUE)
section(ws, "H4:M4", "🤖 A planilha calcula", NAVY)
header_row(ws, 5, [("B", "Data\n(Completed)"), ("C", "Onde comprei"), ("D", "Saiu da conta R$\n(Converted from)"),
                   ("E", "Recebi US$\n(Converted to)"), ("F", "Câmbio\n(Exchange rate)\nopcional"), ("G", "Taxas R$\n(Fee)\nopcional")], BLUE)
header_row(ws, 5, [("H", "Custo por dólar\n(VET)"), ("I", "Dólar de mercado\nnesse dia"), ("J", "📈 Variação\ndo dólar"),
                   ("K", "💸 Custo\ndas taxas"), ("L", "Vale hoje (R$)"), ("M", "🟰 Resultado")], NAVY)
ws.row_dimensions[5].height = 48
COT = "$P$5"
for r in range(FIRST, LAST + 1):
    for col, fmt, h in (("B", DATE, "center"), ("C", None, "left"), ("D", BRL, "right"), ("E", USD, "right"),
                        ("F", '"R$" 0.0000', "right"), ("G", BRL, "right")):
        put(ws, f"{col}{r}", fmt=fmt, h=h, bg=INPUT, border=BOX)
    gf = f'GOOGLEFINANCE("CURRENCY:USDBRL","price",B{r}-7,B{r})'
    base = f'IF(N(F{r})>0,F{r},I{r})'  # câmbio do comprovante; sem ele, o dólar de mercado do dia
    vazio = f'OR(D{r}="",E{r}="",N(E{r})=0)'
    put(ws, f"H{r}", f'=IF({vazio},"",D{r}/E{r})', fmt='"R$" 0.0000', h="right", color=GRAY, border=BOX)
    put(ws, f"I{r}", f'=IF(B{r}="","",IFERROR(INDEX({gf},ROWS({gf}),2),""))', fmt='"R$" 0.0000', h="right", color=GRAY, border=BOX)
    put(ws, f"J{r}", f'=IF(OR({vazio},{base}=""),"",E{r}*({COT}-{base}))', fmt=BRL, h="right", border=BOX)
    put(ws, f"K{r}", f'=IF(OR({vazio},{base}=""),"",-(D{r}-E{r}*{base}))', fmt=BRL, h="right", border=BOX)
    put(ws, f"L{r}", f'=IF({vazio},"",E{r}*{COT})', fmt=BRL, h="right", border=BOX)
    put(ws, f"M{r}", f'=IF({vazio},"",L{r}-D{r})', fmt=BRL, h="right", bold=True, border=BOX)
dvd3 = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                      showErrorMessage=True, errorTitle="Data", error="Escreva uma data, por exemplo 28/10/2026")
ws.add_data_validation(dvd3); dvd3.add(f"B{FIRST}:B{LAST}")
# Comprovantes Wise #6365993574 e #6453615175
for i, (d, onde, brl, usd, cambio, fee) in enumerate([
        (dt.date(2026, 10, 28), "Wise", 457, 81.87, 5.3544, 18.62),
        (dt.date(2026, 11, 9), "Wise", 600, 104.40, 5.5174, 23.97)]):
    r = FIRST + i
    ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"], ws[f"E{r}"], ws[f"F{r}"], ws[f"G{r}"] = d, onde, brl, usd, cambio, fee
zebra(ws, f"H{FIRST}:M{LAST}")
gain_colors(ws, f"J{FIRST}:M{LAST}")

section(ws, "O4:P4", "⚙️ Configuração", NAVY)
put(ws, "O5", "📡 Dólar agora (Google Finance, automático)", bold=True, border=BOTTOM)
put(ws, "P5", '=IFERROR(GOOGLEFINANCE("CURRENCY:USDBRL"),5.5)', fmt='"R$" 0.0000', h="right", bold=True, color=BLUE, border=BOTTOM)
ws["P5"].comment = Comment("Atualiza sozinho (pode ter alguns minutos de atraso).", "Planilha")
put(ws, "O6", "✍️ Minha meta em dólares", bold=True, border=BOTTOM)
inp(ws, "P6", 1000, fmt=USD)

section(ws, "O8:P8", "📊 Meus dólares hoje", BLUE)
rng = lambda c: f"{c}{FIRST}:{c}{LAST}"
for r, lab, fml, fmt, bold in [
        (9, "💵 Total de dólares que tenho", f"=SUM({rng('E')})", USD, True),
        (10, "Quanto saiu da minha conta por eles", f"=SUM({rng('D')})", BRL, False),
        (11, "Custo médio por dólar (VET médio)", "=IF(P9>0,P10/P9,0)", '"R$" 0.0000', False),
        (12, "💰 Quanto valem hoje em reais", f"=P9*{COT}", BRL, True),
        (13, "📈 Variação do dólar desde as compras", f"=SUM({rng('J')})", BRL, False),
        (14, "💸 Custo das taxas (tarifa, IOF, spread)", f"=SUM({rng('K')})", BRL, False),
        (15, "🟰 Resultado (valem hoje − saiu da conta)", "=P12-P10", BRL, True),
        (16, "Em porcentagem", "=IF(P10>0,P15/P10,0)", PCT, False)]:
    put(ws, f"O{r}", lab, bold=bold, border=BOTTOM)
    put(ws, f"P{r}", fml, fmt=fmt, h="right", bold=bold, size=12 if r in (9, 15) else 10,
        color=BLUE if r == 9 else INK, border=BOTTOM)
    ws.row_dimensions[r].height = 21
gain_colors(ws, "P13:P16")

section(ws, "O18:P18", "🎯 Minha meta", GOLD)
put(ws, "O19", "Quanto da meta já juntei", bold=True, border=BOTTOM)
put(ws, "P19", "=IF(P6>0,P9/P6,0)", fmt='0%', h="right", bold=True, size=12, color=GOLD, border=BOTTOM)
merge(ws, "O20:P20", '=REPT("█",MIN(20,ROUND(P19*20,0)))&REPT("░",20-MIN(20,ROUND(P19*20,0)))',
      size=14, color=GOLD, h="center")
ws.row_dimensions[20].height = 24
put(ws, "O21", "Falta para chegar na meta", border=BOTTOM)
put(ws, "P21", "=MAX(0,P6-P9)", fmt=USD, h="right", border=BOTTOM)

merge(ws, "O23:P32",
      "🧾 Onde achar no Wise: abra a transação → Transaction details.\n"
      "Converted from = quanto saiu da conta (R$) · Converted to = dólares recebidos · "
      "Exchange rate = câmbio · Fee = taxas · Completed = data.\n\n"
      "💸 Custo das taxas: quanto você pagou acima do câmbio (tarifa, IOF e spread). "
      "📈 Variação: quanto o dólar subiu ou caiu desde a compra. Resultado = variação − taxas.\n\n"
      "📉📈 O dólar sobe e desce todo dia. Se hoje estiver mais barato do que você pagou, aparece em vermelho, "
      "mas você só perde de verdade se vender. Comprar um pouco todo mês ajuda a fazer uma média.\n\n"
      "💡 Também anote a compra no 📒 Meus Reais (categoria 💵 Comprei dólar), porque o dinheiro saiu da sua conta em reais.",
      size=9, bg=PASTEL[BLUE], wrap=True, v="top")
ws.freeze_panes = "C6"

# =====================================================================
# 🏠 Resumo
# =====================================================================
ws = ws1
setup(ws, {"A": 2, "B": 24, "C": 18, "D": 24, "E": 18, "F": 24, "G": 18}, NAVY)
merge(ws, "B1:G1", "🏠 Meu dinheiro hoje", size=22, bold=True, color=NAVY)
ws.row_dimensions[1].height = 40
put(ws, "B2", "Atualizado em:", color=GRAY, italic=True)
put(ws, "C2", "=TODAY()", fmt=DATE, color=GRAY, italic=True, h="left")
DOL = q(S4); MR = q(S2)

def card(r, c1, c2, label, value, fmt, color, sub_label=None, sub_value=None, sub_fmt=None):
    bg = PASTEL[color]
    merge(ws, f"{c1}{r}:{c2}{r}", label, size=10, bold=True, color=WHITE, bg=color)
    merge(ws, f"{c1}{r+1}:{c2}{r+1}", value, size=20, bold=True, color=color, bg=bg, fmt=fmt, h="center")
    put(ws, f"{c1}{r+2}", sub_label, size=9, color=GRAY, bg=bg, italic=True)
    put(ws, f"{c2}{r+2}", sub_value, size=10, bold=True, color=INK, bg=bg, fmt=sub_fmt, h="right")
    ws.row_dimensions[r].height = 22; ws.row_dimensions[r + 1].height = 40; ws.row_dimensions[r + 2].height = 20

card(4, "B", "C", "💰 Acumulado em reais", f"={MR}!J12", BRL, CORAL, "entrou − gastei", None)
card(4, "D", "E", "💵 Tenho em dólares", f"={DOL}!P9", USD, BLUE, "valem hoje ≈", f"={DOL}!P12", BRL)
card(4, "F", "G", "🟰 Resultado do dólar", f"={DOL}!P15", BRL, PURPLE, "em %:", f"={DOL}!P16", PCT)
card(8, "B", "C", "📡 Dólar agora", f"={DOL}!P5", '"R$" 0.0000', NAVY, "meu custo médio:", f"={DOL}!P11", '"R$" 0.0000')
card(8, "D", "E", "💸 Já paguei de taxas", f"=-{DOL}!P14", BRL, GOLD, "variação do dólar:", f"={DOL}!P13", BRL)
card(8, "F", "G", "🎯 Meta de dólares", f"={DOL}!P19", '0%', TEAL, "falta:", f"={DOL}!P21", USD)
gain_colors(ws, "F5:F5")
gain_colors(ws, "B5:B5")

section(ws, "B12:G12", "📒 Este mês (da aba Meus Reais)", CORAL)
cur = f'{MR}!$B:$B,">="&{SL}!$E$3,{MR}!$B:$B,"<="&{SL}!$E$4'
for a, b, r, lab, fml, fmt in [
        ("B", "C", 13, "⬆️ Entrou", f'=SUMIFS({MR}!$E:$E,{MR}!$F:$F,"Entrada",{cur})', BRL),
        ("D", "E", 13, "⬇️ Gastei", f'=SUMIFS({MR}!$E:$E,{MR}!$F:$F,"Gasto",{cur})', BRL),
        ("F", "G", 13, "💵 Guardei / dólar", f'=SUMIFS({MR}!$E:$E,{MR}!$F:$F,"Investimento",{cur})', BRL),
        ("B", "C", 14, "🟰 Sobrou no mês", "=C13-E13", BRL),
        ("D", "E", 14, "📊 Da renda, guardei", "=IF(C13>0,G13/C13,0)", '0%')]:
    put(ws, f"{a}{r}", lab, bold=True, bg=PASTEL[CORAL], border=BOX)
    put(ws, f"{b}{r}", fml, fmt=fmt, bold=True, size=12, h="right", bg=PASTEL[CORAL], border=BOX)
    ws.row_dimensions[r].height = 26
put(ws, "F14", None, bg=PASTEL[CORAL], border=BOX); put(ws, "G14", None, bg=PASTEL[CORAL], border=BOX)
gain_colors(ws, "C14:C14")

# =====================================================================
# 👋 Comece aqui
# =====================================================================
ws = ws0
setup(ws, {"A": 2, "B": 30, "C": 70}, GOLD)
put(ws, "B3", "✍️ Seu nome:", bold=True, size=11, h="right")
inp(ws, "C3", "", h="left", size=11)
merge(ws, "B1:C1", '="Olá"&IF(C3="","",", "&C3)&"! 👋 Seus reais e seus dólares"', size=20, bold=True, color=NAVY)
ws.row_dimensions[1].height = 40
merge(ws, "B4:C4", "Simples: uma aba para o que entra e sai em reais, outra para seus dólares. O dólar se atualiza sozinho.",
      size=10, color=GRAY, italic=True, wrap=True)
r = 6
section(ws, f"B{r}:C{r}", "🟨 A única regra", GOLD); r += 1
put(ws, f"B{r}", "Célula amarelinha", bg=INPUT, bold=True, h="center", border=BOX)
put(ws, f"C{r}", "👉 Você escreve aqui. Todo o resto a planilha calcula sozinha. Não apague as células brancas: elas têm as contas.", wrap=True, border=BOX)
ws.row_dimensions[r].height = 30; r += 1
put(ws, f"B{r}", "Já anotado", bold=True, h="center", border=BOX)
put(ws, f"C{r}", "Sua compra de US$ 81,87 no Wise (28/10/2026) já está no 💵 Meus Dólares. No 📒 Meus Reais, anote tudo o que entrou e saiu.", wrap=True, border=BOX)
ws.row_dimensions[r].height = 30; r += 2

section(ws, f"B{r}:C{r}", "🗂️ As abas (lá embaixo da tela)", NAVY); r += 1
for name, desc, col in [
        (S1, "O resumo: saldo em reais, quantos dólares você tem, quanto valem hoje e o resultado.", NAVY),
        (S2, "Tudo o que entra (salário) e sai (gastos, compra de dólar) em reais. Mostra o saldo, quanto sobrou no mês e onde você mais gasta.", CORAL),
        (S4, "Cada compra de dólar, copiando o comprovante do Wise. Mostra quanto valem hoje, quanto o dólar variou e quanto foi de taxa.", BLUE)]:
    put(ws, f"B{r}", name, bold=True, color=WHITE, bg=col, border=BOX)
    put(ws, f"C{r}", desc, wrap=True, border=BOX, bg=PASTEL[col])
    ws.row_dimensions[r].height = 32; r += 1
r += 1

section(ws, f"B{r}:C{r}", "📆 Rotina", TEAL); r += 1
for a, b in [("Quando receber ou gastar", "Anote no 📒 Meus Reais (data, descrição, categoria, valor)."),
             ("Quando comprar dólar", "Anote no 📒 Meus Reais (categoria 💵 Comprei dólar) E no 💵 Meus Dólares, copiando o comprovante do Wise."),
             ("Quando quiser", "Olhe o 🏠 Resumo. O dólar se atualiza sozinho. 🎉")]:
    put(ws, f"B{r}", a, bold=True, border=BOX, wrap=True)
    put(ws, f"C{r}", b, wrap=True, border=BOX)
    ws.row_dimensions[r].height = 30; r += 1
r += 1

section(ws, f"B{r}:C{r}", "📚 Dicionário sem complicação", PURPLE); r += 1
for a, b in [
        ("Cotação / câmbio", "Quantos reais custa 1 dólar. No Wise aparece como Exchange rate (ex: 1 USD = 5,3544 BRL)."),
        ("Taxas (Fee)", "O que o Wise cobra pela conversão, já com o IOF. Já está incluído no valor que saiu da conta."),
        ("VET", "Valor Efetivo Total: quanto cada dólar te custou com tudo incluído (câmbio + taxas). É o 'Custo por dólar'."),
        ("Spread", "A diferença entre o câmbio do app e o dólar de mercado. É mais um custo, às vezes escondido."),
        ("Variação do dólar", "Quanto o dólar subiu ou caiu desde o dia da compra. Sobe = seus dólares valem mais em reais."),
        ("Resultado", "Quanto seus dólares valem hoje em reais menos quanto saiu da sua conta para comprá-los."),
        ("Acumulado em reais", "Tudo o que entrou menos tudo o que você gastou. Investir (dólar, caixinha) não é gasto: o dinheiro continua seu, só mudou de lugar.")]:
    put(ws, f"B{r}", a, bold=True, color=PURPLE, border=BOX, v="top")
    put(ws, f"C{r}", b, wrap=True, border=BOX, v="top")
    ws.row_dimensions[r].height = 30; r += 1
r += 1
merge(ws, f"B{r}:C{r+1}",
      "ℹ️ O dólar vem do Google Finance (pode ter alguns minutos de atraso) e precisa de internet. "
      "O valor oficial é sempre o do app do Wise. Esta planilha não é recomendação de investimento.",
      size=9, color=GRAY, italic=True, wrap=True, v="top")

wb._named_styles["Normal"].font = Font(name=FONT, size=10)
wb.active = 0
wb.save(OUT)
print("ok", OUT)
