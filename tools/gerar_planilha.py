import sys, datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule
from openpyxl.chart import BarChart, PieChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment

OUT = sys.argv[1]
TEMPLATE = "--template" in sys.argv

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
    p = ws.protection
    p.sheet = True
    p.formatColumns = False
    p.formatRows = False
    p.formatCells = False

def zebra(ws, rng, color="F7F8FA"):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"MOD(ROW(),2)=0"], fill=fill(color)))

def gain_colors(ws, rng):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(ISNUMBER({first}),{first}>0)'], font=Font(name=FONT, color="1B8A5A", bold=True)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'AND(ISNUMBER({first}),{first}<0)'], font=Font(name=FONT, color="C0392B", bold=True)))

def ir_rate(days_expr):
    return f"IF({days_expr}<=180,0.225,IF({days_expr}<=360,0.2,IF({days_expr}<=720,0.175,0.15)))"

S0 = "👋 Comece aqui"; S1 = "🏠 Resumo"; S2 = "📒 Meu Mês"; S3 = "🌱 Meu CDI"
S4 = "💵 Meus Dólares"; S5 = "🔮 Simulador"; SL = "Listas"
q = lambda s: f"'{s}'"

N = 400                      # linhas disponíveis nos registros
FIRST = 6; LAST = FIRST + N - 1

wb = Workbook()
ws0 = wb.active; ws0.title = S0
ws1 = wb.create_sheet(S1); ws2 = wb.create_sheet(S2); ws3 = wb.create_sheet(S3)
ws4 = wb.create_sheet(S4); ws5 = wb.create_sheet(S5); wl = wb.create_sheet(SL)

# =====================================================================
# Listas (oculta): categorias + datas do mês escolhido
# =====================================================================
cats = [
    ("🏠 Moradia (aluguel, condomínio)", "Gasto"), ("🛒 Mercado", "Gasto"), ("🚌 Transporte", "Gasto"),
    ("💡 Contas (luz, água, internet)", "Gasto"), ("💊 Saúde", "Gasto"), ("🍔 Comer fora / delivery", "Gasto"),
    ("🎉 Lazer", "Gasto"), ("🛍️ Compras (roupa, casa)", "Gasto"), ("📚 Educação", "Gasto"),
    ("📱 Assinaturas (streaming, celular)", "Gasto"), ("🎁 Presentes", "Gasto"), ("❓ Outros gastos", "Gasto"),
    ("💼 Salário", "Entrada"), ("✨ Renda extra", "Entrada"), ("↩️ Outras entradas", "Entrada"),
    ("🌱 Guardei no CDI", "Investimento"), ("💵 Comprei dólar", "Investimento"),
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
wl["D6"] = "O que fiz (CDI)"; wl["D7"], wl["D8"] = "Guardei", "Resgatei"
wl.sheet_state = "hidden"

# =====================================================================
# 📒 Meu Mês
# =====================================================================
ws = ws2
setup(ws, {"A": 2, "B": 13, "C": 32, "D": 33, "E": 15, "F": 13, "G": 3, "H": 34, "I": 15, "J": 15, "K": 12}, CORAL)
title(ws, "B1:K1", "📒 Meu Mês — para onde vai meu dinheiro",
      "Anote aqui tudo o que entra e tudo o que sai. Escreva só nas células amarelinhas; a planilha faz as contas sozinha.", CORAL)
section(ws, "B4:F4", "✍️ Meus registros (uma linha para cada entrada ou gasto)", CORAL)
header_row(ws, 5, [("B", "Data"), ("C", "Descrição (o que foi?)"), ("D", "Categoria (escolha na lista ▾)"),
                   ("E", "Valor (R$)"), ("F", "Tipo\n(automático)")], CORAL)
for r in range(FIRST, LAST + 1):
    for col, fmt, h in (("B", DATE, "center"), ("C", None, "left"), ("D", None, "left"), ("E", BRL, "right")):
        c = put(ws, f"{col}{r}", fmt=fmt, h=h, bg=INPUT, border=BOX)
    put(ws, f"F{r}", f'=IF(D{r}="","",IFERROR(INDEX({TIPO_RNG},MATCH(D{r},{CAT_RNG},0)),"?"))',
        color=GRAY, h="center", border=BOX, size=9)
unlock(ws, f"B{FIRST}:E{LAST}")
dv = DataValidation(type="list", formula1=CAT_RNG, allow_blank=True,
                    showErrorMessage=True, errorTitle="Categoria", error="Escolha uma categoria da lista ▾")
ws.add_data_validation(dv); dv.add(f"D{FIRST}:D{LAST}")
dvd = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                     showErrorMessage=True, errorTitle="Data", error="Escreva uma data, por exemplo 05/10/2026")
ws.add_data_validation(dvd); dvd.add(f"B{FIRST}:B{LAST}")
dvn = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True,
                     showErrorMessage=True, errorTitle="Valor", error="Escreva o valor sem sinal de menos. A categoria já diz se é entrada ou gasto.")
ws.add_data_validation(dvn); dvn.add(f"E{FIRST}:E{LAST}")

examples = []
for i, (d, desc, cat, val) in enumerate(examples):
    r = FIRST + i
    ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"], ws[f"E{r}"] = d, desc, cat, val
zebra(ws, f"F{FIRST}:F{LAST}")

