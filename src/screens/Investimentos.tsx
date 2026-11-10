import { useState } from 'react'
import { hoje, resumoCDI, resumoDolar, taxas, type CompraAnalise } from '../calc'
import { fmtBRL, fmtData, fmtPct, fmtPct0, fmtUSD } from '../format'
import { useMercado, type Mercado } from '../mercado'
import { updateConfig, useAppState } from '../store'
import { Button, Details, Donut, Empty, Field, Header, Info, MoneyInput, SectionTitle, Sheet, Stat, inputCls } from '../ui'

const fmtCot = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '')
const fmtBRLs = (v: number) => `${sinal(v)} ${fmtBRL(Math.abs(v))}`.trim()
const tom = (v: number) => (v > 0.004 ? 'good' : v < -0.004 ? 'bad' : undefined)

export function StatusMercado({ m }: { m: Mercado }) {
  if (m.erro) return <p className="mb-3 rounded-2xl bg-gold-soft px-4 py-2.5 text-xs">📴 {m.erro}</p>
  return null
}

// =====================================================================
// CDI
// =====================================================================

export function CDI({ onEdit }: { onEdit: (id: string) => void }) {
  const s = useAppState()
  const m = useMercado()
  const r = resumoCDI(s, m)
  const t = taxas(s.config, m)
  const [conferir, setConferir] = useState(false)
  const lista = [...s.cdi].sort((a, b) => b.data.localeCompare(a.data))

  return (
    <div>
      <Header title="Meu CDI" subtitle="Meu dinheiro rendendo 🌱" />
      <StatusMercado m={m} />
      <section className="rounded-[1.75rem] bg-teal p-5 text-white shadow-lg shadow-teal/25">
        <p className="text-sm text-white/80">Tenho no CDI</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold">{fmtBRL(r.saldo)}</p>
        <p className="mt-2 text-xs text-white/80">
          {r.usaBanco && s.config.saldoAppData
            ? `🏦 Saldo do banco em ${fmtData(s.config.saldoAppData)} + CDI oficial desde então`
            : r.temSerie
              ? '📡 Calculado com o CDI oficial de cada dia'
              : 'Estimativa (sem internet ainda)'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/15 p-3">
            <p className="text-xs text-white/80">🎉 Já rendeu</p>
            <p className="num font-bold">{fmtBRL(r.rendeu)}</p>
          </div>
          <div className="rounded-2xl bg-white/15 p-3">
            <p className="text-xs text-white/80">💪 Do meu bolso</p>
            <p className="num font-bold">{fmtBRL(r.colocado)}</p>
          </div>
        </div>
        <button onClick={() => setConferir(true)} className="press mt-3 w-full rounded-2xl bg-white py-3 text-sm font-bold text-teal">
          🏦 Atualizar com o saldo do banco
        </button>
      </section>

      <div className="card mt-4 grid grid-cols-2 gap-4 p-5">
        <Stat label="CDI hoje (ao ano)" value={fmtPct(t.cdi)} hint={`você recebe ${fmtPct0(s.config.pctCdi)} dele`} />
        <Stat label="A cada R$ 1.000, por mês" value={`+ ${fmtBRL(1000 * t.mes)}`} tone="good" />
        <Stat label="Se resgatar tudo hoje" value={fmtBRL(r.liquido)} hint="já sem imposto (aprox.)" />
        <Stat label="Imposto (IR) aprox." value={fmtBRL(r.ir)} tone="muted" />
      </div>

      <SectionTitle>Guardei e resgatei</SectionTitle>
      {lista.length ? (
        <div className="card divide-y divide-line overflow-hidden">
          {lista.map((c) => (
            <button key={c.id} onClick={() => onEdit(c.id)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl ${c.tipo === 'Guardei' ? 'bg-teal-soft' : 'bg-gold-soft'}`}>
                {c.tipo === 'Guardei' ? '🌱' : '↩️'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{c.nota || c.tipo}</span>
                <span className="block text-xs text-muted">
                  {c.tipo} · {fmtData(c.data, { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </span>
              <span className={`num shrink-0 font-bold ${c.tipo === 'Guardei' ? 'text-teal' : 'text-gold'}`}>
                {c.tipo === 'Guardei' ? '+' : '−'} {fmtBRL(c.valor)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty emoji="🌱" title="Nada no CDI ainda" text="Toque em + → Guardei no CDI quando colocar dinheiro na caixinha." />
      )}

      <SectionTitle>Entenda</SectionTitle>
      <div className="space-y-3">
        <Details summary="🤔 O que é o CDI?">
          É a taxa que os bancos usam para emprestar dinheiro entre eles, e a "régua" de quanto seu dinheiro rende. Hoje está em {fmtPct(t.cdi)} ao ano: R$ 1.000 viram ≈{' '}
          {fmtBRL(1000 * (1 + t.anual))} em um ano. Na caixinha do Nubank (100% do CDI) você pode tirar quando quiser, e o dinheiro tem garantia do FGC até R$ 250 mil.
        </Details>
        <Details summary="📡 Como o app calcula?">
          O app busca no Banco Central o CDI de cada dia útil e aplica no seu dinheiro, dia por dia, desde a data de cada depósito, igual ao banco. Se a Selic mudar, o que já
          rendeu não muda: só os próximos dias usam a taxa nova. Feriados e fins de semana não rendem.
        </Details>
        <Details summary="🧾 Como funciona o imposto?">
          <p className="mb-3">O imposto é cobrado só sobre o que rendeu, nunca sobre o que você colocou. O banco desconta sozinho na hora do resgate.</p>
          <table className="w-full text-left">
            <tbody className="divide-y divide-line">
              {[
                ['Até 6 meses', '22,5%'],
                ['6 meses a 1 ano', '20%'],
                ['1 a 2 anos', '17,5%'],
                ['Mais de 2 anos', '15%'],
              ].map(([a, b]) => (
                <tr key={a}>
                  <td className="py-2">{a}</td>
                  <td className="py-2 text-right font-bold">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-muted">Se tirar antes de 30 dias, também tem IOF (só sobre o rendimento).</p>
        </Details>
      </div>

      <Sheet open={conferir} onClose={() => setConferir(false)} title="Saldo do banco">
        {conferir && <SaldoBancoForm onClose={() => setConferir(false)} calculado={r.estimado} />}
      </Sheet>
    </div>
  )
}

function SaldoBancoForm({ onClose, calculado }: { onClose: () => void; calculado: number }) {
  const s = useAppState()
  const [v, setV] = useState(0)
  const [data, setData] = useState(hoje())
  return (
    <div>
      <Info tone="teal">
        Abra o app do banco e escreva quanto tem na caixinha. Esse valor vira o ponto de partida: a partir dele o app soma o CDI oficial de cada dia e os
        próximos depósitos e resgates. Só com as contas do app daria <b className="num">{fmtBRL(calculado)}</b> (sem os descontos de IR/IOF dos resgates).
      </Info>
      <div className="mt-4">
        <Field label="Quanto aparece no app do banco">
          <MoneyInput value={v} onChange={setV} big autoFocus />
        </Field>
        <Field label="Em que dia você viu esse saldo">
          <input type="date" className={inputCls} value={data} max={hoje()} onChange={(e) => e.target.value && setData(e.target.value)} />
        </Field>
      </div>
      <div className="flex flex-col gap-2 pb-2">
        <Button
          disabled={!(v > 0)}
          onClick={() => {
            updateConfig({ saldoApp: v, saldoAppData: data })
            onClose()
          }}
        >
          Salvar saldo
        </Button>
        {s.config.saldoApp !== null && (
          <Button
            variant="soft"
            onClick={() => {
              updateConfig({ saldoApp: null, saldoAppData: null })
              onClose()
            }}
          >
            Voltar a usar só as contas do app
          </Button>
        )}
      </div>
    </div>
  )
}

// =====================================================================
// Dólar
// =====================================================================

export function Dolar({ onEdit }: { onEdit: (id: string) => void }) {
  const s = useAppState()
  const m = useMercado()
  const r = resumoDolar(s, m)
  const [editMeta, setEditMeta] = useState(false)
  const lista = [...r.compras].sort((a, b) => b.compra.data.localeCompare(a.compra.data))
  const quando =
    r.cot.fonte === 'aovivo' && r.cot.quando
      ? `ao vivo · ${new Date(r.cot.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : r.cot.fonte === 'ptax' && r.cot.quando
        ? `PTAX de ${fmtData(r.cot.quando)}`
        : 'valor manual'

  return (
    <div>
      <Header title="Meus Dólares" subtitle="Minha reserva em moeda forte 💵" />
      <StatusMercado m={m} />
      <section className="rounded-[1.75rem] bg-blue p-5 text-white shadow-lg shadow-blue/25">
        <p className="text-sm text-white/80">Tenho em dólares</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold">{fmtUSD(r.usd)}</p>
        <p className="num mt-2 text-sm text-white/85">≈ {fmtBRL(r.vale)} hoje</p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/15 px-4 py-3">
          <span>
            <span className="block text-xs text-white/80">Dólar agora</span>
            <span className="num font-bold">{fmtCot(r.cot.valor)}</span>
          </span>
          <span className="text-right text-xs text-white/80">{quando}</span>
        </div>
      </section>

      {r.usd > 0 && (
        <>
          <SectionTitle>Meu resultado</SectionTitle>
          <div className="card p-5">
            <p className="text-sm text-muted">Valem hoje − saiu da minha conta</p>
            <p className={`num text-3xl font-extrabold ${r.ganho >= 0 ? 'text-good' : 'text-bad'}`}>
              {fmtBRLs(r.ganho)} <span className="text-base font-bold">({sinal(r.ganhoPct)}{fmtPct(Math.abs(r.ganhoPct))})</span>
            </p>
            <div className="mt-4 space-y-2.5 text-sm">
              <Linha label="📈 Variação do dólar desde a compra" valor={r.variacao} />
              <Linha label="💸 Custo das taxas (tarifa, IOF, spread)" valor={-r.custoTaxas} />
              <div className="border-t border-line pt-2.5">
                <Linha label="🟰 Resultado" valor={r.ganho} forte />
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-teal-soft px-4 py-3 text-sm">
              🌱 Se esses {fmtBRL(r.pago)} tivessem ficado no CDI, hoje seriam <b className="num">{fmtBRL(r.seCDI)}</b>
              {r.vale >= r.seCDI ? ' — o dólar está ganhando. 💪' : ` — o CDI estaria ${fmtBRL(r.seCDI - r.vale)} na frente.`}
            </div>
          </div>
          <GraficoDolar m={m} compras={r.compras} hoje={r.cot.valor} />
        </>
      )}

      <div className="card mt-4 flex items-center gap-5 p-5">
        <Donut parts={[{ value: r.usd, color: 'var(--color-gold)' }, { value: r.falta, color: 'var(--color-line)' }]} size={96} stroke={12}>
          <span className="num text-lg font-extrabold">{fmtPct0(r.metaPct)}</span>
        </Donut>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted">🎯 Minha meta</p>
          <p className="num text-xl font-bold">{fmtUSD(s.config.metaUSD)}</p>
          <p className="num text-sm text-muted">{r.falta > 0 ? `Faltam ${fmtUSD(r.falta)}` : 'Meta batida! 🎉'}</p>
        </div>
        <button onClick={() => setEditMeta(true)} className="press rounded-xl bg-bg px-3 py-2 text-sm font-semibold">
          Mudar
        </button>
      </div>

      <SectionTitle>Minhas compras</SectionTitle>
      {lista.length ? (
        <div className="space-y-3">
          {lista.map((a) => (
            <CompraCard key={a.compra.id} a={a} onClick={() => onEdit(a.compra.id)} />
          ))}
        </div>
      ) : (
        <Empty emoji="💵" title="Nenhuma compra ainda" text="Toque em + → Comprei dólar e copie os valores do comprovante." />
      )}

      <SectionTitle>Entenda</SectionTitle>
      <div className="space-y-3">
        <Details summary="💸 O que é o custo das taxas?">
          É quanto você pagou acima do dólar "de mercado" do dia (o câmbio do comprovante ou, se não tiver, o dólar oficial PTAX do Banco Central): tarifa do app, IOF e
          spread. Esse custo se paga quando o dólar sobe. O VET do comprovante já mostra o custo total por dólar.
        </Details>
        <Details summary="📉📈 E se o dólar cair?">
          O dólar sobe e desce todo dia. Se hoje estiver mais barato do que você pagou, aparece em vermelho, mas você só perde de verdade se vender. Comprar um pouco todo
          mês ajuda a fazer uma média.
        </Details>
        <Details summary="🌱 Por que comparar com o CDI?">
          Para você ver o custo da escolha: o real no CDI rende todo dia; o dólar protege contra a desvalorização do real. Não existe certo ou errado, é bom ter os dois.
        </Details>
      </div>

      <Sheet open={editMeta} onClose={() => setEditMeta(false)} title="Minha meta">
        {editMeta && <MetaForm onClose={() => setEditMeta(false)} />}
      </Sheet>
    </div>
  )
}

function Linha({ label, valor, forte }: { label: string; valor: number; forte?: boolean }) {
  const t = tom(valor)
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={forte ? 'font-bold' : ''}>{label}</span>
      <span className={`num shrink-0 font-bold ${t === 'good' ? 'text-good' : t === 'bad' ? 'text-bad' : ''}`}>{fmtBRLs(valor)}</span>
    </div>
  )
}

function CompraCard({ a, onClick }: { a: CompraAnalise; onClick: () => void }) {
  const c = a.compra
  return (
    <button onClick={onClick} className="press card block w-full p-4 text-left">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-soft text-xl">💵</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{c.onde || 'Compra de dólar'}</span>
          <span className="block text-xs text-muted">{fmtData(c.data, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </span>
        <span className="text-right">
          <span className="num block font-bold text-blue">{fmtUSD(c.recebeuUSD)}</span>
          <span className="num block text-xs text-muted">{fmtBRL(c.pagouBRL)}</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-bg p-3 text-xs">
        <div>
          <p className="text-muted">Paguei (VET)</p>
          <p className="num font-bold">{fmtCot(a.vet)}</p>
        </div>
        <div>
          <p className="text-muted">{a.fonteDia === 'comprovante' ? 'Câmbio do dia' : 'PTAX do dia'}</p>
          <p className="num font-bold">{a.dolarDia ? fmtCot(a.dolarDia) : '—'}</p>
        </div>
        <div>
          <p className="text-muted">Taxas</p>
          <p className="num font-bold">{a.custoTaxasPct !== null ? fmtPct(a.custoTaxasPct) : '—'}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between px-1 text-sm">
        <span className="text-muted">
          Hoje vale <span className="num">{fmtBRL(a.valeHoje)}</span>
        </span>
        <span className={`num font-bold ${a.resultado >= 0 ? 'text-good' : 'text-bad'}`}>{fmtBRLs(a.resultado)}</span>
      </div>
      {c.taxas ? <p className="mt-1 px-1 text-xs text-muted">Taxas do comprovante: {fmtBRL(c.taxas)}</p> : null}
      {a.fonteDia === 'comprovante' && a.ptaxDia && a.dolarDia && (
        <p className="mt-0.5 px-1 text-xs text-muted">
          Dólar oficial nesse dia (PTAX): <span className="num">{fmtCot(a.ptaxDia)}</span>
          {a.dolarDia <= a.ptaxDia ? ' — o câmbio do app foi melhor 👍' : ` — o app cobrou ${fmtPct(a.dolarDia / a.ptaxDia - 1)} a mais no câmbio`}
        </p>
      )}
    </button>
  )
}

function GraficoDolar({ m, compras, hoje: cotHoje }: { m: Mercado; compras: CompraAnalise[]; hoje: number }) {
  const primeira = compras.reduce((a, c) => (c.compra.data < a ? c.compra.data : a), '9999')
  const pontos = Object.entries(m.ptax)
    .filter(([d]) => d >= primeira)
    .sort(([a], [b]) => a.localeCompare(b))
  if (pontos.length < 2) return null
  const serie = [...pontos, ['agora', cotHoje] as [string, number]]
  const vals = serie.map(([, v]) => v).concat(compras.map((c) => c.vet))
  const min = Math.min(...vals) * 0.995
  const max = Math.max(...vals) * 1.005
  const W = 320
  const H = 120
  const x = (i: number) => (i / (serie.length - 1)) * W
  const y = (v: number) => H - ((v - min) / (max - min)) * H
  const idx = (d: string) => Math.max(0, serie.findIndex(([sd]) => sd >= d))
  const path = serie.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <div className="card mt-4 p-5">
      <p className="mb-1 text-sm font-semibold">Dólar desde a minha primeira compra</p>
      <p className="mb-3 text-xs text-muted">
        Linha: dólar oficial · <span className="text-coral">●</span> quanto eu paguei (com taxas)
      </p>
      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="h-36 w-full overflow-visible">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill="var(--color-blue-soft)" />
        <path d={path} fill="none" stroke="var(--color-blue)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {compras.map((c) => (
          <circle key={c.compra.id} cx={x(idx(c.compra.data))} cy={y(c.vet)} r="5" fill="var(--color-coral)" stroke="white" strokeWidth="2" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmtData(pontos[0][0])}</span>
        <span>hoje {fmtCot(cotHoje)}</span>
      </div>
    </div>
  )
}

function MetaForm({ onClose }: { onClose: () => void }) {
  const s = useAppState()
  const [meta, setMeta] = useState(s.config.metaUSD)
  return (
    <div>
      <Field label="Minha meta em dólares">
        <MoneyInput value={meta} onChange={setMeta} prefix="US$" big autoFocus />
      </Field>
      <div className="pb-2">
        <Button
          disabled={!(meta > 0)}
          onClick={() => {
            updateConfig({ metaUSD: meta })
            onClose()
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  )
}
