import { categoria } from './categorias'
import { cdiAnualAtual, dolarHoje, ptaxEm, type Mercado } from './mercado'
import type { AppState, CompraDolar, Config, ISODate, Movimento } from './types'

export const POUPANCA_MES = 0.0055

export function hoje(): ISODate {
  return toISO(new Date())
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

export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 0.225
  if (dias <= 360) return 0.2
  if (dias <= 720) return 0.175
  return 0.15
}

/** Taxa anual do CDI: a do Banco Central quando disponível, senão a dos Ajustes. */
export function taxas(config: Config, m?: Mercado) {
  const cdi = (m && cdiAnualAtual(m)) ?? config.cdiAnual
  const anual = cdi * config.pctCdi
  return { cdi, anual, mes: Math.pow(1 + anual, 1 / 12) - 1, dia: Math.pow(1 + anual, 1 / 252) - 1 }
}

/**
 * Quanto R$ 1 aplicado em `de` vale em `ate`, rendendo `pct` do CDI.
 * Cada dia útil d em [de, ate) rende o CDI de d (como no extrato do banco).
 * Dias sem dado dentro do período publicado são feriados (não rendem);
 * dias depois do último dado publicado usam o último CDI conhecido.
 */
export function fatorCDI(m: Mercado, de: ISODate, ate: ISODate, pct: number, diaPadrao: number): number {
  const datas = Object.keys(m.cdi).sort()
  const ultimaPublicada = datas[datas.length - 1] ?? null
  let ultimoValor: number | null = null
  for (const d of datas) {
    if (d >= de) break
    ultimoValor = m.cdi[d]
  }
  let fator = 1
  const fim = parseISO(ate)
  for (let dt = parseISO(de); dt < fim; dt.setDate(dt.getDate() + 1)) {
    const w = dt.getDay()
    if (w === 0 || w === 6) continue
    const d = toISO(dt)
    const v = m.cdi[d]
    if (v !== undefined) {
      ultimoValor = v
      fator *= 1 + v * pct
    } else if (ultimaPublicada === null || d > ultimaPublicada) {
      fator *= 1 + (ultimoValor !== null ? ultimoValor * pct : diaPadrao)
    }
    // senão: feriado
  }
  return fator
}

export function resumoCDI(state: AppState, m: Mercado, ate: ISODate = hoje()) {
  const { dia } = taxas(state.config, m)
  const temSerie = Object.keys(m.cdi).length > 0
  let colocado = 0
  let saldo = 0
  let ir = 0
  for (const c of state.cdi) {
    const sinal = c.tipo === 'Resgatei' ? -1 : 1
    const fator = fatorCDI(m, c.data, ate, state.config.pctCdi, dia)
    colocado += sinal * c.valor
    saldo += sinal * c.valor * fator
    ir += sinal * c.valor * (fator - 1) * aliquotaIR(diasCorridos(c.data, ate))
  }
  ir = Math.max(0, ir)
  const app = state.config.saldoApp
  return {
    colocado,
    saldo,
    rendeu: saldo - colocado,
    ir,
    liquido: saldo - ir,
    temSerie,
    /** Diferença entre o saldo do banco (se ela informou) e o calculado. */
    diferencaApp: app !== null ? app - saldo : null,
  }
}

export interface CompraAnalise {
  compra: CompraDolar
  /** Custo efetivo por dólar (VET): tudo o que saiu da conta ÷ dólares recebidos. */
  vet: number
  /** Dólar "de mercado" do dia da compra: câmbio do comprovante, senão PTAX do dia. */
  dolarDia: number | null
  fonteDia: 'comprovante' | 'ptax' | null
  /** R$ pagos acima do dólar de mercado do dia (tarifa + IOF + spread). */
  custoTaxas: number | null
  custoTaxasPct: number | null
  /** Quanto o dólar subiu/caiu desde a compra, em R$. */
  variacao: number | null
  variacaoPct: number | null
  valeHoje: number
  resultado: number
  /** Quanto os mesmos reais teriam virado no CDI. */
  seCDI: number
}

export function analisarCompra(c: CompraDolar, m: Mercado, cotHoje: number, config: Config): CompraAnalise {
  const vet = c.recebeuUSD > 0 ? c.pagouBRL / c.recebeuUSD : 0
  const ptax = ptaxEm(m, c.data)
  const dolarDia = c.cambio && c.cambio > 0 ? c.cambio : ptax
  const fonteDia = c.cambio && c.cambio > 0 ? 'comprovante' : ptax ? 'ptax' : null
  const valeHoje = c.recebeuUSD * cotHoje
  const { dia } = taxas(config, m)
  return {
    compra: c,
    vet,
    dolarDia,
    fonteDia,
    custoTaxas: dolarDia ? c.pagouBRL - c.recebeuUSD * dolarDia : null,
    custoTaxasPct: dolarDia ? vet / dolarDia - 1 : null,
    variacao: dolarDia ? c.recebeuUSD * (cotHoje - dolarDia) : null,
    variacaoPct: dolarDia ? cotHoje / dolarDia - 1 : null,
    valeHoje,
    resultado: valeHoje - c.pagouBRL,
    seCDI: c.pagouBRL * fatorCDI(m, c.data, hoje(), config.pctCdi, dia),
  }
}

export function resumoDolar(state: AppState, m: Mercado) {
  const cot = dolarHoje(m, state.config.cotacaoDolar)
  const compras = state.dolares.map((c) => analisarCompra(c, m, cot.valor, state.config))
  const soma = (f: (a: CompraAnalise) => number | null) => compras.reduce((s, a) => s + (f(a) ?? 0), 0)
  const usd = state.dolares.reduce((s, d) => s + d.recebeuUSD, 0)
  const pago = state.dolares.reduce((s, d) => s + d.pagouBRL, 0)
  const vale = usd * cot.valor
  const { metaUSD } = state.config
  return {
    cot,
    compras,
    usd,
    pago,
    media: usd > 0 ? pago / usd : 0,
    vale,
    ganho: vale - pago,
    ganhoPct: pago > 0 ? (vale - pago) / pago : 0,
    custoTaxas: soma((a) => a.custoTaxas),
    variacao: soma((a) => a.variacao),
    seCDI: soma((a) => a.seCDI),
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

export function nomeMes(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function somaMes(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return toISO(new Date(y, m - 1 + delta, 1)).slice(0, 7)
}
