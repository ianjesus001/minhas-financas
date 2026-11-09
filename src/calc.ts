// Mesmas contas da planilha Excel, para os números do app e do Excel baterem.
import { categoria } from './categorias'
import type { AppState, Config, ISODate, Movimento } from './types'

export const POUPANCA_MES = 0.0055

export function hoje(): ISODate {
  const d = new Date()
  return toISO(d)
}

export function toISO(d: Date): ISODate {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY = 86_400_000

export function diasCorridos(de: ISODate, ate: ISODate): number {
  return Math.round((parseISO(ate).getTime() - parseISO(de).getTime()) / DAY)
}

/** Igual a MAX(0, NETWORKDAYS(de, ate) - 1) do Excel (sem feriados). */
export function diasUteis(de: ISODate, ate: ISODate): number {
  const a = parseISO(de)
  const b = parseISO(ate)
  if (b < a) return 0
  let count = 0
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay()
    if (w !== 0 && w !== 6) count++
  }
  return Math.max(0, count - 1)
}

export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 0.225
  if (dias <= 360) return 0.2
  if (dias <= 720) return 0.175
  return 0.15
}

export function taxas(config: Config) {
  const anual = config.cdiAnual * config.pctCdi
  return {
    anual,
    mes: Math.pow(1 + anual, 1 / 12) - 1,
    dia: Math.pow(1 + anual, 1 / 252) - 1,
  }
}

export function resumoCDI(state: AppState, ate: ISODate = hoje()) {
  const { dia } = taxas(state.config)
  let colocado = 0
  let estimado = 0
  let ir = 0
  for (const m of state.cdi) {
    const sinal = m.tipo === 'Resgatei' ? -1 : 1
    const du = diasUteis(m.data, ate)
    const fator = Math.pow(1 + dia, du)
    colocado += sinal * m.valor
    estimado += sinal * m.valor * fator
    ir += sinal * m.valor * (fator - 1) * aliquotaIR(diasCorridos(m.data, ate))
  }
  const usaApp = state.config.saldoApp !== null
  const saldo = usaApp ? (state.config.saldoApp as number) : estimado
  ir = Math.max(0, ir)
  return { colocado, estimado, saldo, usaApp, rendeu: saldo - colocado, ir, liquido: saldo - ir }
}

export function resumoDolar(state: AppState) {
  const { cotacaoDolar, metaUSD } = state.config
  const usd = state.dolares.reduce((s, d) => s + d.recebeuUSD, 0)
  const pago = state.dolares.reduce((s, d) => s + d.pagouBRL, 0)
  const vale = usd * cotacaoDolar
  const ganho = vale - pago
  return {
    usd,
    pago,
    media: usd > 0 ? pago / usd : 0,
    vale,
    ganho,
    ganhoPct: pago > 0 ? ganho / pago : 0,
    metaPct: metaUSD > 0 ? usd / metaUSD : 0,
    falta: Math.max(0, metaUSD - usd),
  }
}

export const mesKey = (d: ISODate) => d.slice(0, 7) // 'YYYY-MM'

export function resumoMes(movs: Movimento[], key: string) {
  const doMes = movs.filter((m) => mesKey(m.data) === key)
  let entrou = 0
  let gastei = 0
  let guardei = 0
  const porCat = new Map<string, number>()
  for (const m of doMes) {
    const tipo = categoria(m.categoria)?.tipo ?? 'Gasto'
    if (tipo === 'Entrada') entrou += m.valor
    else if (tipo === 'Investimento') guardei += m.valor
    else {
      gastei += m.valor
      porCat.set(m.categoria, (porCat.get(m.categoria) ?? 0) + m.valor)
    }
  }
  const categorias = [...porCat.entries()]
    .map(([nome, valor]) => ({ nome, valor, pct: gastei > 0 ? valor / gastei : 0 }))
    .sort((a, b) => b.valor - a.valor)
  return {
    movs: doMes,
    entrou,
    gastei,
    guardei,
    sobrou: entrou - gastei - guardei,
    pctGuardado: entrou > 0 ? guardei / entrou : 0,
    categorias,
  }
}

export function simular(inicial: number, mensal: number, meses: number, taxaMes: number) {
  const n = Math.min(120, Math.max(1, Math.round(meses)))
  const serie: { mes: number; cdi: number; poupanca: number; colocado: number }[] = [
    { mes: 0, cdi: inicial, poupanca: inicial, colocado: inicial },
  ]
  let cdi = inicial
  let poup = inicial
  for (let i = 1; i <= n; i++) {
    cdi = cdi + cdi * taxaMes + mensal
    poup = poup * (1 + POUPANCA_MES) + mensal
    serie.push({ mes: i, cdi, poupanca: poup, colocado: inicial + mensal * i })
  }
  const colocado = inicial + mensal * n
  const rendeu = cdi - colocado
  const ir = rendeu * aliquotaIR(n * 30)
  return { n, serie, total: cdi, colocado, rendeu, ir, liquido: cdi - ir, poupanca: poup }
}

export function nomeMes(key: string, curto = false): string {
  const [y, m] = key.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: curto ? 'short' : 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function somaMes(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return toISO(d).slice(0, 7)
}
