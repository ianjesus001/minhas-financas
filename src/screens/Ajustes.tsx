import { useRef, useState } from 'react'
import { hoje } from '../calc'
import { baixarExcel } from '../excel/exportXlsx'
import { fmtData } from '../format'
import { getState, setState, updateConfig, useAppState, validar } from '../store'
import { Button, Details, Field, Header, Info, MoneyInput, SectionTitle, inputCls } from '../ui'

const DICIONARIO: [string, string][] = [
  ['CDI', 'A "régua" de quanto seu dinheiro rende. É a taxa que os bancos usam para emprestar dinheiro entre eles.'],
  ['Selic', 'A taxa de juros oficial do Brasil, decidida pelo Banco Central. O CDI anda quase colado nela.'],
  ['100% do CDI', 'O banco te paga exatamente o CDI. 110% paga um pouco mais; 90% um pouco menos.'],
  ['Caixinha / CDB', 'O lugar onde o dinheiro fica rendendo. Tem garantia do FGC até R$ 250 mil por banco.'],
  ['Liquidez diária', 'Você pode tirar o dinheiro quando quiser, no mesmo dia.'],
  ['Aporte', 'Palavra chique para "dinheiro que eu coloquei" no investimento.'],
  ['Resgate', 'Tirar o dinheiro do investimento e voltar para a conta.'],
  ['Rendimento', 'O dinheiro que o investimento te deu, além do que você colocou.'],
  ['IR', 'Imposto só sobre o rendimento, cobrado no resgate. Quanto mais tempo guardado, menos imposto (de 22,5% até 15%).'],
  ['IOF', 'Outro imposto. No CDI só existe se tirar antes de 30 dias. No dólar, vem embutido no preço.'],
  ['Cotação', 'Quantos reais custa 1 dólar. Se é R$ 5,00, US$ 100 custam R$ 500 (mais taxas).'],
  ['Reserva de emergência', 'Dinheiro para imprevistos. Uma meta comum é ter de 3 a 6 meses dos seus gastos no CDI.'],
]

export function Ajustes({ onBack }: { onBack: () => void }) {
  const s = useAppState()
  const c = s.config
  const [exportando, setExportando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportar() {
    setExportando(true)
    try {
      await baixarExcel(getState())
    } catch (e) {
      alert('Não consegui gerar a planilha. Tente de novo.')
      console.error(e)
    } finally {
      setExportando(false)
    }
  }

  function backup() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `minhas-financas-backup-${hoje()}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function restaurar(f: File) {
    try {
      const st = validar(JSON.parse(await f.text()))
      if (!st) throw new Error('inválido')
      if (confirm('Isso vai substituir todos os dados do app pelos do backup. Continuar?')) setState(st)
    } catch {
      alert('Esse arquivo não é um backup do app.')
    }
  }

  return (
    <div>
      <Header
        title="Ajustes"
        subtitle="Configurações e ajuda"
        right={
          <button onClick={onBack} className="press rounded-2xl bg-white px-4 py-2.5 text-sm font-bold shadow-sm">
            Pronto
          </button>
        }
      />

      <div className="card p-5">
        <Field label="Seu nome">
          <input className={inputCls} value={c.nome} onChange={(e) => updateConfig({ nome: e.target.value })} placeholder="Como quer ser chamada?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CDI ao ano (%)" hint="Pesquise 'CDI hoje'">
            <MoneyInput prefix="%" value={+(c.cdiAnual * 100).toFixed(2)} onChange={(v) => v > 0 && updateConfig({ cdiAnual: v / 100 })} />
          </Field>
          <Field label="% do CDI do banco" hint="Nubank = 100">
            <MoneyInput prefix="%" value={+(c.pctCdi * 100).toFixed(0)} onChange={(v) => v > 0 && updateConfig({ pctCdi: v / 100 })} />
          </Field>
        </div>
      </div>

      <SectionTitle>📊 Planilha do Excel</SectionTitle>
      <div className="card p-5">
        <p className="mb-4 text-sm text-muted">Gera a planilha "Minhas Finanças" com tudo o que você anotou no app. Ótimo para guardar uma cópia ou ver no computador.</p>
        <Button onClick={exportar} disabled={exportando}>
          {exportando ? 'Gerando...' : '⬇️ Exportar para Excel'}
        </Button>
      </div>

      <SectionTitle>🛟 Backup</SectionTitle>
      <div className="card p-5">
        <Info tone="gold">
          Seus dados ficam só neste celular. Faça um backup de vez em quando (e antes de trocar de celular) e guarde no Google Drive ou mande para você no WhatsApp.
        </Info>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="soft" onClick={backup}>
            💾 Fazer backup
          </Button>
          <Button variant="soft" onClick={() => fileRef.current?.click()}>
            📂 Restaurar backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) restaurar(f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <SectionTitle>📚 Dicionário sem complicação</SectionTitle>
      <div className="space-y-2">
        {DICIONARIO.map(([t, d]) => (
          <Details key={t} summary={t}>
            {d}
          </Details>
        ))}
      </div>

      <SectionTitle>📱 Instalar no celular</SectionTitle>
      <Info tone="blue">
        <b>iPhone:</b> no Safari, toque em Compartilhar → "Adicionar à Tela de Início".
        <br />
        <b>Android:</b> no Chrome, toque em ⋮ → "Instalar app" ou "Adicionar à tela inicial".
      </Info>

      <p className="mt-8 text-center text-xs text-muted">
        Valores iniciais de CDI e dólar: {fmtData('2026-10-26', { day: '2-digit', month: '2-digit', year: 'numeric' })}. Os cálculos são estimativas; o valor oficial é o do
        app do seu banco. Não é recomendação de investimento.
      </p>
    </div>
  )
}
