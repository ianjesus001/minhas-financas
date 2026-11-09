import JSZip from 'jszip'
import type { AppState, ISODate } from '../types'

/** Valor a escrever numa célula: número, texto, ou null/undefined = deixar vazia. */
export type CellValue = number | string | null | undefined
export type Edits = Map<string, CellValue>

const MAX_ROWS = 400
const FIRST_ROW = 6

// ---------------------------------------------------------------- helpers puros

/** 'YYYY-MM-DD' -> número de série do Excel (dias desde 1899-12-30). null se inválido. */
export function dateSerial(iso: ISODate | null | undefined): number | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  if (!Number.isFinite(t)) return null
  return Math.round((t - Date.UTC(1899, 11, 30)) / 86400000)
}

export function escapeXml(s: string): string {
  return (
    s
      // caracteres de controle proibidos em XML 1.0
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

function colToNum(col: string): number {
  let n = 0
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function splitRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!
  return { col: m[1], row: +m[2] }
}

function cellXml(ref: string, style: string | null, v: CellValue): string {
  const s = style != null ? ` s="${style}"` : ''
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`
  if (typeof v === 'string' && v !== '') {
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`
  }
  return `<c r="${ref}"${s}/>`
}

function styleOf(attrs: string): string | null {
  const m = /\ss="([^"]*)"/.exec(attrs)
  return m ? m[1] : null
}

/**
 * Aplica as edições ao XML de uma planilha, preservando o atributo de estilo (s="…").
 * Células que não existem são inseridas na ordem certa dentro da linha (e a linha é criada se faltar).
 */
export function applyEdits(xml: string, edits: Edits): string {
  const pending = new Map(edits)
  const out = xml.replace(
    /<c r="([A-Z]+\d+)"([^>]*?)(\/>|>[\s\S]*?<\/c>)/g,
    (whole: string, ref: string, attrs: string) => {
      if (!pending.has(ref)) return whole
      const v = pending.get(ref)
      pending.delete(ref)
      return cellXml(ref, styleOf(attrs), v)
    },
  )
  if (pending.size === 0) return out
  return insertMissing(out, pending)
}

function insertMissing(xml: string, pending: Edits): string {
  const byRow = new Map<number, [string, CellValue][]>()
  for (const [ref, v] of pending) {
    if (v == null || v === '') continue // nada a escrever numa célula inexistente
    const { row } = splitRef(ref)
    if (!byRow.has(row)) byRow.set(row, [])
    byRow.get(row)!.push([ref, v])
  }
  for (const [row, cells] of [...byRow].sort((a, b) => a[0] - b[0])) {
    const rowRe = new RegExp(`(<row r="${row}"[^>]*?)(/>|>([\\s\\S]*?)</row>)`)
    const m = rowRe.exec(xml)
    if (m) {
      const head = m[1]
      const inner = m[3] ?? ''
      const existing: { n: number; xml: string }[] = []
      inner.replace(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (w: string, c: string) => {
        existing.push({ n: colToNum(c), xml: w })
        return w
      })
      for (const [ref, v] of cells) existing.push({ n: colToNum(splitRef(ref).col), xml: cellXml(ref, null, v) })
      existing.sort((a, b) => a.n - b.n)
      const rebuilt = `${head}>${existing.map((e) => e.xml).join('')}</row>`
      xml = xml.slice(0, m.index) + rebuilt + xml.slice(m.index + m[0].length)
    } else {
      cells.sort((a, b) => colToNum(splitRef(a[0]).col) - colToNum(splitRef(b[0]).col))
      const rowXml = `<row r="${row}">${cells.map(([r, v]) => cellXml(r, null, v)).join('')}</row>`
      // insere antes da primeira linha com número maior, senão antes de </sheetData>
      let pos = xml.indexOf('</sheetData>')
      const re = /<row r="(\d+)"/g
      let mm: RegExpExecArray | null
      while ((mm = re.exec(xml))) {
        if (+mm[1] > row) {
          pos = mm.index
          break
        }
      }
      if (pos < 0) continue
      xml = xml.slice(0, pos) + rowXml + xml.slice(pos)
    }
  }
  return xml
}

function sortedByDate<T extends { data: ISODate }>(list: T[], what: string): T[] {
  const sorted = list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.data < b.x.data ? -1 : a.x.data > b.x.data ? 1 : a.i - b.i))
    .map((e) => e.x)
  if (sorted.length > MAX_ROWS) {
    console.warn(`[exportXlsx] ${what}: ${sorted.length} linhas; só as ${MAX_ROWS} mais recentes cabem na planilha.`)
    return sorted.slice(-MAX_ROWS)
  }
  return sorted
}

