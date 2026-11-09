#!/usr/bin/env python3
"""Converte a planilha "Minhas Finanças" preenchida no JSON de backup do app.

Uso:
    python tools/planilha-para-backup.py <entrada.xlsx> [saida.json]

Sem `saida.json`, grava `minhas-financas-backup-AAAA-MM-DD.json` ao lado da entrada.
No app: Configurações -> Restaurar backup -> escolha o arquivo gerado.
"""
import datetime as dt
import json
import re
import sys
import unicodedata
import uuid
import warnings
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover
    sys.exit("Erro: instale o openpyxl (pip install openpyxl).")

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- constantes
CAT_CDI = "🌱 Guardei no CDI"
CAT_DOLAR = "💵 Comprei dólar"
CAT_RESGATE = "↩️ Outras entradas"
CAT_OUTROS = "❓ Outros gastos"

# Cópia de src/categorias.ts (usada só se o arquivo não for encontrado).
_CATS_FALLBACK = [
    ("🏠 Moradia (aluguel, condomínio)", "Moradia"), ("🛒 Mercado", "Mercado"), ("🚌 Transporte", "Transporte"),
    ("💡 Contas (luz, água, internet)", "Contas"), ("💊 Saúde", "Saúde"), ("🍔 Comer fora / delivery", "Comer fora"),
    ("🎉 Lazer", "Lazer"), ("🛍️ Compras (roupa, casa)", "Compras"), ("📚 Educação", "Educação"),
    ("📱 Assinaturas (streaming, celular)", "Assinaturas"), ("🎁 Presentes", "Presentes"),
    ("❓ Outros gastos", "Outros"), ("💼 Salário", "Salário"), ("✨ Renda extra", "Renda extra"),
    ("↩️ Outras entradas", "Outras entradas"), ("🌱 Guardei no CDI", "Guardei no CDI"),
    ("💵 Comprei dólar", "Comprei dólar"),
]

# Copia de CONFIG_PADRAO em src/store.ts
CONFIG_PADRAO = {
    "nome": "",
    "cdiAnual": 0.1365,
    "pctCdi": 1,
    "saldoApp": None,
    "saldoAppData": None,
    "cotacaoDolar": 5.0,
    "cotacaoData": "2026-10-26",
    "metaUSD": 1000,
    "simInicial": 796,
    "simMensal": 300,
    "simMeses": 24,
}

FIRST, LAST = 6, 405
SHEETS = {  # chave -> (nome, posição de reserva)
    "comece": ("👋 Comece aqui", 0),
    "mes": ("📒 Meu Mês", 2),
    "cdi": ("🌱 Meu CDI", 3),
    "dolar": ("💵 Meus Dólares", 4),
    "sim": ("🔮 Simulador", 5),
}

WARNINGS: list[str] = []


def warn(msg: str) -> None:
    WARNINGS.append(msg)
    print(f"AVISO: {msg}", file=sys.stderr)


def norm(s) -> str:
    """minúsculas, sem acentos, sem emoji/pontuação, espaços colapsados."""
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch)[0] in "LNZ" and not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip().lower()


def carregar_categorias() -> list[tuple[str, str]]:
    path = ROOT / "src" / "categorias.ts"
    try:
        txt = path.read_text(encoding="utf-8")
        found = re.findall(r"nome:\s*'([^']*)'.*?curto:\s*'([^']*)'", txt)
        if len(found) >= 10:
            return found
    except OSError:
        pass
    return _CATS_FALLBACK


CATEGORIAS = carregar_categorias()
CAT_NOMES = {n for n, _ in CATEGORIAS}
_CAT_INDEX: dict[str, str] = {}
for _n, _c in CATEGORIAS:
    for _k in (norm(_n), norm(_c), norm(re.sub(r"\(.*?\)", "", _n))):
        _CAT_INDEX.setdefault(_k, _n)
CAT_CDI = next((n for n in CAT_NOMES if "CDI" in n), CAT_CDI)
CAT_DOLAR = next((n for n in CAT_NOMES if "dólar" in n), CAT_DOLAR)
CAT_RESGATE = next((n for n in CAT_NOMES if "Outras entradas" in n), CAT_RESGATE)
CAT_OUTROS = next((n for n in CAT_NOMES if "Outros gastos" in n), CAT_OUTROS)