# painel da direita
put(ws, "H4", "📅 Mês que quero ver:", bold=True, size=11)
inp(ws, "I4", "=DATE(YEAR(TODAY()),MONTH(TODAY()),1)", fmt='mmmm/yyyy', h="center")
ws["I4"].comment = Comment("Já mostra o mês atual. Para ver outro mês, escreva qualquer data dele (ex: 01/09/2026).", "Planilha")
put(ws, "J4", "← mude para ver outro mês", size=9, color=GRAY, italic=True)
section(ws, "H6:J6", "📊 Resumo do mês", NAVY)
rng_m = f'$B:$B,">="&{SL}!$E$1,$B:$B,"<="&{SL}!$E$2'
rows = [
    (7, "⬆️ Entrou", f'=SUMIFS($E:$E,$F:$F,"Entrada",{rng_m})', BRL, "salário e outras entradas"),
    (8, "⬇️ Gastei", f'=SUMIFS($E:$E,$F:$F,"Gasto",{rng_m})', BRL, "tudo o que foi gasto"),
    (9, "💰 Guardei / investi", f'=SUMIFS($E:$E,$F:$F,"Investimento",{rng_m})', BRL, "CDI + dólares"),
    (10, "🟰 Sobrou na conta", "=I7-I8-I9", BRL, "entrou − gastei − guardei"),
    (11, "📊 Da minha renda, guardei", "=IF(I7>0,I9/I7,0)", PCT, "meta comum: 10% a 20%"),
]
for r, lab, fml, fmt, note in rows:
    put(ws, f"H{r}", lab, bold=True, border=BOTTOM)
    put(ws, f"I{r}", fml, fmt=fmt, h="right", bold=True, size=11, border=BOTTOM)
    put(ws, f"J{r}", note, size=8, color=GRAY, italic=True, border=BOTTOM, wrap=True)
    ws.row_dimensions[r].height = 22
gain_colors(ws, "I10:I10")

header_row(ws, 13, [("H", "Categoria"), ("I", "Tipo"), ("J", "Total no mês"), ("K", "% dos gastos")], NAVY)
for i in range(NC):
    r = 14 + i
    put(ws, f"H{r}", f"={SL}!A{i+2}", border=BOX)
    put(ws, f"I{r}", f"={SL}!B{i+2}", color=GRAY, size=9, h="center", border=BOX)
    put(ws, f"J{r}", f"=SUMIFS($E:$E,$D:$D,H{r},{rng_m})", fmt=BRL, h="right", border=BOX)
    put(ws, f"K{r}", f'=IF(AND(I{r}="Gasto",$I$8>0),J{r}/$I$8,"")', fmt='0%', h="center", border=BOX, color=GRAY)
zebra(ws, f"H14:K{13+NC}")

ch = BarChart(); ch.type = "bar"; ch.style = 10
ch.title = "Onde gastei neste mês"
ch.add_data(Reference(ws, min_col=10, min_row=14, max_row=13 + NG), titles_from_data=False)
ch.set_categories(Reference(ws, min_col=8, min_row=14, max_row=13 + NG))
ch.legend = None; ch.y_axis.numFmt = '"R$" #,##0'; ch.y_axis.majorGridlines = None
ch.x_axis.scaling.orientation = "maxMin"
ch.series[0].graphicalProperties.solidFill = CORAL
ch.series[0].graphicalProperties.line.solidFill = CORAL
ch.height = 10; ch.width = 16
ch.x_axis.delete = False; ch.y_axis.delete = True
ch.dataLabels = DataLabelList(); ch.dataLabels.showVal = True; ch.dataLabels.showSerName = False; ch.dataLabels.showCatName = False; ch.dataLabels.showLegendKey = False; ch.dataLabels.numFmt = '"R$" #,##0'
ws.add_chart(ch, f"H{15 + NC}")
ws.freeze_panes = "A6"
protect(ws)

# =====================================================================
# 🌱 Meu CDI
# =====================================================================
ws = ws3
setup(ws, {"A": 2, "B": 13, "C": 14, "D": 15, "E": 40, "F": 13, "G": 16, "H": 15, "I": 3, "J": 46, "K": 17, "M": 10}, TEAL)
title(ws, "B1:K1", "🌱 Meu CDI — meu dinheiro rendendo",
      "Cada vez que você guardar ou tirar dinheiro da caixinha/CDB, anote uma linha aqui. A planilha estima quanto ele já rendeu.", TEAL)
section(ws, "B4:H4", "✍️ O que eu guardei e resgatei", TEAL)
header_row(ws, 5, [("B", "Data"), ("C", "O que fiz\n(lista ▾)"), ("D", "Valor (R$)"), ("E", "Anotação (opcional)"),
                   ("F", "Dias úteis rendendo"), ("G", "Vale hoje\n(estimativa)"), ("H", "Já rendeu")], TEAL)
put(ws, "M5", "IR (aux)", size=8, color=GRAY)
for r in range(FIRST, LAST + 1):
    for col, fmt, h in (("B", DATE, "center"), ("C", None, "center"), ("D", BRL, "right"), ("E", None, "left")):
        put(ws, f"{col}{r}", fmt=fmt, h=h, bg=INPUT, border=BOX)
    sign = f'IF(C{r}="Resgatei",-1,1)'
    put(ws, f"F{r}", f'=IF(OR(B{r}="",D{r}=""),"",MAX(0,NETWORKDAYS(B{r},TODAY())-1))', h="center", color=GRAY, border=BOX)
    put(ws, f"G{r}", f'=IF(F{r}="","",{sign}*D{r}*(1+$K$10)^F{r})', fmt=BRL, h="right", border=BOX)
    put(ws, f"H{r}", f'=IF(F{r}="","",G{r}-{sign}*D{r})', fmt=BRL, h="right", border=BOX)
    put(ws, f"M{r}", f'=IF(F{r}="","",H{r}*{ir_rate(f"(TODAY()-B{r})")})', fmt=BRL, size=8, color=GRAY)
