// Run: node tools/test-export.mjs   (Node >= 22.6; imports the .ts directly via type stripping)
// Writes tools/out-test.xlsx built from a sample state and the public/template.xlsx template.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { gerarExcel } from '../src/excel/exportXlsx.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tpl = readFileSync(join(root, 'public', 'template.xlsx'))
const ab = tpl.buffer.slice(tpl.byteOffset, tpl.byteOffset + tpl.byteLength)

const now = new Date()
const p = (n) => String(n).padStart(2, '0')
const ym = `${now.getFullYear()}-${p(now.getMonth() + 1)}`
const hoje = `${ym}-${p(now.getDate())}`

const state = {
  version: 1,
  config: {
    nome: 'Ana & <Cia>',
    cdiAnual: 0.1365, pctCdi: 1, saldoApp: null, saldoAppData: null,
    cotacaoDolar: 5.2, cotacaoData: hoje, metaUSD: 1000,
    simInicial: 500, simMensal: 300, simMeses: 24,
  },
  movimentos: [
    // propositalmente fora de ordem
    { id: '3', data: `${ym}-05`, descricao: 'Mercado "Big" & Cia 🛒', categoria: '🛒 Mercado', valor: 200 },
    { id: '1', data: `${ym}-01`, descricao: 'Salário', categoria: '💼 Salário', valor: 3000 },
    { id: '2', data: `${ym}-03`, descricao: 'Aluguel', categoria: '🏠 Moradia (aluguel, condomínio)', valor: 1000 },
  ],
  cdi: [
    { id: 'c2', data: `${ym}-04`, tipo: 'Resgatei', valor: 100, nota: 'precisei' },
    { id: 'c1', data: `${ym}-02`, tipo: 'Guardei', valor: 500, nota: 'início' },
  ],
  dolares: [{ id: 'd1', data: `${ym}-02`, onde: 'Wise', pagouBRL: 520, recebeuUSD: 100 }],
}

const blob = await gerarExcel(state, ab)
writeFileSync(join(root, 'tools', 'out-test.xlsx'), Buffer.from(await blob.arrayBuffer()))
console.log('ok -> tools/out-test.xlsx', blob.size, 'bytes')
