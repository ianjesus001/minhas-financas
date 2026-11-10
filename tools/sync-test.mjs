// Testa a sincronização com a planilha usando um servidor que imita o Apps Script (tools/apps-script/Codigo.gs).
// Uso: npm run build && npm run preview  (em outro terminal)  e depois:  node tools/sync-test.mjs
import http from 'node:http'
import { devices, webkit } from 'playwright'

const APP = process.argv[2] ?? 'http://localhost:4173/minhas-financas/'
const CHAVE = 'teste123'
let planilha = {
  reais: [
    { data: '2026-10-26', descricao: 'Resgate CDI Inter → Nubank', categoria: '↩️ Resgatei da caixinha', valor: 790 },
    { data: '2026-10-26', descricao: 'Caixinha Nubank', categoria: '🌱 Guardei (caixinha / CDI)', valor: 796 },
    { data: '2026-11-09', descricao: 'Salário', categoria: '💼 Salário', valor: 600 },
    { data: '2026-11-09', descricao: 'Wise', categoria: '💵 Comprei dólar', valor: 600 },
  ],
  dolares: [
    { data: '2026-10-28', onde: 'Wise', pagouBRL: 457, recebeuUSD: 81.87, cambio: 5.3544, taxas: 18.62 },
    { data: '2026-11-09', onde: 'Wise', pagouBRL: 600, recebeuUSD: 104.4, cambio: 5.5174, taxas: 23.97 },
  ],
}
let recebido = null

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost')
  const responder = (obj) => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(obj))
  }
  if (req.method === 'GET') {
    if (u.searchParams.get('k') !== CHAVE) return responder({ ok: false, erro: 'Chave inválida.' })
    if (u.searchParams.get('acao') === 'ler') return responder({ ok: true, ...planilha })
    return responder({ ok: true, planilha: 'Meus Reais e Dólares' })
  }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const j = JSON.parse(body)
    if (j.k !== CHAVE) return responder({ ok: false, erro: 'Chave inválida.' })
    recebido = { contentType: req.headers['content-type'], ...j }
    planilha = { reais: j.reais, dolares: j.dolares }
    responder({ ok: true, reais: j.reais.length, dolares: j.dolares.length })
  })
})
await new Promise((r) => server.listen(4174, r))

const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`)
  if (!cond) process.exitCode = 1
}
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 15'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(e.message))
page.on('dialog', (d) => d.accept())
const estado = () => page.evaluate(() => JSON.parse(localStorage.getItem('minhas-financas:v1')))

await page.goto(APP)
await page.getByRole('button', { name: /Começar/ }).click()
await page.getByRole('button', { name: 'Ajustes' }).click()

// chave errada
await page.getByPlaceholder('https://script.google.com/…?k=…').fill('http://localhost:4174/exec?k=errada')
await page.getByRole('button', { name: /Conectar/ }).click()
await page.getByText('Chave inválida.').waitFor()
ok(true, 'chave errada mostra erro e não conecta')

await page.getByPlaceholder('https://script.google.com/…?k=…').fill(`http://localhost:4174/exec?k=${CHAVE}`)
await page.getByRole('button', { name: /Conectar/ }).click()
await page.getByText(/Conectado a "Meus Reais e Dólares"/).waitFor()
ok(true, 'conecta com a chave certa')

await page.getByRole('button', { name: /Trazer da planilha/ }).click()
await page.getByText(/4 registros em reais, 2 compras de dólar e 2 movimentos da caixinha/).waitFor()
let st = await estado()
ok(st.movimentos.length === 4 && st.dolares.length === 2, 'trouxe 4 registros em reais e 2 compras')
ok(st.cdi.length === 2 && st.cdi.some((c) => c.tipo === 'Guardei' && c.valor === 796) && st.cdi.some((c) => c.tipo === 'Resgatei' && c.valor === 790), 'aba CDI montada a partir da planilha (guardei + resgatei)')
ok(st.movimentos.filter((m) => /Guardei no CDI|Resgatei/.test(m.categoria)).every((m) => st.cdi.some((c) => c.id === m.linkId)), 'cada linha da caixinha ligada ao seu registro de CDI')
const compra = st.dolares.find((d) => d.data === '2026-11-09')
ok(compra?.cambio === 5.5174 && st.movimentos.some((m) => m.linkId === compra.id), 'compra de 09/11 ligada ao Meus Reais')
ok(!st.cdi.some((c) => c.id === 'inicio'), 'CDI de exemplo do app foi substituído pelo da planilha')

// anota um gasto e salva pelo aviso do Início
await page.getByRole('button', { name: 'Pronto' }).click()
ok(!(await page.getByText('Há mudanças não salvas').isVisible()), 'sem aviso logo depois de trazer')
await page.getByRole('button', { name: 'Anotar', exact: true }).first().click()
const d = page.locator('[role=dialog]')
await d.getByRole('button', { name: /Gastei/ }).click()
await d.locator('input[inputmode=decimal]').first().fill('35,90')
await d.getByRole('button', { name: /Mercado/ }).click()
await d.locator('button[type=submit]').click()
await page.getByText('Há mudanças não salvas').waitFor()
ok(true, 'aviso de mudanças não salvas aparece')
await page.getByRole('button', { name: 'Salvar', exact: true }).click()
await page.getByText('Salvo na planilha!').waitFor()
ok(recebido?.contentType?.startsWith('text/plain'), 'POST sem preflight (text/plain)')
ok(recebido?.reais.length === 5 && recebido.reais.some((r) => r.categoria === '🛒 Mercado' && r.valor === 35.9), 'planilha recebeu o gasto novo')
ok(recebido?.reais.some((r) => r.categoria === '🌱 Guardei (caixinha / CDI)') && recebido.reais.some((r) => r.categoria === '↩️ Resgatei da caixinha'), 'categorias da caixinha voltam com o nome da planilha')
ok(recebido?.dolares.length === 2 && recebido.dolares.every((x) => x.cambio && x.taxas), 'compras de dólar com câmbio e taxas')
await page.waitForTimeout(3500)
ok(!(await page.getByText('Há mudanças não salvas').isVisible()), 'aviso some depois de salvar')

ok(erros.length === 0, `sem erros de JavaScript${erros.length ? ': ' + erros.join(' | ') : ''}`)
await browser.close()
server.close()