# ---------------------------------------------------------------- leitura
class Planilha:
    def __init__(self, path: Path):
        self.path = path
        self.wb = load_workbook(path)  # fórmulas como texto
        self._wb_vals = None

    def sheet(self, key: str):
        nome, pos = SHEETS[key]
        if nome in self.wb.sheetnames:
            return self.wb[nome]
        alvo = norm(nome)
        for n in self.wb.sheetnames:
            if norm(n) == alvo:
                return self.wb[n]
        if pos < len(self.wb.worksheets):
            warn(f"Aba '{nome}' não encontrada pelo nome; usando a aba na posição {pos + 1} "
                 f"('{self.wb.worksheets[pos].title}').")
            return self.wb.worksheets[pos]
        warn(f"Aba '{nome}' não encontrada.")
        return None

    def cell(self, ws, ref: str):
        """Valor da célula; se for fórmula, tenta o valor em cache (data_only)."""
        v = ws[ref].value
        if isinstance(v, str) and v.lstrip().startswith("="):
            if self._wb_vals is None:
                self._wb_vals = load_workbook(self.path, data_only=True)
            try:
                v = self._wb_vals[ws.title][ref].value
            except KeyError:
                v = None
        return v

    def rows(self, ws):
        """(linha, B, C, D, E) das linhas de registro."""
        ultimo = max(LAST, ws.max_row or 0)
        for r in range(FIRST, ultimo + 1):
            yield (r, *(self.cell(ws, f"{col}{r}") for col in "BCDE"))


def vazio(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


def limpa(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v).replace(" ", " ")).strip()


def num(v):
    """Converte para float ou None. Aceita 1.234,56 / 1234.56 / R$ 1.234,56 / 13,65%."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return None
    s = str(v).replace(" ", " ").strip()
    if not s:
        return None
    pct = s.endswith("%")
    s = re.sub(r"(?i)(us\$|r\$|\$|%)", "", s)
    s = re.sub(r"\s+", "", s)
    neg = s.startswith("-") or (s.startswith("(") and s.endswith(")"))
    s = s.strip("-+()")
    if not re.fullmatch(r"[\d.,]+", s):
        return None
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(".", "").replace(",", ".") if s.count(",") == 1 else s.replace(",", "")
    elif "." in s and re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        s = s.replace(".", "")  # 1.234 / 1.234.567 -> milhar (pt-BR)
    try:
        x = float(s)
    except ValueError:
        return None
    if pct:
        x /= 100
    return -x if neg else x


def data(v):
    """Converte para 'YYYY-MM-DD' ou None."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, (int, float)):
        return _serial(float(v))
    s = limpa(v)
    if not s:
        return None
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?", s)
    if m:
        return _mk(int(m[1]), int(m[2]), int(m[3]))
    m = re.fullmatch(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[T ,].*)?", s)
    if m:
        d, mo, y = int(m[1]), int(m[2]), int(m[3])
        if y < 100:
            y += 2000
        return _mk(y, mo, d)
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return _serial(float(s))
    return None


def _mk(y, m, d):
    try:
        return dt.date(y, m, d).isoformat()
    except ValueError:
        return None


def _serial(n: float):
    if 36526 < n < 80000:  # 2000-01-01 .. ~2118
        return (dt.date(1899, 12, 30) + dt.timedelta(days=int(n))).isoformat()
    return None


def parece_resgate(desc: str) -> bool:
    return "resgat" in norm(desc)


# ---------------------------------------------------------------- categorias
def resolver_categoria(txt, linha: int) -> str:
    t = limpa(txt)
    if not t:
        warn(f"Meu Mês linha {linha}: sem categoria; usando '{CAT_OUTROS}'.")
        return CAT_OUTROS
    if t in CAT_NOMES:
        return t
    achou = _CAT_INDEX.get(norm(t))
    if achou:
        return achou
    warn(f"Meu Mês linha {linha}: categoria desconhecida '{t}'; usando '{CAT_OUTROS}'.")
    return CAT_OUTROS


# ---------------------------------------------------------------- conversão
def ler_movimentos(p: Planilha):
    ws = p.sheet("mes")
    out = []
    if ws is None:
        return out
    for r, d, desc, cat, val in p.rows(ws):
        v = num(val)
        iso = data(d)
        vazio_d, vazio_v = vazio(d), vazio(val)
        if vazio_d and vazio_v:
            if not (vazio(desc) and vazio(cat)):
                warn(f"Meu Mês linha {r}: linha sem data e sem valor ('{limpa(desc) or limpa(cat)}'); ignorada.")
            continue
        if vazio_d:
            warn(f"Meu Mês linha {r}: valor sem data; ignorada.")
            continue
        if iso is None:
            warn(f"Meu Mês linha {r}: data inválida '{limpa(d)}'; ignorada.")
            continue
        if vazio_v:
            warn(f"Meu Mês linha {r}: data sem valor; ignorada.")
            continue
        if v is None or v == 0:
            warn(f"Meu Mês linha {r}: valor inválido ou zero '{limpa(val)}'; ignorada.")
            continue
        if v < 0:
            warn(f"Meu Mês linha {r}: valor negativo {v}; usando o valor absoluto.")
            v = abs(v)
        out.append({"_linha": r, "id": str(uuid.uuid4()), "data": iso, "descricao": limpa(desc),
                    "categoria": resolver_categoria(cat, r), "valor": round(v, 2)})
    return out


