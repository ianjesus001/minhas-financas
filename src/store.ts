import { useSyncExternalStore } from 'react'
import { CAT_CDI, CAT_DOLAR, CAT_RESGATE, categoria } from './categorias'
import type { AppState, CompraDolar, Config, ISODate, MovCDI, Movimento } from './types'

const KEY = 'minhas-financas:v1'

export const CONFIG_PADRAO: Config = {
  nome: '',
  cdiAnual: 0.1365,
  pctCdi: 1,
  saldoApp: null,
  saldoAppData: null,
  cotacaoDolar: 5.0,
  cotacaoData: '2026-10-26',
  metaUSD: 1000,
  simInicial: 796,
  simMensal: 300,
  simMeses: 24,
  planilhaLink: '',
  planilhaNome: '',
  planilhaSync: null,
}

const ESTADO_INICIAL: AppState = {
  version: 1,
  config: CONFIG_PADRAO,
  movimentos: [],
  cdi: [{ id: 'inicio', data: '2026-10-26', tipo: 'Guardei', valor: 796, nota: 'Meu primeiro depósito! 🎉' }],
  // Comprovante Wise #6365993574 (28/10/2026). Fora do Meu Mês: não sabemos de qual mês saiu o dinheiro.
  dolares: [{ id: 'wise-6365993574', data: '2026-10-28', onde: 'Wise', pagouBRL: 457, recebeuUSD: 81.87, cambio: 5.3544, taxas: 18.62 }],
}

export function validar(x: unknown): AppState | null {
  const s = x as AppState
  if (!s || s.version !== 1 || !Array.isArray(s.movimentos) || !Array.isArray(s.cdi) || !Array.isArray(s.dolares)) return null
  return { ...s, config: { ...CONFIG_PADRAO, ...s.config } }
}

function carregar(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return validar(JSON.parse(raw)) ?? ESTADO_INICIAL
  } catch {
    /* sem storage: começa do zero */
  }
  return ESTADO_INICIAL
}

let state: AppState = carregar()
const listeners = new Set<() => void>()

export function setState(next: AppState | ((s: AppState) => AppState)) {
  state = typeof next === 'function' ? next(state) : next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* storage cheio ou bloqueado */
  }
  listeners.forEach((l) => l())
}

export const getState = () => state

/** Estado do app. Com `sel`, o seletor precisa devolver um valor estável (primitivo ou parte do estado). */
export function useAppState(): AppState
export function useAppState<T>(sel: (s: AppState) => T): T
export function useAppState<T>(sel?: (s: AppState) => T): AppState | T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (sel ? sel(state) : state),
  )
}

export function primeiraVez(): boolean {
  try {
    return localStorage.getItem(KEY) === null
  } catch {
    return true
  }
}

export const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

export const updateConfig = (patch: Partial<Config>) => setState((s) => ({ ...s, config: { ...s.config, ...patch } }))

// ---------- lançamentos ----------
// Um lançamento é o que ela anota pelo botão "+". Alguns viram dois registros
// (ex.: comprar dólar = compra na aba Dólares + saída no Meu Mês), ligados pelo mesmo id.

export type Lancamento =
  | { tipo: 'gasto' | 'entrada'; data: ISODate; valor: number; categoria: string; descricao: string }
  | { tipo: 'cdi'; data: ISODate; valor: number; resgate: boolean; nota: string; noMes: boolean }
  | {
      tipo: 'dolar'
      data: ISODate
      pagouBRL: number
      recebeuUSD: number
      onde: string
      noMes: boolean
      cambio?: number
      taxas?: number
      vet?: number
    }

/** Remove um lançamento (e o registro ligado a ele) pelo id de qualquer um dos lados. */
function semLancamento(s: AppState, id: string): AppState {
  const mov = s.movimentos.find((m) => m.id === id)
  const link = mov?.linkId ?? id
  return {
    ...s,
    movimentos: s.movimentos.filter((m) => m.id !== id && m.linkId !== link),
    cdi: s.cdi.filter((c) => c.id !== link),
    dolares: s.dolares.filter((d) => d.id !== link),
  }
}

export function apagarLancamento(id: string) {
  setState((s) => semLancamento(s, id))
}

/** Cria ou substitui (quando `idAntigo` é dado) um lançamento. */
export function salvarLancamento(l: Lancamento, idAntigo?: string) {
  setState((s0) => {
    const s = idAntigo ? semLancamento(s0, idAntigo) : s0
    const id = novoId()
    const movimentos: Movimento[] = [...s.movimentos]
    const cdi: MovCDI[] = [...s.cdi]
    const dolares: CompraDolar[] = [...s.dolares]

    if (l.tipo === 'gasto' || l.tipo === 'entrada') {
      movimentos.push({ id, data: l.data, descricao: l.descricao, categoria: l.categoria, valor: l.valor })
    } else if (l.tipo === 'cdi') {
      cdi.push({ id, data: l.data, tipo: l.resgate ? 'Resgatei' : 'Guardei', valor: l.valor, nota: l.nota })
      if (l.noMes)
        movimentos.push({
          id: novoId(),
          linkId: id,
          data: l.data,
          descricao: l.nota || (l.resgate ? 'Resgate do CDI' : 'Guardei no CDI'),
          categoria: l.resgate ? CAT_RESGATE : CAT_CDI,
          valor: l.valor,
        })
    } else if (l.tipo === 'dolar') {
      const opcional = (v?: number) => (v && v > 0 ? v : undefined)
      dolares.push({
        id,
        data: l.data,
        onde: l.onde,
        pagouBRL: l.pagouBRL,
        recebeuUSD: l.recebeuUSD,
        cambio: opcional(l.cambio),
        taxas: opcional(l.taxas),
        vet: opcional(l.vet),
      })
      if (l.noMes)
        movimentos.push({
          id: novoId(),
          linkId: id,
          data: l.data,
          descricao: l.onde ? `Compra de dólar (${l.onde})` : 'Compra de dólar',
          categoria: CAT_DOLAR,
          valor: l.pagouBRL,
        })
    }
    return { ...s, movimentos, cdi, dolares }
  })
}

/** Reconstrói o Lancamento a partir de um registro salvo, para editar. */
export function lancamentoDe(s: AppState, id: string): { lanc: Lancamento; id: string } | null {
  const mov = s.movimentos.find((m) => m.id === id)
  const link = mov?.linkId ?? id
  const c = s.cdi.find((x) => x.id === link)
  if (c) {
    const noMes = s.movimentos.some((m) => m.linkId === c.id)
    return { id: c.id, lanc: { tipo: 'cdi', data: c.data, valor: c.valor, resgate: c.tipo === 'Resgatei', nota: c.nota, noMes } }
  }
  const d = s.dolares.find((x) => x.id === link)
  if (d) {
    const noMes = s.movimentos.some((m) => m.linkId === d.id)
    return {
      id: d.id,
      lanc: { tipo: 'dolar', data: d.data, pagouBRL: d.pagouBRL, recebeuUSD: d.recebeuUSD, onde: d.onde, noMes, cambio: d.cambio, taxas: d.taxas, vet: d.vet },
    }
  }
  if (mov) {
    const entrada = categoria(mov.categoria)?.tipo === 'Entrada'
    return { id: mov.id, lanc: { tipo: entrada ? 'entrada' : 'gasto', data: mov.data, valor: mov.valor, categoria: mov.categoria, descricao: mov.descricao } }
  }
  return null
}
