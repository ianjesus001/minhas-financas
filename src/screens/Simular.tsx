import { simular, taxas } from '../calc'
import { fmtBRL, fmtPct } from '../format'
import { useMercado } from '../mercado'
import { updateConfig, useAppState } from '../store'
import { Header, Info, MoneyInput, SectionTitle } from '../ui'

export function Simular({ onBack }: { onBack: () => void }) {
  const s = useAppState()
  const { simInicial, simMensal, simMeses } = s.config
  const t = taxas(s.config, useMercado())
  const r = simular(simInicial, simMensal, simMeses, t.mes)
  const anos = Math.floor(r.n / 12)
  const meses = r.n % 12
  const prazo = [anos && `${anos} ${anos === 1 ? 'ano' : 'anos'}`, meses && `${meses} ${meses === 1 ? 'mês' : 'meses'}`].filter(Boolean).join(' e ')
  const barras = [
    { label: '🛏️ Debaixo do colchão', valor: r.colocado, cor: 'var(--color-muted)' },
    { label: '🐷 Poupança', valor: r.poupanca, cor: 'var(--color-gold)' },
    { label: '🌱 CDI (sem imposto)', valor: r.liquido, cor: 'var(--color-purple)' },
  ]
  const max = Math.max(...barras.map((b) => b.valor), 1)

  return (
    <div>
      <Header
        title="Simulador"
        subtitle="Quanto vou ter se guardar todo mês? 🔮"
        right={
          <button onClick={onBack} className="press rounded-2xl bg-white px-4 py-2.5 text-sm font-bold shadow-sm">
            ‹ Voltar
          </button>
        }
      />

      <div className="card space-y-5 p-5">
        <div>
          <p className="mb-1.5 text-sm font-semibold">Já tenho guardado</p>
          <MoneyInput value={simInicial} onChange={(v) => updateConfig({ simInicial: v })} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Vou guardar todo mês</p>
          <MoneyInput value={simMensal} onChange={(v) => updateConfig({ simMensal: v })} />
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-sm font-semibold">Por quanto tempo</p>
            <p className="font-bold text-purple">{prazo}</p>
          </div>
          <input
            type="range"
            min={1}
            max={120}
            value={r.n}
            onChange={(e) => updateConfig({ simMeses: Number(e.target.value) })}
            className="w-full"
            aria-label="Meses"
          />
          <div className="flex justify-between text-[11px] text-muted">
            <span>1 mês</span>
            <span>10 anos</span>
          </div>
        </div>
      </div>

      <section className="mt-4 rounded-[1.75rem] bg-purple p-5 text-white shadow-lg shadow-purple/25">
        <p className="text-sm text-white/80">Daqui a {prazo} você terá</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold">{fmtBRL(r.liquido)}</p>
        <p className="mt-1 text-xs text-white/80">já sem imposto · rendendo {fmtPct(t.anual)} ao ano</p>
        <Grafico serie={r.serie} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/15 p-3">
            <p className="text-xs text-white/80">💪 Do seu bolso</p>
            <p className="num font-bold">{fmtBRL(r.colocado)}</p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3">
            <p className="text-xs text-white/80">🎁 O CDI te deu</p>
            <p className="num font-bold">{fmtBRL(r.rendeu - r.ir)}</p>
          </div>
        </div>
      </section>

      <SectionTitle>E se fosse em outro lugar?</SectionTitle>
      <div className="card space-y-4 p-5">
        {barras.map((b) => (
          <div key={b.label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span>{b.label}</span>
              <span className="num font-bold">{fmtBRL(b.valor)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-bg">
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(b.valor / max) * 100}%`, background: b.cor }} />
            </div>
          </div>
        ))}
        <p className="pt-1 text-sm">
          O CDI ganha da poupança por <b className="num text-good">{fmtBRL(r.liquido - r.poupanca)}</b>.
        </p>
      </div>

      <div className="mt-4">
        <Info tone="purple">
          <b>⛄ Juros compostos:</b> o rendimento de cada mês também passa a render. Por isso a curva fica mais inclinada com o tempo. Quanto antes começar, melhor!
        </Info>
      </div>
    </div>
  )
}

function Grafico({ serie }: { serie: { mes: number; cdi: number; colocado: number }[] }) {
  const W = 300
  const H = 90
  const max = Math.max(...serie.map((p) => p.cdi), 1)
  const x = (i: number) => (i / Math.max(1, serie.length - 1)) * W
  const y = (v: number) => H - (v / max) * H
  const linha = (k: 'cdi' | 'colocado') => serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} className="mt-4 h-24 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={`${linha('cdi')} L${W},${H} L0,${H} Z`} fill="rgb(255 255 255 / 0.18)" />
      <path d={linha('cdi')} fill="none" stroke="white" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <path d={linha('colocado')} fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
