import { useCallback, useEffect, useState } from 'react'
import { AddSheet } from './AddSheet'
import { Ajustes } from './screens/Ajustes'
import { Inicio, Mes } from './screens/Inicio'
import { CDI, Dolar } from './screens/Investimentos'
import { Simular } from './screens/Simular'
import { atualizarMercado } from './mercado'
import { getState, lancamentoDe, primeiraVez, updateConfig, useAppState, type Lancamento } from './store'
import { Button, Sheet, inputCls } from './ui'

type Tab = 'inicio' | 'mes' | 'cdi' | 'dolar' | 'simular' | 'ajustes'

const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'inicio', emoji: '🏠', label: 'Início' },
  { id: 'mes', emoji: '📒', label: 'Mês' },
  { id: 'cdi', emoji: '🌱', label: 'CDI' },
  { id: 'dolar', emoji: '💵', label: 'Dólar' },
  { id: 'simular', emoji: '🔮', label: 'Simular' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('inicio')
  const [add, setAdd] = useState(false)
  const [editar, setEditar] = useState<{ id: string; lanc: Lancamento } | null>(null)
  const [boasVindas, setBoasVindas] = useState(primeiraVez)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  // CDI e dólar: busca ao abrir, ao voltar para o app e quando muda alguma data de depósito/compra.
  const datas = useAppState((s) => [...s.cdi.map((c) => c.data), ...s.dolares.map((d) => d.data)].sort()[0] ?? '')
  useEffect(() => {
    atualizarMercado(getState())
    const onVisible = () => {
      if (document.visibilityState === 'visible') atualizarMercado(getState())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [datas])

  const onEdit = useCallback((id: string) => {
    const e = lancamentoDe(getState(), id)
    if (e) {
      setEditar(e)
      setAdd(true)
    }
  }, [])
  const fechar = useCallback(() => {
    setAdd(false)
    setEditar(null)
  }, [])

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pb-32">
      {tab === 'inicio' && <Inicio onEdit={onEdit} onSettings={() => setTab('ajustes')} onGo={setTab} />}
      {tab === 'mes' && <Mes onEdit={onEdit} />}
      {tab === 'cdi' && <CDI onEdit={onEdit} />}
      {tab === 'dolar' && <Dolar onEdit={onEdit} />}
      {tab === 'simular' && <Simular />}
      {tab === 'ajustes' && <Ajustes onBack={() => setTab('inicio')} />}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 backdrop-blur-lg">
        <div className="relative mx-auto flex max-w-lg items-end justify-around px-2 pt-2">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
          <div className="w-16" />
          {TABS.slice(2).map((t) => (
            <TabButton key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
          <button
            onClick={() => setAdd(true)}
            aria-label="Anotar"
            className="press absolute -top-7 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-[1.4rem] bg-gradient-to-br from-teal to-purple text-4xl font-light text-white shadow-xl shadow-purple/30"
          >
            +
          </button>
        </div>
      </nav>

      <AddSheet open={add} onClose={fechar} editar={editar} />
      <BoasVindas open={boasVindas} onClose={() => setBoasVindas(false)} />
    </div>
  )
}

function TabButton({ t, active, onClick }: { t: (typeof TABS)[number]; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`press flex w-14 flex-col items-center gap-0.5 pb-1 text-[11px] font-semibold ${active ? 'text-ink' : 'text-muted'}`}>
      <span className={`text-xl transition ${active ? 'scale-110' : 'opacity-60 grayscale'}`}>{t.emoji}</span>
      {t.label}
    </button>
  )
}

function BoasVindas({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [nome, setNome] = useState('')
  const fechar = () => {
    updateConfig({ nome: nome.trim() }) // grava no aparelho: não mostra de novo
    onClose()
  }
  return (
    <Sheet open={open} onClose={fechar} title="Bem-vinda! 👋">
      <p className="mb-4 text-[0.95rem] leading-relaxed">Este app é o seu cantinho para cuidar do dinheiro, sem complicação:</p>
      <ul className="mb-5 space-y-3 text-[0.95rem]">
        <li>
          ➕ <b>Toque no +</b> para anotar o que recebeu, gastou, guardou no CDI ou comprou de dólar.
        </li>
        <li>
          🏠 <b>No Início</b> você vê quanto tem guardado e quanto sobrou no mês.
        </li>
        <li>
          🌱 <b>Seu primeiro depósito</b> de R$ 796 (26/10) já está anotado no CDI.
        </li>
        <li>
          🔒 <b>Seus dados ficam só no seu celular.</b> Nos Ajustes dá para fazer backup e exportar para o Excel.
        </li>
      </ul>
      <label className="mb-5 block">
        <span className="mb-1.5 block text-sm font-semibold">Como quer ser chamada?</span>
        <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" />
      </label>
      <div className="pb-2">
        <Button onClick={fechar}>Começar ✨</Button>
      </div>
    </Sheet>
  )
}