unlock(ws, f"B{FIRST}:E{LAST}")
ws.column_dimensions["M"].hidden = True
dvc = DataValidation(type="list", formula1=f"{SL}!$D$7:$D$8", allow_blank=True,
                     showErrorMessage=True, errorTitle="O que fiz", error="Escolha Guardei ou Resgatei")
ws.add_data_validation(dvc); dvc.add(f"C{FIRST}:C{LAST}")
dvd2 = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                      showErrorMessage=True, errorTitle="Data", error="Escreva uma data, por exemplo 05/10/2026")
ws.add_data_validation(dvd2); dvd2.add(f"B{FIRST}:B{LAST}")
for i, (d, what, val, note) in enumerate([] if TEMPLATE else [
        (dt.date(2026, 10, 26), "Guardei", 796, "Meu primeiro depósito! 🎉")]):
    r = FIRST + i
    ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"], ws[f"E{r}"] = d, what, val, note
zebra(ws, f"F{FIRST}:H{LAST}")
gain_colors(ws, f"H{FIRST}:H{LAST}")

section(ws, "J4:K4", "⚙️ Quanto meu dinheiro rende", NAVY)
put(ws, "J5", "CDI ao ano (✍️ atualize de vez em quando)", bold=True, border=BOTTOM)
inp(ws, "K5", 0.1365, fmt=PCT)
ws["K5"].comment = Comment("Valor de out/2026: Selic over ≈ 13,65% ao ano. O CDI anda quase igual à Selic. "
                           "Para atualizar, pesquise 'CDI hoje' no Google.", "Planilha")
put(ws, "J6", "Quanto do CDI o banco paga (Nubank = 100%)", bold=True, border=BOTTOM)
inp(ws, "K6", 1.0, fmt='0%')
for r, lab, fml, fmt in [
        (7, "➡️ Então meu dinheiro rende por ano", "=K5*K6", PCT),
        (8, "➡️ Isso dá mais ou menos por mês", "=(1+K7)^(1/12)-1", PCT),
        (9, "➡️ A cada R$ 1.000 guardados, ganho por mês", "=1000*K8", BRL),
        (10, "rendimento por dia útil (usado nas contas)", "=(1+K7)^(1/252)-1", '0.0000%')]:
    small = r == 10
    put(ws, f"J{r}", lab, size=8 if small else 10, color=GRAY if small else INK, italic=small, border=BOTTOM)
    put(ws, f"K{r}", fml, fmt=fmt, h="right", bold=not small, size=8 if small else 10,
        color=GRAY if small else TEAL, border=BOTTOM)

section(ws, "J12:K12", "📊 Meu CDI hoje", TEAL)
put(ws, "J13", "Quanto coloquei do meu bolso (guardei − resgatei)", border=BOTTOM)
put(ws, "K13", f'=SUMIFS(D{FIRST}:D{LAST},C{FIRST}:C{LAST},"<>Resgatei")-SUMIFS(D{FIRST}:D{LAST},C{FIRST}:C{LAST},"Resgatei")', fmt=BRL, h="right", border=BOTTOM)
put(ws, "J14", "Quanto deve ter hoje (estimativa da planilha)", border=BOTTOM)
put(ws, "K14", f"=SUM(G{FIRST}:G{LAST})", fmt=BRL, h="right", border=BOTTOM)
put(ws, "J15", "✍️ Saldo que aparece no app (opcional, é o valor real)", bold=True, border=BOTTOM)
inp(ws, "K15", None, fmt=BRL)
ws["K15"].comment = Comment("Se preencher, a planilha usa este valor (o real do app). Se deixar vazio, usa a estimativa.", "Planilha")
put(ws, "J16", "✅ Saldo que a planilha vai usar", bold=True, border=BOTTOM)
put(ws, "K16", '=IF(K15="",K14,K15)', fmt=BRL, h="right", bold=True, size=12, color=TEAL, border=BOTTOM)
put(ws, "J17", "🎉 Quanto o CDI já me deu (rendimento)", bold=True, border=BOTTOM)
put(ws, "K17", "=K16-K13", fmt=BRL, h="right", bold=True, border=BOTTOM)
put(ws, "J18", "🧾 Imposto (IR) se eu resgatar tudo hoje (aprox.)", border=BOTTOM)
put(ws, "K18", f"=MAX(0,SUM(M{FIRST}:M{LAST}))", fmt=BRL, h="right", border=BOTTOM)
put(ws, "J19", "🌱 O que cairia na minha conta se resgatar tudo", bold=True, border=BOTTOM)
put(ws, "K19", "=K16-K18", fmt=BRL, h="right", bold=True, border=BOTTOM)
gain_colors(ws, "K17:K17")
for r in range(13, 20):
    ws.row_dimensions[r].height = 21

