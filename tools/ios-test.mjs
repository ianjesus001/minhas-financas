// Teste no motor do Safari (WebKit) simulando um iPhone.
// Uso: npm run build && npm run preview  (em outro terminal)  e depois:
//   node tools/ios-test.mjs [url]
// Salva capturas em tools/shots/ e falha se houver erro de JavaScript.
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { devices, webkit } from 'playwright'

const APP_URL = process.argv[2] ?? 'http://localhost:4173/minhas-financas/'
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url))
mkdirSync(SHOTS, { recursive: true })

const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 15'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && erros.push(`console: ${m.text()}`))
page.on('dialog', (d) => d.accept())

const shot = (n) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: true })
const dialog = () => page.locator('[role=dialog]')
const tab = (nome) => page.locator('nav button', { hasText: nome }).click()
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`)
  if (!cond) process.exitCode = 1
}

await page.goto(APP_URL)
await dialog().getByText('Bem-vinda').waitFor({ timeout: 5000 }).catch(() => {})
ok(await dialog().getByText('Bem-vinda').isVisible(), 'boas-vindas aparece na primeira vez')
await dialog().getByPlaceholder('Seu nome').fill('Ana')
await dialog().getByRole('button', { name: /Começar/ }).click()
ok(await page.getByText('Instale o app antes de começar').isVisible(), 'aviso de instalação no Safari do iPhone')
ok(await page.getByText('Adicionar à Tela de Início').first().isVisible(), 'passos do iPhone no aviso')

// dados de mercado (Banco Central + AwesomeAPI)
await page.waitForFunction(() => {
  const m = JSON.parse(localStorage.getItem('minhas-financas:mercado') || '{}')
  return m.cdi && Object.keys(m.cdi).length > 0 && m.dolarAgora
}, null, { timeout: 20000 })
ok(true, 'CDI e dólar carregados das APIs')
await shot('01-inicio')

async function anotar(tipo, preencher) {
  await page.getByRole('button', { name: 'Anotar', exact: true }).first().click()
  await dialog().getByRole('button', { name: new RegExp(tipo) }).click()
  await preencher(dialog())
  await dialog().locator('button[type=submit]').click()
  await dialog().waitFor({ state: 'detached' })
}

await anotar('Recebi', async (d) => {
  await d.locator('input[inputmode=decimal]').first().fill('600')
  await d.getByRole('button', { name: /Salário/ }).click()
})
await anotar('Comprei dólar', async (d) => {
  const money = d.locator('input[inputmode=decimal]')
  await money.nth(0).fill('457,00')
  await money.nth(1).fill('81,87')
  await d.getByText('Mais dados do comprovante').click()
  await money.nth(2).fill('5,3544')
  await money.nth(3).fill('18,62')
  await d.getByPlaceholder('Wise, Nomad, banco...').fill('Wise')
  await d.locator('input[type=date]').fill('2026-11-03')
  ok(await d.getByText('5,5820').isVisible(), 'VET calculado no formulário (R$ 5,5820)')
  await shot('02-form-dolar')
})
await anotar('Gastei', async (d) => {
  await d.locator('input[inputmode=decimal]').first().fill('40,50')
  await d.getByRole('button', { name: /Mercado/ }).click()
})

const st = await page.evaluate(() => JSON.parse(localStorage.getItem('minhas-financas:v1')))
const compra = st.dolares[0]
ok(compra && compra.pagouBRL === 457 && compra.recebeuUSD === 81.87 && compra.cambio === 5.3544 && compra.taxas === 18.62, 'compra salva com campos do Wise')
ok(st.movimentos.some((m) => m.linkId === compra.id && m.valor === 457), 'compra também aparece no Meu Mês')
await shot('03-inicio-com-dados')

await tab('Dólar')
await page.getByText('Meu resultado').waitFor()
const txtDolar = await page.locator('main, #root').first().innerText()
ok(/Custo das taxas/.test(txtDolar) && /Variação do dólar/.test(txtDolar), 'desglose do dólar aparece')
ok(/Câmbio do dia/.test(txtDolar), 'usa o câmbio do comprovante')
await shot('04-dolar')

await tab('CDI')
await page.getByText('Calculado com o CDI oficial').waitFor()
ok(true, 'CDI calculado com a série oficial')
await shot('05-cdi')
await tab('Mês')
await shot('06-mes')
await tab('Simular')
await shot('07-simular')

await tab('Início')
await page.getByRole('button', { name: 'Ajustes' }).click()
await page.getByRole('button', { name: /Gerar planilha/ }).click()
await page.getByRole('button', { name: /Salvar \/ enviar planilha/ }).waitFor({ timeout: 15000 })
ok(true, 'planilha gerada no WebKit')
// restaurar backup (seletor de arquivo)
const backup = { ...st, config: { ...st.config, nome: 'Restaurada' } }
await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
await page.waitForFunction(() => JSON.parse(localStorage.getItem('minhas-financas:v1')).config.nome === 'Restaurada')
ok(true, 'restaurar backup funciona')
await shot('08-ajustes')

ok(erros.length === 0, `sem erros de JavaScript${erros.length ? ': ' + erros.join(' | ') : ''}`)
await browser.close()
