import { useState } from 'react'
import { fmtData } from '../format'
import { updateConfig, useAppState } from '../store'
import { mudancasPendentes, salvarNaPlanilha, testarLink, trazerDaPlanilha } from '../sync'
import { Button, Info, inputCls } from '../ui'

type Status = { tipo: 'ok' | 'erro' | 'carregando'; texto: string } | null

function quando(iso: string) {
  return `${fmtData(iso.slice(0, 10))}, ${new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Card dos Ajustes: conectar, salvar e trazer. */
export function PlanilhaCard() {
  const s = useAppState()
  const c = s.config
  const [link, setLink] = useState('')
  const [status, setStatus] = useState<Status>(null)
  const pendente = mudancasPendentes(s)

  async function rodar(texto: string, fn: () => Promise<string>) {
    setStatus({ tipo: 'carregando', texto })
    try {
      setStatus({ tipo: 'ok', texto: await fn() })
    } catch (e) {
      setStatus({ tipo: 'erro', texto: (e as Error).message })
    }
  }

  if (!c.planilhaLink)
    return (
      <div className="card p-5">
        <p className="mb-3 text-sm text-muted">
          Conecte o app à planilha "Meus Reais e Dólares" para trazer o que você já anotou lá e salvar lá o que anotar aqui.
        </p>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-sm font-semibold">Link de conexão</span>
          <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://script.google.com/…?k=…" autoCapitalize="off" autoCorrect="off" />
        </label>
        <Button
          disabled={!link.trim() || status?.tipo === 'carregando'}
          onClick={() =>
            rodar('Conectando...', async () => {
              const nome = await testarLink(link)
              updateConfig({ planilhaLink: link.trim(), planilhaNome: nome, planilhaSync: null })
              return `Conectado a "${nome}". Agora toque em "Trazer da planilha".`
            })
          }
        >
          🔗 Conectar
        </Button>
        <StatusMsg status={status} />
      </div>
    )

  return (
    <div className="card p-5">
      <p className="text-sm">
        ✅ Conectada a <b>{c.planilhaNome || 'planilha'}</b>
      </p>
      <p className="mb-4 text-xs text-muted">
        {c.planilhaSync ? `Última sincronização: ${quando(c.planilhaSync.em)}` : 'Ainda não sincronizou.'}
        {pendente && c.planilhaSync ? ' · há mudanças não salvas' : ''}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          disabled={status?.tipo === 'carregando'}
          onClick={() =>
            rodar('Salvando na planilha...', async () => {
              const r = await salvarNaPlanilha()
              return `Salvo! ${r.reais} registros em reais e ${r.dolares} compras de dólar.`
            })
          }
        >
          ⬆️ Salvar na planilha
        </Button>
        <Button
          variant="soft"
          disabled={status?.tipo === 'carregando'}
          onClick={() => {
            const aviso = pendente
              ? 'Você tem mudanças no app que ainda não foram salvas na planilha e vão se perder. Trazer mesmo assim?'
              : 'Isso vai trocar os reais e dólares do app pelos da planilha. Continuar?'
            if (!confirm(aviso)) return
            rodar('Trazendo da planilha...', async () => {
              const r = await trazerDaPlanilha()
              return `Pronto! ${r.reais} registros em reais e ${r.dolares} compras de dólar.`
            })
          }}
        >
          ⬇️ Trazer da planilha
        </Button>
      </div>
      <StatusMsg status={status} />
      <div className="mt-4">
        <Info tone="blue">
          Use o app para anotar e toque em <b>Salvar</b>. Se mexer direto na planilha, toque em <b>Trazer</b> antes de anotar no app de novo. O CDI fica só no
          app.
        </Info>
      </div>
      <button
        onClick={() => {
          if (confirm('Desconectar a planilha? Seus dados no app continuam.')) {
            updateConfig({ planilhaLink: '', planilhaNome: '', planilhaSync: null })
            setStatus(null)
          }
        }}
        className="mt-3 w-full text-center text-xs text-muted underline"
      >
        Desconectar
      </button>
    </div>
  )
}

function StatusMsg({ status }: { status: Status }) {
  if (!status) return null
  const cor = status.tipo === 'erro' ? 'bg-coral-soft text-bad' : status.tipo === 'ok' ? 'bg-teal-soft' : 'bg-bg text-muted'
  return <p className={`mt-3 rounded-2xl px-4 py-3 text-sm ${cor}`}>{status.texto}</p>
}

/** Aviso do Início quando há mudanças não salvas. */
export function SalvarPendente() {
  const s = useAppState()
  const [status, setStatus] = useState<Status>(null)
  if (!mudancasPendentes(s) && status?.tipo !== 'ok') return null
  if (status?.tipo === 'ok')
    return <p className="mb-4 rounded-2xl bg-teal-soft px-4 py-3 text-sm">☁️ {status.texto}</p>
  return (
    <div className="mb-4 flex items-center gap-3 rounded-3xl bg-white p-3 pl-4 shadow-sm">
      <span className="flex-1 text-sm">
        ☁️ {status?.tipo === 'erro' ? <span className="text-bad">{status.texto}</span> : 'Há mudanças não salvas na planilha'}
      </span>
      <button
        disabled={status?.tipo === 'carregando'}
        onClick={async () => {
          setStatus({ tipo: 'carregando', texto: '' })
          try {
            await salvarNaPlanilha()
            setStatus({ tipo: 'ok', texto: 'Salvo na planilha!' })
            setTimeout(() => setStatus(null), 3000)
          } catch (e) {
            setStatus({ tipo: 'erro', texto: (e as Error).message })
          }
        }}
        className="press shrink-0 rounded-2xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {status?.tipo === 'carregando' ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
  )
}