section(ws, "J21:K21", "🧾 Como funciona o imposto no CDI", GOLD)
for i, (a, b) in enumerate([("Dinheiro guardado há até 6 meses (180 dias)", 0.225),
                            ("De 6 meses a 1 ano (181 a 360 dias)", 0.20),
                            ("De 1 a 2 anos (361 a 720 dias)", 0.175),
                            ("Mais de 2 anos (acima de 720 dias)", 0.15)]):
    put(ws, f"J{22+i}", a, border=BOX); put(ws, f"K{22+i}", b, fmt='0.0%', h="center", bold=True, border=BOX)
merge(ws, "J26:K29",
      "👉 O imposto é cobrado SÓ sobre o que rendeu, nunca sobre o que você colocou. "
      "O banco já desconta sozinho na hora do resgate, você não precisa fazer nada. "
      "Quanto mais tempo o dinheiro fica, menos imposto. "
      "Se tirar antes de 30 dias, também tem IOF (outro imposto pequeno, só sobre o rendimento).",
      size=9, color=INK, bg=PASTEL[GOLD], wrap=True, v="top")
ws.freeze_panes = "A6"
protect(ws)

# =====================================================================
# 💵 Meus Dólares
# =====================================================================
ws = ws4
setup(ws, {"A": 2, "B": 13, "C": 32, "D": 15, "E": 15, "F": 15, "G": 16, "H": 16, "I": 3, "J": 44, "K": 17}, BLUE)
title(ws, "B1:K1", "💵 Meus Dólares — minha reserva em moeda forte",
      "Cada vez que comprar dólar, anote quanto saiu da sua conta em reais e quantos dólares você recebeu. A planilha calcula o resto.", BLUE)
section(ws, "B4:H4", "✍️ Minhas compras de dólar", BLUE)
header_row(ws, 5, [("B", "Data"), ("C", "Onde comprei\n(Wise, Nomad, banco...)"), ("D", "Paguei (R$)\ncom taxas e IOF"),
                   ("E", "Recebi (US$)"), ("F", "Cotação que paguei"), ("G", "Vale hoje (R$)"), ("H", "Ganhei / perdi (R$)")], BLUE)
for r in range(FIRST, LAST + 1):
    for col, fmt, h in (("B", DATE, "center"), ("C", None, "left"), ("D", BRL, "right"), ("E", USD, "right")):
        put(ws, f"{col}{r}", fmt=fmt, h=h, bg=INPUT, border=BOX)
    put(ws, f"F{r}", f'=IF(OR(D{r}="",E{r}="",E{r}=0),"",D{r}/E{r})', fmt='"R$" 0.0000', h="right", color=GRAY, border=BOX)
    put(ws, f"G{r}", f'=IF(E{r}="","",E{r}*$K$5)', fmt=BRL, h="right", border=BOX)
    put(ws, f"H{r}", f'=IF(OR(D{r}="",E{r}=""),"",G{r}-D{r})', fmt=BRL, h="right", border=BOX)
unlock(ws, f"B{FIRST}:E{LAST}")
dvd3 = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                      showErrorMessage=True, errorTitle="Data", error="Escreva uma data, por exemplo 05/10/2026")
ws.add_data_validation(dvd3); dvd3.add(f"B{FIRST}:B{LAST}")
for i, (d, where, brl, usd) in enumerate([]):
    r = FIRST + i
    ws[f"B{r}"], ws[f"C{r}"], ws[f"D{r}"], ws[f"E{r}"] = d, where, brl, usd
zebra(ws, f"F{FIRST}:H{LAST}")
gain_colors(ws, f"H{FIRST}:H{LAST}")

section(ws, "J4:K4", "⚙️ Configuração", NAVY)
put(ws, "J5", "✍️ Cotação do dólar hoje (R$ por US$ 1)", bold=True, border=BOTTOM)
inp(ws, "K5", 5.00, fmt='"R$" 0.00')
ws["K5"].comment = Comment("Pesquise 'dólar hoje' no Google ou veja no app onde você compra. "
                           "Valor de 26/10/2026: ≈ R$ 5,00. Atualize uma vez por mês, já está ótimo.", "Planilha")
put(ws, "J6", "✍️ Data dessa cotação", bold=True, border=BOTTOM)
inp(ws, "K6", dt.date(2026, 10, 26), fmt=DATE)
put(ws, "J7", "✍️ Minha meta em dólares", bold=True, border=BOTTOM)
inp(ws, "K7", 1000, fmt=USD)

section(ws, "J9:K9", "📊 Meus dólares hoje", BLUE)
for r, lab, fml, fmt, bold in [
        (10, "💵 Total de dólares que tenho", f"=SUM(E{FIRST}:E{LAST})", USD, True),
        (11, "Quanto paguei por eles em reais", f"=SUM(D{FIRST}:D{LAST})", BRL, False),
        (12, "Cotação média que paguei", "=IF(K10>0,K11/K10,0)", '"R$" 0.0000', False),
        (13, "💰 Quanto valem hoje em reais", "=K10*K5", BRL, True),
        (14, "Ganhei ou perdi com a cotação", "=K13-K11", BRL, True),
        (15, "Em porcentagem", "=IF(K11>0,K14/K11,0)", PCT, False)]:
    put(ws, f"J{r}", lab, bold=bold, border=BOTTOM)
    put(ws, f"K{r}", fml, fmt=fmt, h="right", bold=bold, size=12 if r == 10 else 10,
        color=BLUE if r == 10 else INK, border=BOTTOM)
    ws.row_dimensions[r].height = 21
gain_colors(ws, "K14:K15")

