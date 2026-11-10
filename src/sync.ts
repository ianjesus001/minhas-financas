// Sincronização com a planilha do Google "Meus Reais e Dólares" pelo Apps Script (tools/apps-script/Codigo.gs).
// Não é tempo real: "Salvar" manda reais e dólares do app para a planilha (substitui as abas)
// e "Trazer" faz o contrário. O CDI vem das linhas Guardei/Resgatei da caixinha do Meus Reais.
import { CAT_CDI, CAT_DOLAR, CAT_RESGATE } from './categorias'
import { getState, novoId, setState } from './store'
import type { AppState, CompraDolar, ISODate, MovCDI, Movimento } from './types'

/** Nomes que mudam entre o app e a planilha. */
const CAT_APP_PARA_PLANILHA: Record<string, string> = { [CAT_CDI]: '🌱 Guardei (caixinha / CDI)' }
const CAT_PLANILHA_PARA_APP = Object.fromEntries(Object.entries(CAT_APP_PARA_PLANILHA).map(([a, p]) => [p, a]))

interface LinhaReais {
  data: ISODate
  descricao: string
  categoria: string
  valor: number
}
interface LinhaDolar {
  data: ISODate
  onde: string
  pagouBRL: number
  recebeuUSD: number
  cambio: number | null
  taxas: number | null
}

export function lerLink(link: string): { url: string; k: string } | null {
  try {
    const u = new URL(link.trim())
    const k = u.searchParams.get('k')
    const google = /^https:\/\/script\.google(usercontent)?\.com\//.test(u.href)
    if (!(google || u.hostname === 'localhost') || !k) return null // localhost: servidor de teste
    return { url: `${u.origin}${u.pathname}`, k }
  } catch {
    return null
  }
}

async function chamar<T>(link: string, init?: { corpo: object }): Promise<T> {
  const c = lerLink(link)
  if (!c) throw new Error('Link de conexão inválido.')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const r = init
      ? await fetch(c.url, {
          method: 'POST',
          // text/plain evita o "preflight" de CORS, que o Apps Script não responde
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ k: c.k, ...init.corpo }),
          signal: ctrl.signal,
        })
      : await fetch(`${c.url}?k=${encodeURIComponent(c.k)}&acao=ler&t=${Date.now()}`, { signal: ctrl.signal })
    const j = await r.json()
    if (!j.ok) throw new Error(j.erro || 'A planilha respondeu com erro.')
    return j as T
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('A planilha demorou demais para responder.')
    if (e instanceof TypeError) throw new Error('Sem conexão com a planilha. Confira a internet e o link.')
    throw e
  } finally {
    clearTimeout(t)
  }
}

/** Testa o link e devolve o nome da planilha. */
export async function testarLink(link: string): Promise<string> {
  const c = lerLink(link)
  if (!c) throw new Error('Esse link não parece o do Apps Script (precisa terminar com ?k=…).')
  const r = await fetch(`${c.url}?k=${encodeURIComponent(c.k)}&t=${Date.now()}`).catch(() => {
    throw new Error('Não consegui falar com a planilha. Confira a internet e o link.')
  })
  const j = await r.json().catch(() => ({ ok: false, erro: 'Resposta inesperada. Confira se a implantação é "App da Web" com acesso "Qualquer pessoa".' }))
  if (!j.ok) throw new Error(j.erro)
  return j.planilha as string
}

// ---------- o que conta como "mudou" ----------

