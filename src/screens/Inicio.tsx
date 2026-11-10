import { useMemo, useState } from 'react'
import { hoje, mesKey, nomeMes, resumoCDI, resumoDolar, resumoMes, saldoReais, somaMes, toISO } from '../calc'
import { categoria } from '../categorias'
import { fmtBRL, fmtData, fmtPct, fmtPct0, fmtUSD } from '../format'
import { useMercado } from '../mercado'
import { isIOS, isInstalado } from '../plataforma'
import { useAppState } from '../store'
import { SalvarPendente } from './Planilha'
import type { Movimento } from '../types'
import { Donut, Empty, Header, Info, MovRow, Progress, SectionTitle, Stat } from '../ui'

const DICAS = [
  'Anote o gasto na hora: leva 5 segundos e no fim do mês você sabe exatamente para onde foi o dinheiro.',
  'Uma meta comum é guardar de 10% a 20% do que entra. Comece com o que der: o hábito vale mais que o valor.',
  'Reserva de emergência = de 3 a 6 meses dos seus gastos guardados no CDI, para imprevistos.',
  'Juros compostos: o rendimento também rende. Veja a mágica na aba Simular. ✨',
  'Comprar um pouco de dólar todo mês ajuda a fazer uma média e não depender da cotação de um dia.',
]