section(ws, "J17:K17", "🎯 Minha meta", GOLD)
put(ws, "J18", "Quanto da meta já juntei", bold=True, border=BOTTOM)
put(ws, "K18", "=IF(K7>0,K10/K7,0)", fmt='0%', h="right", bold=True, size=12, color=GOLD, border=BOTTOM)
merge(ws, "J19:K19", '=REPT("█",MIN(20,ROUND(K18*20,0)))&REPT("░",20-MIN(20,ROUND(K18*20,0)))',
      size=14, color=GOLD, h="center")
ws.row_dimensions[19].height = 24
put(ws, "J20", "Falta para chegar na meta", border=BOTTOM)
put(ws, "K20", "=MAX(0,K7-K10)", fmt=USD, h="right", border=BOTTOM)

merge(ws, "J22:K30",
      "🤔 Por que a 'cotação que paguei' é maior que a do Google?\n"
      "Porque a do Google é o dólar 'comercial', sem taxas. Quando você compra, paga também IOF e a taxa do app. "
      "Por isso anote o TOTAL que saiu da sua conta: assim você sabe o custo real.\n\n"
      "📉📈 O dólar sobe e desce todo dia. Se hoje estiver mais barato do que você pagou, aparece em vermelho, "
      "mas você só perde de verdade se vender. Comprar um pouco todo mês ajuda a fazer uma média.",
      size=9, bg=PASTEL[BLUE], wrap=True, v="top")
ws.freeze_panes = "A6"
protect(ws)

# =====================================================================
# 🔮 Simulador
# =====================================================================
ws = ws5
setup(ws, {"A": 2, "B": 44, "C": 18, "D": 4, "E": 10, "F": 16, "G": 16, "H": 18, "I": 18}, PURPLE)
title(ws, "B1:I1", "🔮 Simulador — quanto vou ter se eu guardar todo mês?",
      "Brinque com os números amarelinhos e veja o poder dos juros compostos (o rendimento rendendo em cima do rendimento).", PURPLE)
section(ws, "B4:C4", "✍️ Me conta seu plano", PURPLE)
for r, lab, val, fmt in [(5, "Quanto já tenho guardado hoje", 796, BRL),
                         (6, "Quanto vou guardar todo mês", 300, BRL),
                         (7, "Por quantos meses (até 120 = 10 anos)", 24, '0 "meses"')]:
    put(ws, f"B{r}", lab, bold=True, border=BOTTOM); inp(ws, f"C{r}", val, fmt=fmt, size=11)
    ws.row_dimensions[r].height = 22
dvm = DataValidation(type="whole", operator="between", formula1="1", formula2="120",
                     showErrorMessage=True, errorTitle="Meses", error="Escolha entre 1 e 120 meses")
ws.add_data_validation(dvm); dvm.add("C7")
put(ws, "B8", "Rendimento por ano (vem da aba 🌱 Meu CDI)", color=GRAY, border=BOTTOM)
put(ws, "C8", f"={q(S3)}!K7", fmt=PCT, h="right", color="1B8A5A", border=BOTTOM)
put(ws, "B9", "Rendimento por mês", color=GRAY, border=BOTTOM)
put(ws, "C9", "=(1+C8)^(1/12)-1", fmt=PCT, h="right", color=GRAY, border=BOTTOM)
put(ws, "B10", "Poupança por mês (0,5% + TR, aprox.)", color=GRAY, border=BOTTOM)
put(ws, "C10", 0.0055, fmt=PCT, h="right", color=GRAY, border=BOTTOM)
ws["C10"].comment = Comment("Com a Selic acima de 8,5%, a poupança paga 0,5% ao mês + TR. Usei ~0,55%/mês como aproximação.", "Planilha")

M = 120
MONTHS = "MIN($C$7,120)"
section(ws, "B12:C12", "🎯 Resultado", PURPLE)
put(ws, "B13", '="Daqui a "&C7&" meses você terá"', bold=True, size=11, border=BOTTOM)
put(ws, "C13", f"=INDEX(H17:H{17+M},{MONTHS}+1)", fmt=BRL, h="right", bold=True, size=14, color=PURPLE, border=BOTTOM)
put(ws, "B14", "💪 Saiu do seu bolso", border=BOTTOM)
put(ws, "C14", f"=C5+C6*{MONTHS}", fmt=BRL, h="right", border=BOTTOM)
put(ws, "B15", "🎁 O CDI te deu de presente", border=BOTTOM)
put(ws, "C15", "=C13-C14", fmt=BRL, h="right", bold=True, color="1B8A5A", border=BOTTOM)
put(ws, "B16", "🧾 Imposto de renda (aprox.)", border=BOTTOM)
put(ws, "C16", f"=C15*{ir_rate('(C7*30)')}", fmt=BRL, h="right", border=BOTTOM)
put(ws, "B17", "🌱 Fica pra você (já sem imposto)", bold=True, size=11, border=BOTTOM)
put(ws, "C17", "=C13-C16", fmt=BRL, h="right", bold=True, size=12, color=PURPLE, border=BOTTOM)
for r in range(13, 18):
    ws.row_dimensions[r].height = 24

