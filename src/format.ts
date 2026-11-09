const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const usd = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' })
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 })
const pct0 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

export const fmtBRL = (v: number) => brl.format(v)
export const fmtUSD = (v: number) => usd.format(v)
export const fmtPct = (v: number) => pct.format(v)
export const fmtPct0 = (v: number) => pct0.format(v)

export function fmtData(iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', opts).replace('.', '')
}

/** Aceita "1.234,56", "1234,56" e "1234.56". Retorna NaN se não for número. */
export function parseValor(s: string): number {
  const t = s.trim().replace(/\s|R\$|US\$/g, '')
  if (!t) return NaN
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(norm)
  return Number.isFinite(n) ? n : NaN
}

/** Valor para preencher um input editável no formato brasileiro. */
export const valorInput = (v: number) => (Number.isFinite(v) ? String(v).replace('.', ',') : '')
