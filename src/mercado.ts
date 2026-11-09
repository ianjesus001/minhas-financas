// Dados de mercado públicos: CDI diário e dólar PTAX (Banco Central, API SGS) e dólar ao vivo (AwesomeAPI).
// Fica num cache separado dos dados dela (não entra no backup) e funciona offline com o último valor salvo.
import { useSyncExternalStore } from 'react'
import type { AppState, ISODate } from './types'

const KEY = 'minhas-financas:mercado'
const VALIDADE_MS = 30 * 60 * 1000

export interface Mercado {
  /** CDI do dia como fração (0.00050788 = 0,050788% ao dia), só dias úteis. */
  cdi: Record<ISODate, number>
  cdiDesde: ISODate | null
  /** Dólar PTAX venda do dia (R$ por US$), só dias úteis. */
  ptax: Record<ISODate, number>
  ptaxDesde: ISODate | null
  dolarAgora: { valor: number; quando: string } | null
  atualizadoEm: string | null
  erro: string | null
}

const VAZIO: Mercado = { cdi: {}, cdiDesde: null, ptax: {}, ptaxDesde: null, dolarAgora: null, atualizadoEm: null, erro: null }

function carregar(): Mercado {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...VAZIO, ...JSON.parse(raw), erro: null }
  } catch {
    /* sem cache */
  }
  return VAZIO
}

let mercado = carregar()
let carregando = false
const listeners = new Set<() => void>()

function set(m: Mercado) {
  mercado = m
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...m, erro: null }))
  } catch {
    /* sem espaço */
  }
  listeners.forEach((l) => l())
}

export const getMercado = () => mercado

export function useMercado(): Mercado {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => mercado,
  )
}

// ---------- helpers de data ----------
const br = (iso: ISODate) => iso.split('-').reverse().join('/')
const iso = (brDate: string): ISODate => brDate.split('/').reverse().join('-')

function menosDias(isoDate: ISODate, dias: number): ISODate {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d - dias)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function hojeISO(): ISODate {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function getJSON<T>(url: string): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return (await r.json()) as T
  } finally {
    clearTimeout(t)
  }
}

async function serieSGS(codigo: number, de: ISODate, ate: ISODate): Promise<Record<ISODate, number>> {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${br(de)}&dataFinal=${br(ate)}`
  const rows = await getJSON<{ data: string; valor: string }[]>(url)
  const out: Record<ISODate, number> = {}
  for (const r of rows) {
    const v = Number(r.valor)
    if (Number.isFinite(v)) out[iso(r.data)] = v
  }
  return out
}

/** Datas que o app precisa: CDI desde o primeiro depósito; dólar desde 30 dias antes da primeira compra (para o gráfico). */
function inicioNecessario(state: AppState) {
  const hoje = hojeISO()
  const minData = (ds: ISODate[]) => ds.reduce((a, b) => (b < a ? b : a), hoje)
  const cdiDe = minData(state.cdi.map((c) => c.data))
  const dolarDe = menosDias(minData([...state.dolares.map((d) => d.data), menosDias(hoje, 60)]), 30)
  return { cdiDe, dolarDe, hoje }
}

/** Busca o que falta. `forcar` ignora a validade de 30 minutos. */
export async function atualizarMercado(state: AppState, forcar = false) {
  if (carregando) return
  const { cdiDe, dolarDe, hoje } = inicioNecessario(state)
  const fresco = mercado.atualizadoEm && Date.now() - new Date(mercado.atualizadoEm).getTime() < VALIDADE_MS
  const cobreCdi = mercado.cdiDesde !== null && mercado.cdiDesde <= cdiDe
  const cobreDolar = mercado.ptaxDesde !== null && mercado.ptaxDesde <= dolarDe
  if (!forcar && fresco && cobreCdi && cobreDolar) return

  carregando = true
  try {
    // Se já temos o histórico desde o início, basta buscar os últimos 10 dias.
    const cdiBusca = cobreCdi ? menosDias(hoje, 10) : cdiDe
    const ptaxBusca = cobreDolar ? menosDias(hoje, 10) : dolarDe
    const [cdi, ptax, agora] = await Promise.allSettled([
      serieSGS(12, cdiBusca, hoje),
      serieSGS(1, ptaxBusca, hoje),
      getJSON<{ USDBRL: { bid: string; timestamp: string } }>('https://economia.awesomeapi.com.br/json/last/USD-BRL'),
    ])
    const next: Mercado = { ...mercado, erro: null }
    if (cdi.status === 'fulfilled') {
      // a API devolve % ao dia; guardamos como fração
      const conv = Object.fromEntries(Object.entries(cdi.value).map(([d, v]) => [d, v / 100]))
      next.cdi = { ...mercado.cdi, ...conv }
      next.cdiDesde = cobreCdi ? mercado.cdiDesde : cdiDe
    }
    if (ptax.status === 'fulfilled') {
      next.ptax = { ...mercado.ptax, ...ptax.value }
      next.ptaxDesde = cobreDolar ? mercado.ptaxDesde : dolarDe
    }
    if (agora.status === 'fulfilled') {
      const v = Number(agora.value.USDBRL.bid)
      if (Number.isFinite(v) && v > 0) next.dolarAgora = { valor: v, quando: new Date(Number(agora.value.USDBRL.timestamp) * 1000 || Date.now()).toISOString() }
    }
    const falhou = [cdi, ptax, agora].filter((r) => r.status === 'rejected').length
    next.atualizadoEm = falhou === 3 ? mercado.atualizadoEm : new Date().toISOString()
    next.erro = falhou ? 'Sem conexão: usando os últimos valores salvos.' : null
    set(next)
  } finally {
    carregando = false
  }
}

// ---------- consultas ----------

/** Último CDI conhecido como taxa anual (base 252 dias úteis), ou null. */
export function cdiAnualAtual(m: Mercado): number | null {
  const datas = Object.keys(m.cdi).sort()
  if (!datas.length) return null
  return Math.pow(1 + m.cdi[datas[datas.length - 1]], 252) - 1
}

/** PTAX do dia ou do último dia útil antes dele. */
export function ptaxEm(m: Mercado, data: ISODate): number | null {
  let melhor: ISODate | null = null
  for (const d in m.ptax) if (d <= data && (melhor === null || d > melhor)) melhor = d
  return melhor ? m.ptax[melhor] : null
}

/** Dólar de agora: ao vivo, senão último PTAX, senão o valor manual. */
export function dolarHoje(m: Mercado, manual: number): { valor: number; fonte: 'aovivo' | 'ptax' | 'manual'; quando: string | null } {
  if (m.dolarAgora) return { valor: m.dolarAgora.valor, fonte: 'aovivo', quando: m.dolarAgora.quando }
  const datas = Object.keys(m.ptax).sort()
  if (datas.length) return { valor: m.ptax[datas[datas.length - 1]], fonte: 'ptax', quando: datas[datas.length - 1] }
  return { valor: manual, fonte: 'manual', quando: null }
}