section(ws, "B19:C19", "🤔 E se o dinheiro ficasse em outro lugar?", GOLD)
put(ws, "B20", "🛏️ Debaixo do colchão (sem render)", border=BOX)
put(ws, "C20", "=C14", fmt=BRL, h="right", border=BOX)
put(ws, "B21", "🐷 Na poupança", border=BOX)
put(ws, "C21", f"=INDEX(I17:I{17+M},{MONTHS}+1)", fmt=BRL, h="right", border=BOX)
put(ws, "B22", "🌱 No CDI (já sem imposto)", border=BOX)
put(ws, "C22", "=C17", fmt=BRL, h="right", bold=True, border=BOX)
put(ws, "B23", "Quanto o CDI ganha da poupança", bold=True, border=BOX)
put(ws, "C23", "=C22-C21", fmt=BRL, h="right", bold=True, border=BOX)
gain_colors(ws, "C23:C23")

ch = BarChart(); ch.type = "col"; ch.style = 10
ch.add_data(Reference(ws, min_col=3, min_row=20, max_row=22), titles_from_data=False)
ch.set_categories(Reference(ws, min_col=2, min_row=20, max_row=22))
ch.legend = None; ch.y_axis.numFmt = '"R$" #,##0'; ch.y_axis.majorGridlines = None
ch.series[0].graphicalProperties.solidFill = PURPLE
ch.series[0].graphicalProperties.line.solidFill = PURPLE
ch.dataLabels = DataLabelList(); ch.dataLabels.showVal = True; ch.dataLabels.showSerName = False; ch.dataLabels.showCatName = False; ch.dataLabels.showLegendKey = False; ch.y_axis.scaling.min = 0; ch.dataLabels.numFmt = '"R$" #,##0'
ch.x_axis.delete = False; ch.y_axis.delete = False
ch.height = 8; ch.width = 11.5; ch.y_axis.delete = True
ws.add_chart(ch, "B25")

section(ws, "E15:I15", "📅 Mês a mês", NAVY)
header_row(ws, 16, [("E", "Mês"), ("F", "Guardei no mês"), ("G", "Rendeu no mês"), ("H", "Total no CDI"), ("I", "Total na poupança")], NAVY)
put(ws, "E17", "Hoje", h="center", bold=True, border=BOX)
put(ws, "F17", "=C5", fmt=BRL, h="right", border=BOX)
put(ws, "G17", 0, fmt=BRL, h="right", border=BOX, color=GRAY)
put(ws, "H17", "=C5", fmt=BRL, h="right", bold=True, border=BOX)
put(ws, "I17", "=C5", fmt=BRL, h="right", border=BOX, color=GRAY)
for i in range(1, M + 1):
    r = 17 + i
    put(ws, f"E{r}", f'=IF({i}>$C$7,"",{i})', h="center", border=BOX)
    put(ws, f"F{r}", f'=IF(E{r}="","",$C$6)', fmt=BRL, h="right", border=BOX)
    put(ws, f"G{r}", f'=IF(E{r}="","",H{r-1}*$C$9)', fmt=BRL, h="right", color="1B8A5A", border=BOX)
    put(ws, f"H{r}", f'=IF(E{r}="","",H{r-1}+G{r}+F{r})', fmt=BRL, h="right", bold=True, border=BOX)
    put(ws, f"I{r}", f'=IF(E{r}="","",I{r-1}*(1+$C$10)+F{r})', fmt=BRL, h="right", color=GRAY, border=BOX)
zebra(ws, f"E17:I{17+M}")
ws.freeze_panes = "A17"
protect(ws)

# =====================================================================
# 🏠 Resumo
# =====================================================================
ws = ws1
setup(ws, {"A": 2, "B": 24, "C": 18, "D": 24, "E": 18, "F": 24, "G": 18, "H": 3, "I": 22, "J": 14}, NAVY)
merge(ws, "B1:G1", "🏠 Meu dinheiro hoje", size=22, bold=True, color=NAVY)
ws.row_dimensions[1].height = 40
put(ws, "B2", "Atualizado em:", color=GRAY, italic=True)
put(ws, "C2", "=TODAY()", fmt=DATE, color=GRAY, italic=True, h="left")
merge(ws, "D2:G2",
      f'=IF({q(S3)}!K13+{q(S4)}!K10=0,"👉 Comece anotando seu primeiro valor na aba 🌱 Meu CDI ou 💵 Meus Dólares","✨ Cada real guardado hoje trabalha pra você amanhã.")',
      color=PURPLE, italic=True, size=10)

CDI = q(S3); DOL = q(S4)
def card(r, c1, c2, label, value, fmt, color, sub_label=None, sub_value=None, sub_fmt=None, value_color=None):
    bg = PASTEL[color]
    merge(ws, f"{c1}{r}:{c2}{r}", label, size=10, bold=True, color=WHITE, bg=color)
    merge(ws, f"{c1}{r+1}:{c2}{r+1}", value, size=20, bold=True, color=value_color or color, bg=bg, fmt=fmt, h="center")
    put(ws, f"{c1}{r+2}", sub_label, size=9, color=GRAY, bg=bg, italic=True)
    put(ws, f"{c2}{r+2}", sub_value, size=10, bold=True, color=INK, bg=bg, fmt=sub_fmt, h="right")
    ws.row_dimensions[r].height = 22; ws.row_dimensions[r + 1].height = 40; ws.row_dimensions[r + 2].height = 20