/** Preenche a tabela B..E (linhas 6..405) — linhas sem dado ficam vazias. */
function fillTable(edits: Edits, rows: CellValue[][]): void {
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = FIRST_ROW + i
    const row = rows[i]
    ;['B', 'C', 'D', 'E'].forEach((col, k) => edits.set(`${col}${r}`, row ? row[k] : null))
  }
}

/** Monta as edições por aba. */
export function buildEdits(state: AppState): Record<'comece' | 'mes' | 'cdi' | 'dolar' | 'sim', Edits> {
  const c = state.config
  const comece: Edits = new Map([['C3', c.nome || null]])

  const mes: Edits = new Map()
  fillTable(
    mes,
    sortedByDate(state.movimentos, 'movimentos').map((m) => [dateSerial(m.data), m.descricao, m.categoria, m.valor]),
  )

  const cdi: Edits = new Map()
  fillTable(
    cdi,
    sortedByDate(state.cdi, 'cdi').map((m) => [dateSerial(m.data), m.tipo, m.valor, m.nota]),
  )
  cdi.set('K5', c.cdiAnual)
  cdi.set('K6', c.pctCdi)
  cdi.set('K15', c.saldoApp == null ? null : c.saldoApp)

  const dolar: Edits = new Map()
  fillTable(
    dolar,
    sortedByDate(state.dolares, 'dolares').map((d) => [dateSerial(d.data), d.onde, d.pagouBRL, d.recebeuUSD]),
  )
  dolar.set('K5', c.cotacaoDolar)
  dolar.set('K6', dateSerial(c.cotacaoData))
  dolar.set('K7', c.metaUSD)

  const meses = Math.min(120, Math.max(1, Math.round(Number(c.simMeses)) || 1))
  const sim: Edits = new Map<string, CellValue>([
    ['C5', c.simInicial],
    ['C6', c.simMensal],
    ['C7', meses],
  ])
  return { comece, mes, cdi, dolar, sim }
}

/** Resolve a ordem das abas -> caminho da parte XML via workbook.xml + rels. */
async function sheetPaths(zip: JSZip): Promise<{ name: string; path: string }[]> {
  const wb = await zip.file('xl/workbook.xml')!.async('string')
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
  const relMap = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(m[0])?.[1]
    const target = /\bTarget="([^"]*)"/.exec(m[0])?.[1]
    if (id && target) relMap.set(id, target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, ''))
  }
  const res: { name: string; path: string }[] = []
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]*)"/.exec(m[0])?.[1]
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1]
    if (name && rid && relMap.has(rid)) res.push({ name, path: relMap.get(rid)! })
  }
  return res
}

// ---------------------------------------------------------------- API

function baseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (typeof import.meta !== 'undefined' ? import.meta : undefined) as any
  return meta && meta.env && meta.env.BASE_URL ? meta.env.BASE_URL : '/'
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function gerarExcel(state: AppState, templateBytes?: ArrayBuffer): Promise<Blob> {
  let bytes = templateBytes
  if (!bytes) {
    const res = await fetch(`${baseUrl()}template.xlsx`)
    if (!res.ok) throw new Error(`Não foi possível carregar o modelo da planilha (${res.status}).`)
    bytes = await res.arrayBuffer()
  }
  const zip = await JSZip.loadAsync(bytes)
  const sheets = await sheetPaths(zip)
  if (sheets.length < 6) throw new Error('Modelo da planilha inesperado.')
  const e = buildEdits(state)
  // Ordem das abas: 0 Comece aqui, 2 Meu Mês, 3 Meu CDI, 4 Meus Dólares, 5 Simulador
  const plan: [number, Edits][] = [
    [0, e.comece],
    [2, e.mes],
    [3, e.cdi],
    [4, e.dolar],
    [5, e.sim],
  ]
  for (const [idx, edits] of plan) {
    const path = sheets[idx].path
    const xml = await zip.file(path)!.async('string')
    zip.file(path, applyEdits(xml, edits))
  }
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: XLSX_MIME })
  return new Blob([out as BlobPart], { type: XLSX_MIME })
}

function hojeLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function baixarExcel(state: AppState): Promise<void> {
  const blob = await gerarExcel(state)
  const nome = `Minhas Finanças - ${hojeLocal()}.xlsx`

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  try {
    const file = new File([blob], nome, { type: XLSX_MIME })
    if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: nome })
      return
    }
  } catch (err) {
    // usuário cancelou o compartilhamento: não baixa de novo
    if (err instanceof DOMException && err.name === 'AbortError') return
    // qualquer outro erro: cai no download normal
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 4000)
}