def ler_cdi(p: Planilha):
    ws = p.sheet("cdi")
    out = []
    if ws is None:
        return out
    usou_inicio = False
    for r, d, tipo, val, nota in p.rows(ws):
        v = num(val)
        iso = data(d)
        if vazio(d) and vazio(val):
            if not (vazio(tipo) and vazio(nota)):
                warn(f"Meu CDI linha {r}: linha sem data e sem valor; ignorada.")
            continue
        if vazio(d) or iso is None:
            warn(f"Meu CDI linha {r}: data ausente ou inválida; ignorada.")
            continue
        if v is None or v <= 0:
            warn(f"Meu CDI linha {r}: valor ausente ou inválido '{limpa(val)}'; ignorada.")
            continue
        t = norm(tipo)
        if t.startswith("guard"):
            tp = "Guardei"
        elif t.startswith("resgat"):
            tp = "Resgatei"
        else:
            warn(f"Meu CDI linha {r}: tipo '{limpa(tipo)}' não é Guardei/Resgatei; ignorada.")
            continue
        v = round(v, 2)
        rid = str(uuid.uuid4())
        if not usou_inicio and iso == "2026-10-26" and tp == "Guardei" and abs(v - 796) < 0.005:
            rid, usou_inicio = "inicio", True
        out.append({"id": rid, "data": iso, "tipo": tp, "valor": v, "nota": limpa(nota)})
    return out


def ler_dolares(p: Planilha):
    ws = p.sheet("dolar")
    out = []
    if ws is None:
        return out
    for r, d, onde, brl, usd in p.rows(ws):
        b, u = num(brl), num(usd)
        iso = data(d)
        if vazio(d) and vazio(brl) and vazio(usd):
            if not vazio(onde):
                warn(f"Meus Dólares linha {r}: só '{limpa(onde)}' preenchido; ignorada.")
            continue
        if vazio(d) or iso is None:
            warn(f"Meus Dólares linha {r}: data ausente ou inválida; ignorada.")
            continue
        if b is None or b <= 0 or u is None or u <= 0:
            warn(f"Meus Dólares linha {r}: precisa de 'Paguei (R$)' e 'Recebi (US$)' válidos; ignorada.")
            continue
        out.append({"id": str(uuid.uuid4()), "data": iso, "onde": limpa(onde),
                    "pagouBRL": round(b, 2), "recebeuUSD": round(u, 4)})
    return out


def vincular(movs, cdi, dolares) -> tuple[int, int]:
    usados: set[str] = set()
    n_cdi = n_dol = 0
    for m in sorted(movs, key=lambda x: (x["data"], x["_linha"])):
        if m["categoria"] == CAT_CDI or (m["categoria"] == CAT_RESGATE and parece_resgate(m["descricao"])):
            tipo = "Guardei" if m["categoria"] == CAT_CDI else "Resgatei"
            for c in cdi:
                if (c["id"] not in usados and c["data"] == m["data"] and c["tipo"] == tipo
                        and abs(c["valor"] - m["valor"]) <= 0.005):
                    m["linkId"] = c["id"]
                    usados.add(c["id"])
                    n_cdi += 1
                    break
        elif m["categoria"] == CAT_DOLAR:
            for d in dolares:
                if d["id"] not in usados and d["data"] == m["data"] and abs(d["pagouBRL"] - m["valor"]) <= 0.005:
                    m["linkId"] = d["id"]
                    usados.add(d["id"])
                    n_dol += 1
                    break
    return n_cdi, n_dol