card(4, "B", "C", "🌱 Tenho no CDI", f"={CDI}!K16", BRL, TEAL, "já rendeu:", f"={CDI}!K17", BRL)
card(4, "D", "E", "💵 Tenho em dólares", f"={DOL}!K10", USD, BLUE, "valem hoje ≈", f"={DOL}!K13", BRL)
card(4, "F", "G", "💎 Total guardado", "=B5+E6", BRL, PURPLE, "CDI + dólares, em reais", None)
card(8, "B", "C", "🧾 Se eu resgatar o CDI hoje", f"={CDI}!K19", BRL, TEAL, "já descontando o imposto", None)
card(8, "D", "E", "💱 Ganhei/perdi com o dólar", f"={DOL}!K14", BRL, BLUE, "cotação média paga:", f"={DOL}!K12", '"R$" 0.00')
card(8, "F", "G", "🎯 Meta de dólares", f"={DOL}!K18", '0%', GOLD, "falta:", f"={DOL}!K20", USD)
gain_colors(ws, "D9:D9")

section(ws, "B12:G12", "📒 Este mês (da aba Meu Mês)", CORAL)
MM = q(S2)
cur = f'{MM}!$B:$B,">="&{SL}!$E$3,{MM}!$B:$B,"<="&{SL}!$E$4'
mini = [("B", "C", 13, "⬆️ Entrou", f'=SUMIFS({MM}!$E:$E,{MM}!$F:$F,"Entrada",{cur})', BRL),
        ("D", "E", 13, "⬇️ Gastei", f'=SUMIFS({MM}!$E:$E,{MM}!$F:$F,"Gasto",{cur})', BRL),
        ("F", "G", 13, "💰 Guardei / investi", f'=SUMIFS({MM}!$E:$E,{MM}!$F:$F,"Investimento",{cur})', BRL),
        ("B", "C", 14, "🟰 Sobrou na conta", "=C13-E13-G13", BRL),
        ("D", "E", 14, "📊 Da renda, guardei", "=IF(C13>0,G13/C13,0)", '0%')]
for a, b, r, lab, fml, fmt in mini:
    put(ws, f"{a}{r}", lab, bold=True, bg=PASTEL[CORAL], border=BOX)
    put(ws, f"{b}{r}", fml, fmt=fmt, bold=True, size=12, h="right", bg=PASTEL[CORAL], border=BOX)
    ws.row_dimensions[r].height = 26
put(ws, "F14", None, bg=PASTEL[CORAL], border=BOX); put(ws, "G14", None, bg=PASTEL[CORAL], border=BOX)
gain_colors(ws, "C14:C14")

put(ws, "I4", "dados do gráfico", size=8, color=GRAY, italic=True)
put(ws, "I5", "CDI", size=8, color=GRAY); put(ws, "J5", "=B5", fmt=BRL, size=8, color=GRAY)
put(ws, "I6", "Dólares (em R$)", size=8, color=GRAY); put(ws, "J6", "=E6", fmt=BRL, size=8, color=GRAY)
pie = PieChart(); pie.title = "Onde está meu dinheiro"
pie.add_data(Reference(ws, min_col=10, min_row=5, max_row=6), titles_from_data=False)
pie.set_categories(Reference(ws, min_col=9, min_row=5, max_row=6))
from openpyxl.chart.series import DataPoint
for idx, col in enumerate([TEAL, BLUE]):
    pt = DataPoint(idx=idx); pt.graphicalProperties.solidFill = col; pt.graphicalProperties.line.solidFill = WHITE
    pie.series[0].dPt.append(pt)
pie.dataLabels = DataLabelList(); pie.dataLabels.showPercent = True; pie.dataLabels.showVal = False; pie.dataLabels.showSerName = False; pie.dataLabels.showCatName = False; pie.dataLabels.showLegendKey = False
pie.legend.position = "b"
pie.height = 8; pie.width = 12
ws.add_chart(pie, "B16")
protect(ws)

# =====================================================================
# 👋 Comece aqui
# =====================================================================
ws = ws0
setup(ws, {"A": 2, "B": 30, "C": 70, "D": 3}, GOLD)
put(ws, "B3", "✍️ Seu nome:", bold=True, size=11, h="right")
inp(ws, "C3", "", h="left", size=11)
merge(ws, "B1:C1", '="Olá"&IF(C3="","",", "&C3)&"! 👋 Esta é a sua planilha de finanças"', size=20, bold=True, color=NAVY)
ws.row_dimensions[1].height = 40
merge(ws, "B4:C4", "Feita para ser simples: sem termos difíceis, sem fórmulas para mexer. Leia esta página uma vez (leva 2 minutos) e pronto!",
      size=10, color=GRAY, italic=True, wrap=True)
ws.row_dimensions[4].height = 30

r = 6
section(ws, f"B{r}:C{r}", "🟨 A única regra", GOLD); r += 1
put(ws, f"B{r}", "Célula amarelinha", bg=INPUT, bold=True, h="center", border=BOX)
put(ws, f"C{r}", "👉 Você escreve aqui. Todo o resto a planilha calcula sozinha (e está protegido para nada quebrar).", wrap=True, border=BOX)
ws.row_dimensions[r].height = 30; r += 1
put(ws, f"B{r}", "📱 Veio do app" if TEMPLATE else "Seu ponto de partida", bold=True, h="center", border=BOX)
put(ws, f"C{r}", "Esta planilha foi gerada pelo app com todos os seus registros. Você pode continuar anotando aqui, mas o app não lê a planilha: escolha um dos dois como principal." if TEMPLATE else "Já deixei anotado no 🌱 Meu CDI seu primeiro depósito: R$ 796,00 em 26/10/2026. Agora é só ir anotando o resto. Errou algo? Selecione a célula amarela e aperte Delete.", wrap=True, border=BOX)
ws.row_dimensions[r].height = 30; r += 2