function hashTexto(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

const ordem = <T extends { data: string }>(xs: T[]) => [...xs].sort((a, b) => a.data.localeCompare(b.data))

function paraPlanilha(s: AppState) {
  const reais: LinhaReais[] = ordem(s.movimentos).map((m) => ({
    data: m.data,
    descricao: m.descricao,
    categoria: CAT_APP_PARA_PLANILHA[m.categoria] ?? m.categoria,
    valor: m.valor,
  }))
  const dolares: LinhaDolar[] = ordem(s.dolares).map((d) => ({
    data: d.data,
    onde: d.onde,
    pagouBRL: d.pagouBRL,
    recebeuUSD: d.recebeuUSD,
    cambio: d.cambio ?? null,
    taxas: d.taxas ?? null,
  }))
  return { reais, dolares }
}

export const hashDados = (s: AppState) => hashTexto(JSON.stringify(paraPlanilha(s)))

/** O app tem reais/dólares diferentes do que estava na planilha na última sincronização. */
export function mudancasPendentes(s: AppState): boolean {
  if (!s.config.planilhaLink) return false
  return s.config.planilhaSync?.hash !== hashDados(s)
}

const marcarSincronizado = (s: AppState): AppState => ({
  ...s,
  config: { ...s.config, planilhaSync: { em: new Date().toISOString(), hash: hashDados(s) } },
})

// ---------- ações ----------

export async function salvarNaPlanilha(): Promise<{ reais: number; dolares: number }> {
  const s = getState()
  const r = await chamar<{ reais: number; dolares: number }>(s.config.planilhaLink, { corpo: { acao: 'salvar', ...paraPlanilha(s) } })
  // salva o hash do estado que foi enviado (se ela anotou algo enquanto enviava, continua pendente)
  setState((atual) => ({ ...atual, config: { ...atual.config, planilhaSync: { em: new Date().toISOString(), hash: hashDados(s) } } }))
  return r
}

/**
 * Substitui reais, dólares e CDI do app pelos da planilha. O CDI é montado a partir das linhas
 * "Guardei" e "Resgatei da caixinha" do Meus Reais, igual à aba Meu CDI da planilha.
 */
export async function trazerDaPlanilha(): Promise<{ reais: number; dolares: number; cdi: number }> {
  const s0 = getState()
  const r = await chamar<{ reais: LinhaReais[]; dolares: LinhaDolar[] }>(s0.config.planilhaLink)
  const novo = deLinhas(r.reais, r.dolares)
  setState((s) => marcarSincronizado({ ...s, ...novo }))
  return { reais: novo.movimentos.length, dolares: novo.dolares.length, cdi: novo.cdi.length }
}
/** Uma data digitada na coluna de descrição chega como "Tue Nov 10 2026 05:00:00 GMT…": vira "10/11/2026". */
function limparDescricao(s: string): string {
  if (!/^\w{3} \w{3} \d{1,2} \d{4} \d{2}:\d{2}/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR')
}

/**
 * Monta os registros do app a partir das linhas da planilha. Cada "Comprei dólar" é ligado à
 * compra do mesmo dia e valor; cada "Guardei"/"Resgatei da caixinha" vira um registro do CDI.
 */
export function deLinhas(reais: LinhaReais[], dolares: LinhaDolar[]): Pick<AppState, 'movimentos' | 'dolares' | 'cdi'> {
  const compras: CompraDolar[] = dolares.map((d) => ({
    id: novoId(),
    data: d.data,
    onde: d.onde,
    pagouBRL: d.pagouBRL,
    recebeuUSD: d.recebeuUSD,
    ...(d.cambio ? { cambio: d.cambio } : {}),
    ...(d.taxas ? { taxas: d.taxas } : {}),
  }))
  const livres = new Set(compras.map((c) => c.id))
  const cdi: MovCDI[] = []
  const movimentos: Movimento[] = reais.map((l) => {
    const categoria = CAT_PLANILHA_PARA_APP[l.categoria] ?? l.categoria
    const descricao = limparDescricao(l.descricao)
    const m: Movimento = { id: novoId(), data: l.data, descricao, categoria, valor: l.valor }
    if (categoria === CAT_DOLAR) {
      const par = compras.find((c) => livres.has(c.id) && c.data === l.data && Math.abs(c.pagouBRL - l.valor) < 0.005)
      if (par) {
        m.linkId = par.id
        livres.delete(par.id)
      }
    } else if (categoria === CAT_CDI || categoria === CAT_RESGATE) {
      const c: MovCDI = { id: novoId(), data: l.data, tipo: categoria === CAT_CDI ? 'Guardei' : 'Resgatei', valor: l.valor, nota: descricao }
      cdi.push(c)
      m.linkId = c.id
    }
    return m
  })
  return { movimentos, dolares: compras, cdi }
}