def ler_config(p: Planilha) -> dict:
    cfg = dict(CONFIG_PADRAO)

    ws = p.sheet("comece")
    if ws is not None:
        nome = limpa(p.cell(ws, "C3"))
        if nome:
            cfg["nome"] = nome

    ws = p.sheet("cdi")
    if ws is not None:
        x = num(p.cell(ws, "K5"))
        if x is not None and 0 < x < 1:
            cfg["cdiAnual"] = x
        elif not vazio(p.cell(ws, "K5")):
            warn(f"CDI ao ano (K5) fora do intervalo 0-100%: '{p.cell(ws, 'K5')}'; mantido o padrão.")
        x = num(p.cell(ws, "K6"))
        if x is not None and 0 < x <= 3:
            cfg["pctCdi"] = x
        elif not vazio(p.cell(ws, "K6")):
            warn(f"% do CDI (K6) inválido: '{p.cell(ws, 'K6')}'; mantido o padrão.")
        raw = p.cell(ws, "K15")
        x = num(raw)
        if x is not None and x >= 0:
            cfg["saldoApp"] = round(x, 2)
            cfg["saldoAppData"] = dt.date.today().isoformat()
        elif not vazio(raw):
            warn(f"Saldo do app (K15) inválido: '{raw}'; ignorado.")

    ws = p.sheet("dolar")
    if ws is not None:
        x = num(p.cell(ws, "K5"))
        if x is not None and x > 0:
            cfg["cotacaoDolar"] = x
        elif not vazio(p.cell(ws, "K5")):
            warn(f"Cotação (K5) inválida: '{p.cell(ws, 'K5')}'; mantido o padrão.")
        raw = p.cell(ws, "K6")
        if not vazio(raw):
            iso = data(raw)
            if iso:
                cfg["cotacaoData"] = iso
            else:
                warn(f"Data da cotação (K6) inválida: '{raw}'; mantido o padrão.")
        x = num(p.cell(ws, "K7"))
        if x is not None and x > 0:
            cfg["metaUSD"] = x
        elif not vazio(p.cell(ws, "K7")):
            warn(f"Meta em US$ (K7) inválida: '{p.cell(ws, 'K7')}'; mantido o padrão.")

    ws = p.sheet("sim")
    if ws is not None:
        x = num(p.cell(ws, "C5"))
        if x is not None and x >= 0:
            cfg["simInicial"] = x
        x = num(p.cell(ws, "C6"))
        if x is not None and x >= 0:
            cfg["simMensal"] = x
        x = num(p.cell(ws, "C7"))
        if x is not None and 1 <= x <= 120:
            cfg["simMeses"] = int(round(x))
    return cfg


def converter(path: Path) -> dict:
    p = Planilha(path)
    movs = ler_movimentos(p)
    cdi = ler_cdi(p)
    dolares = ler_dolares(p)
    n_cdi, n_dol = vincular(movs, cdi, dolares)
    movs.sort(key=lambda m: (m["data"], m["_linha"]))
    cdi.sort(key=lambda c: c["data"])
    dolares.sort(key=lambda d: d["data"])
    for m in movs:
        m.pop("_linha")
    # Ordem das chaves igual à dos tipos do app.
    movs = [{k: m[k] for k in ("id", "data", "descricao", "categoria", "valor", "linkId") if k in m} for m in movs]
    estado = {"version": 1, "config": ler_config(p), "movimentos": movs, "cdi": cdi, "dolares": dolares}
    estado["_links"] = (n_cdi, n_dol)
    return estado


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3) or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0 if len(argv) > 1 and argv[1] in ("-h", "--help") else 2
    entrada = Path(argv[1])
    if not entrada.is_file():
        print(f"Erro: arquivo não encontrado: {entrada}", file=sys.stderr)
        return 2
    saida = Path(argv[2]) if len(argv) == 3 else entrada.resolve().parent / f"minhas-financas-backup-{dt.date.today().isoformat()}.json"
    try:
        estado = converter(entrada)
    except PermissionError:
        print("Erro: não consegui abrir a planilha (feche-a no Excel e tente de novo).", file=sys.stderr)
        return 1
    except Exception as e:  # arquivo corrompido, não-xlsx, etc.
        print(f"Erro ao ler a planilha: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    n_cdi, n_dol = estado.pop("_links")
    saida.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    movs, cdi, dol = estado["movimentos"], estado["cdi"], estado["dolares"]
    soma = lambda xs, k: round(sum(x[k] for x in xs), 2)
    guardado = soma([c for c in cdi if c["tipo"] == "Guardei"], "valor") - soma([c for c in cdi if c["tipo"] == "Resgatei"], "valor")
    print(f"Backup gerado: {saida}")
    print(f"  Meu Mês:   {len(movs)} lançamentos, soma R$ {soma(movs, 'valor'):.2f} ({n_cdi + n_dol} ligados a CDI/dólar)")
    print(f"  Meu CDI:   {len(cdi)} registros, guardado líquido R$ {guardado:.2f} ({n_cdi} ligados ao Meu Mês)")
    print(f"  Dólares:   {len(dol)} compras, R$ {soma(dol, 'pagouBRL'):.2f} -> US$ {soma(dol, 'recebeuUSD'):.2f} ({n_dol} ligadas ao Meu Mês)")
    print(f"  Avisos:    {len(WARNINGS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