section(ws, f"B{r}:C{r}", "🗂️ As abas (lá embaixo da tela)", NAVY); r += 1
for name, desc, col in [
        (S1, "O resumo de tudo: quanto você tem no CDI, em dólares e no total. Só olhar, não precisa escrever nada.", NAVY),
        (S2, "Seu controle do dia a dia: anote o que entra (salário) e o que sai (gastos). Mostra quanto sobrou no mês e onde você mais gasta.", CORAL),
        (S3, "Cada vez que guardar dinheiro na caixinha (ou tirar), anote aqui. Mostra quanto já rendeu.", TEAL),
        (S4, "Cada vez que comprar dólar, anote aqui. Mostra quantos dólares você tem e quanto valem em reais.", BLUE),
        (S5, "Para sonhar: 'se eu guardar R$ X por mês, quanto terei daqui a 2 anos?'", PURPLE)]:
    put(ws, f"B{r}", name, bold=True, color=WHITE, bg=col, border=BOX)
    put(ws, f"C{r}", desc, wrap=True, border=BOX, bg=PASTEL[col])
    ws.row_dimensions[r].height = 32; r += 1
r += 1

section(ws, f"B{r}:C{r}", "📆 Rotina (5 minutinhos)", TEAL); r += 1
for a, b in [("Toda vez que gastar ou receber", "Anote no 📒 Meu Mês (ou junte e anote uma vez por semana)."),
             ("Quando guardar na caixinha", "Anote no 📒 Meu Mês (categoria 🌱 Guardei no CDI) E no 🌱 Meu CDI."),
             ("Quando comprar dólar", "Anote no 📒 Meu Mês (categoria 💵 Comprei dólar) E no 💵 Meus Dólares."),
             ("Uma vez por mês", "Atualize a cotação do dólar (💵 Meus Dólares) e, se quiser, o saldo do app (🌱 Meu CDI). Depois olhe o 🏠 Resumo. 🎉")]:
    put(ws, f"B{r}", a, bold=True, border=BOX, wrap=True)
    put(ws, f"C{r}", b, wrap=True, border=BOX)
    ws.row_dimensions[r].height = 30; r += 1
r += 1

section(ws, f"B{r}:C{r}", "📚 Dicionário sem complicação", PURPLE); r += 1
for a, b in [
        ("CDI", "É a taxa que os bancos usam para emprestar dinheiro entre eles. Na prática: é a 'régua' de quanto seu dinheiro rende. Se o CDI está 13,65% ao ano, R$ 1.000 viram ≈ R$ 1.136 em um ano."),
        ("Selic", "A taxa de juros 'oficial' do Brasil, decidida pelo Banco Central. O CDI anda quase colado nela. Se a Selic sobe, seu CDI rende mais."),
        ("100% do CDI", "Quer dizer que o banco te paga exatamente o CDI. 110% do CDI paga um pouco mais; 90% paga um pouco menos."),
        ("Caixinha / CDB", "O 'lugar' onde o dinheiro fica rendendo (no Nubank se chama caixinha). É seguro: tem garantia do FGC até R$ 250 mil por banco."),
        ("Liquidez diária", "Você pode tirar o dinheiro quando quiser, no mesmo dia."),
        ("Aporte", "Palavra chique para 'dinheiro que eu coloquei' no investimento."),
        ("Resgate", "Tirar o dinheiro do investimento e voltar para a conta."),
        ("Rendimento", "O dinheiro que o investimento te deu de presente, além do que você colocou."),
        ("Juros compostos", "O rendimento também rende. No começo parece pouco, mas com o tempo vira uma bola de neve. ⛄ Veja no 🔮 Simulador."),
        ("IR (Imposto de Renda)", "Imposto cobrado só sobre o rendimento, na hora do resgate. O banco desconta sozinho. Quanto mais tempo guardado, menos imposto (de 22,5% até 15%)."),
        ("IOF", "Outro imposto. No CDI só existe se você tirar antes de 30 dias. Na compra de dólar ele vem embutido no preço."),
        ("Cotação do dólar", "Quantos reais custa 1 dólar. Se a cotação é R$ 5,00, US$ 100 custam R$ 500 (mais as taxas)."),
        ("Reserva de emergência", "Dinheiro guardado para imprevistos (perder o emprego, saúde, conserto). Muita gente usa como meta ter de 3 a 6 meses dos seus gastos guardados em algo com liquidez diária, como o CDI.")]:
    put(ws, f"B{r}", a, bold=True, color=PURPLE, border=BOX, v="top")
    put(ws, f"C{r}", b, wrap=True, border=BOX, v="top")
    ws.row_dimensions[r].height = 30 if len(b) < 120 else 44; r += 1
r += 1
merge(ws, f"B{r}:C{r+1}",
      "ℹ️ Os valores de CDI e dólar que vieram preenchidos são de 26/10/2026. Os cálculos são estimativas para te ajudar a acompanhar; "
      "o valor oficial é sempre o que aparece no app do seu banco. Esta planilha não é recomendação de investimento.",
      size=9, color=GRAY, italic=True, wrap=True, v="top")
protect(ws)

# fonte padrão Arial para células vazias também
for wsx in wb.worksheets:
    wsx.sheet_view.zoomScale = 100
wb._named_styles["Normal"].font = Font(name=FONT, size=10)
wb.active = 0
wb.save(OUT)
print("ok", OUT)