export function Inicio({ onEdit, onSettings, onGo }: { onEdit: (id: string) => void; onSettings: () => void; onGo: (tab: 'mes' | 'cdi' | 'dolar' | 'simular') => void }) {
  const s = useAppState()
  const m = useMercado()
  const cdi = resumoCDI(s, m)
  const dol = resumoDolar(s, m)
  const mes = resumoMes(s.movimentos, mesKey(hoje()))
  const total = cdi.saldo + dol.vale
  // do bolso dela: o que ficou no CDI (guardou − resgatou) + o que saiu da conta pelos dólares
  const colocado = cdi.colocado + dol.pago
  const ganho = total - colocado
  const recentes = [...s.movimentos].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5)
  const dica = DICAS[new Date().getDate() % DICAS.length]

  return (
    <div>
      <Header
        subtitle={fmtData(hoje(), { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`Oi${s.config.nome ? `, ${s.config.nome}` : ''} 👋`}
        right={
          <button onClick={onSettings} className="press grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm" aria-label="Ajustes">
            ⚙️
          </button>
        }
      />

      <AvisoInstalar />
      <SalvarPendente />

      <section className="rounded-[1.75rem] bg-gradient-to-br from-teal to-purple p-5 text-white shadow-lg shadow-purple/20">
        <p className="text-sm text-white/80">💎 Total guardado (quanto vale hoje)</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold tracking-tight">{fmtBRL(total)}</p>
        {colocado > 0 && (
          <p className="num mt-2 text-xs text-white/90">
            💪 Você colocou {fmtBRL(colocado)} ·{' '}
            <span className="font-bold">
              {ganho >= 0 ? '📈 ganhou' : '📉 perdeu'} {fmtBRL(Math.abs(ganho))} ({fmtPct(Math.abs(ganho) / colocado)})
            </span>
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={() => onGo('cdi')} className="press rounded-2xl bg-white/15 p-3 text-left backdrop-blur">
            <p className="text-xs text-white/80">🌱 No CDI</p>
            <p className="num font-bold">{fmtBRL(cdi.saldo)}</p>
            <p className="num text-[11px] text-white/80">rendeu {fmtBRL(cdi.rendeu)}</p>
          </button>
          <button onClick={() => onGo('dolar')} className="press rounded-2xl bg-white/15 p-3 text-left backdrop-blur">
            <p className="text-xs text-white/80">💵 Em dólares</p>
            <p className="num font-bold">{fmtUSD(dol.usd)}</p>
            <p className="num text-[11px] text-white/80">≈ {fmtBRL(dol.vale)}</p>
          </button>
        </div>
      </section>

      {s.movimentos.length > 0 && (
        <div className="mt-4">
          <SaldoReais saldo={saldoReais(s.movimentos).saldo} hint="tudo que entrou − tudo que gastei" onClick={() => onGo('mes')} />
        </div>
      )}

      <SectionTitle
        action={
          <button onClick={() => onGo('mes')} className="text-sm font-semibold text-purple">
            Ver mês →
          </button>
        }
      >
        📒 {nomeMes(mesKey(hoje()))}
      </SectionTitle>
      <MesCard mes={mes} />

      {total > 0 && (
        <>
          <SectionTitle>Onde está meu dinheiro</SectionTitle>
          <div className="card flex items-center gap-4 p-5">
            <Donut size={96} stroke={13} parts={[{ value: cdi.saldo, color: 'var(--color-teal)' }, { value: dol.vale, color: 'var(--color-blue)' }]}>
              <span className="text-2xl">💎</span>
            </Donut>
            <div className="flex-1 space-y-3">
              <Legenda cor="var(--color-teal)" label="CDI" valor={fmtBRL(cdi.saldo)} pct={total ? cdi.saldo / total : 0} />
              <Legenda cor="var(--color-blue)" label="Dólares" valor={fmtBRL(dol.vale)} pct={total ? dol.vale / total : 0} />
            </div>
          </div>
        </>
      )}

      <SectionTitle>Últimos registros</SectionTitle>
      {recentes.length ? (
        <div className="card divide-y divide-line overflow-hidden">
          {recentes.map((m) => (
            <MovRow key={m.id} m={m} onClick={() => onEdit(m.id)} />
          ))}
        </div>
      ) : (
        <Empty emoji="✍️" title="Nada anotado ainda" text="Toque no botão + para anotar seu salário ou seu primeiro gasto." />
      )}

      <div className="mt-7">
        <Info tone="purple">
          <b>💡 Dica:</b> {dica}
        </Info>
      </div>
    </div>
  )
}

function Legenda({ cor, label, valor, pct }: { cor: string; label: string; valor: string; pct: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-3 w-3 rounded-full" style={{ background: cor }} />
      <span className="flex-1 text-sm whitespace-nowrap">
        {label} <span className="text-muted">· {fmtPct0(pct)}</span>
      </span>
      <span className="num text-sm font-bold">{valor}</span>
    </div>
  )
}

function MesCard({ mes }: { mes: ReturnType<typeof resumoMes> }) {
  if (!mes.movs.length)
    return <Empty emoji="💼" title="Mês começando" text="Quando o salário cair, toque em + → Recebi. Depois anote os gastos." />
  const usado = mes.entrou > 0 ? mes.gastei / mes.entrou : 1
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">🟰 Sobrou (entrou − gastei)</p>
      <p className={`num text-3xl font-extrabold ${mes.sobrou < 0 ? 'text-bad' : ''}`}>{fmtBRL(mes.sobrou)}</p>
      <div className="mt-3 mb-1">
        <Progress value={usado} color={usado > 1 ? 'var(--color-bad)' : 'var(--color-coral)'} />
      </div>
      <p className="mb-4 text-xs text-muted">
        {mes.entrou > 0 ? `Você gastou ${fmtPct0(Math.min(usado, 9.99))} do que entrou (investir não conta como gasto)` : 'Anote o que entrou para ver quanto sobra'}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="⬆️ Entrou" value={fmtBRL(mes.entrou)} tone="good" />
        <Stat label="⬇️ Gastei" value={fmtBRL(mes.gastei)} />
        <Stat label="💵 Dólar + caixinha" value={fmtBRL(mes.guardei)} hint={mes.entrou > 0 ? `${fmtPct0(mes.pctGuardado)} da renda` : undefined} />
      </div>
    </div>
  )
}

/** Último dia do mês 'YYYY-MM' (para o mês atual, hoje). */
function fimDoMes(key: string) {
  if (key === mesKey(hoje())) return hoje()
  return `${somaMes(key, 1)}-01` > hoje() ? hoje() : toISO(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0))
}

function SaldoReais({ saldo, hint, onClick }: { saldo: number; hint: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="press card flex w-full items-center gap-4 p-4 text-left disabled:active:scale-100">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-coral-soft text-2xl">💰</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">Acumulado em reais</span>
        <span className={`num block text-2xl font-extrabold ${saldo < 0 ? 'text-bad' : ''}`}>{fmtBRL(saldo)}</span>
        <span className="block truncate text-[11px] text-muted">{hint}</span>
      </span>
    </button>
  )
}

export function Mes({ onEdit }: { onEdit: (id: string) => void }) {
  const s = useAppState()
  const [key, setKey] = useState(mesKey(hoje()))
  const mes = resumoMes(s.movimentos, key)
  const grupos = useMemo(() => {
    const g = new Map<string, Movimento[]>()
    for (const m of [...mes.movs].sort((a, b) => b.data.localeCompare(a.data))) g.set(m.data, [...(g.get(m.data) ?? []), m])
    return [...g.entries()]
  }, [mes.movs])
  const max = mes.categorias[0]?.valor ?? 0

  return (
    <div>
      <Header title="Meu Mês" subtitle="Para onde vai meu dinheiro" />
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-1.5 shadow-sm">
        <button onClick={() => setKey(somaMes(key, -1))} className="press grid h-10 w-10 place-items-center rounded-xl bg-bg font-bold" aria-label="Mês anterior">
          ‹
        </button>
        <span className="font-bold">{nomeMes(key)}</span>
        <button onClick={() => setKey(somaMes(key, 1))} className="press grid h-10 w-10 place-items-center rounded-xl bg-bg font-bold" aria-label="Próximo mês">
          ›
        </button>
      </div>

      <MesCard mes={mes} />

      {s.movimentos.length > 0 && (
        <div className="mt-4">
          <SaldoReais
            saldo={saldoReais(s.movimentos, fimDoMes(key)).saldo}
            hint={key === mesKey(hoje()) ? 'hoje, somando todos os meses' : `no fim de ${nomeMes(key).toLowerCase()}, somando todos os meses`}
          />
        </div>
      )}

      {mes.categorias.length > 0 && (
        <>
          <SectionTitle>Onde mais gastei</SectionTitle>
          <div className="card space-y-4 p-5">
            {mes.categorias.map((c) => {
              const cat = categoria(c.nome)
              return (
                <div key={c.nome}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {cat?.emoji} {cat?.curto ?? c.nome}
                    </span>
                    <span className="num font-bold">
                      {fmtBRL(c.valor)} <span className="font-normal text-muted">· {fmtPct0(c.pct)}</span>
                    </span>
                  </div>
                  <Progress value={max ? c.valor / max : 0} color={cat?.cor ?? 'var(--color-coral)'} />
                </div>
              )
            })}
          </div>
        </>
      )}

      <SectionTitle>Registros</SectionTitle>
      {grupos.length ? (
        <div className="space-y-4">
          {grupos.map(([data, movs]) => (
            <div key={data}>
              <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">{fmtData(data, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
              <div className="card divide-y divide-line overflow-hidden">
                {movs.map((m) => (
                  <MovRow key={m.id} m={m} onClick={() => onEdit(m.id)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty emoji="🗓️" title="Nenhum registro neste mês" text="Use o botão + para anotar entradas e gastos." />
      )}
    </div>
  )
}

/** No iPhone, o Safari e o app da tela de início guardam dados separados: instalar antes de usar. */
export function AvisoInstalar() {
  if (isInstalado()) return null
  const ios = isIOS()
  return (
    <div className="mb-4 rounded-3xl border-2 border-gold bg-gold-soft p-4 text-sm leading-relaxed">
      <p className="mb-1 font-bold">📲 Instale o app antes de começar</p>
      {ios ? (
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>
            Abra este link no <b>Safari</b>
          </li>
          <li>
            Toque em <b>Compartilhar</b> (o quadrado com a seta ↑)
          </li>
          <li>
            Escolha <b>"Adicionar à Tela de Início"</b>
          </li>
          <li>Use sempre pelo ícone novo 💜</li>
        </ol>
      ) : (
        <p>
          No Chrome, toque em <b>⋮</b> → <b>"Instalar app"</b> e use sempre pelo ícone.
        </p>
      )}
      {ios && <p className="mt-2 text-xs text-muted">O que você anotar aqui no Safari não aparece no app instalado.</p>}
    </div>
  )
}