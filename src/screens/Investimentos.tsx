import { useState } from 'react'
import { hoje, resumoCDI, resumoDolar, taxas } from '../calc'
import { fmtBRL, fmtData, fmtPct, fmtPct0, fmtUSD } from '../format'
import { updateConfig, useAppState } from '../store'
import { Button, Details, Donut, Empty, Field, Header, Info, MoneyInput, SectionTitle, Sheet, Stat } from '../ui'

export function CDI({ onEdit }: { onEdit: (id: string) => void }) {
  const s = useAppState()
  const r = resumoCDI(s)
  const t = taxas(s.config)
  const [editSaldo, setEditSaldo] = useState(false)
  const lista = [...s.cdi].sort((a, b) => b.data.localeCompare(a.data))

  return (
    <div>
      <Header title="Meu CDI" subtitle="Meu dinheiro rendendo 🌱" />
      <section className="rounded-[1.75rem] bg-teal p-5 text-white shadow-lg shadow-teal/25">
        <p className="text-sm text-white/80">Tenho no CDI</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold">{fmtBRL(r.saldo)}</p>
        <p className="mt-2 text-xs text-white/80">
          {r.usaApp && s.config.saldoAppData ? `Saldo do app em ${fmtData(s.config.saldoAppData)}` : 'Estimativa da planilha'}
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
        <button onClick={() => setEditSaldo(true)} className="press mt-3 w-full rounded-2xl bg-white py-3 text-sm font-bold text-teal">
          📲 Atualizar com o saldo do app
        </button>
      </section>

      <div className="card mt-4 grid grid-cols-2 gap-4 p-5">
        <Stat label="Rende por ano" value={fmtPct(t.anual)} hint={`${fmtPct0(s.config.pctCdi)} do CDI`} />
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
          É a taxa que os bancos usam para emprestar dinheiro entre eles. Na prática, é a "régua" de quanto seu dinheiro rende. Com o CDI em{' '}
          {fmtPct(s.config.cdiAnual)} ao ano, R$ 1.000 viram ≈ {fmtBRL(1000 * (1 + t.anual))} em um ano. Na caixinha do Nubank (100% do CDI) você pode
          tirar quando quiser, e o dinheiro tem garantia do FGC até R$ 250 mil.
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
        <Details summary="📲 Por que atualizar com o saldo do app?">
          O app faz uma estimativa com a taxa atual. O saldo do Nubank é o valor real, e já considera as mudanças da Selic. Atualize uma vez por mês e os números ficam
          exatos.
        </Details>
      </div>

      <SaldoSheet open={editSaldo} onClose={() => setEditSaldo(false)} estimado={r.estimado} />
    </div>
  )
}

function SaldoSheet({ open, onClose, estimado }: { open: boolean; onClose: () => void; estimado: number }) {
  return (
    <Sheet open={open} onClose={onClose} title="Saldo do app">
      {open && <SaldoForm onClose={onClose} estimado={estimado} />}
    </Sheet>
  )
}

function SaldoForm({ onClose, estimado }: { onClose: () => void; estimado: number }) {
  const s = useAppState()
  const [v, setV] = useState(s.config.saldoApp ?? 0)
  return (
    <div>
      <Info tone="teal">
        Abra o app do banco, veja quanto tem na caixinha e escreva aqui. A estimativa atual é <b className="num">{fmtBRL(estimado)}</b>.
      </Info>
      <div className="mt-4">
        <Field label="Quanto aparece no app">
          <MoneyInput value={v} onChange={setV} big autoFocus />
        </Field>
      </div>
      <div className="flex flex-col gap-2 pb-2">
        <Button
          disabled={!(v > 0)}
          onClick={() => {
            updateConfig({ saldoApp: v, saldoAppData: hoje() })
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
            Voltar a usar a estimativa
          </Button>
        )}
      </div>
    </div>
  )
}

export function Dolar({ onEdit }: { onEdit: (id: string) => void }) {
  const s = useAppState()
  const r = resumoDolar(s)
  const [editCot, setEditCot] = useState(false)
  const lista = [...s.dolares].sort((a, b) => b.data.localeCompare(a.data))
  const cot = s.config.cotacaoDolar

  return (
    <div>
      <Header title="Meus Dólares" subtitle="Minha reserva em moeda forte 💵" />
      <section className="rounded-[1.75rem] bg-blue p-5 text-white shadow-lg shadow-blue/25">
        <p className="text-sm text-white/80">Tenho em dólares</p>
        <p className="num mt-1 text-[2.4rem] leading-none font-extrabold">{fmtUSD(r.usd)}</p>
        <p className="num mt-2 text-sm text-white/85">≈ {fmtBRL(r.vale)} hoje</p>
        <button onClick={() => setEditCot(true)} className="press mt-4 flex w-full items-center justify-between rounded-2xl bg-white/15 px-4 py-3 text-left">
          <span>
            <span className="block text-xs text-white/80">Cotação usada ({fmtData(s.config.cotacaoData)})</span>
            <span className="num font-bold">{fmtBRL(cot)}</span>
          </span>
          <span className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-blue">Atualizar</span>
        </button>
      </section>

      <div className="card mt-4 flex items-center gap-5 p-5">
        <Donut parts={[{ value: r.usd, color: 'var(--color-gold)' }, { value: r.falta, color: 'var(--color-line)' }]} size={104} stroke={12}>
          <span className="num text-lg font-extrabold">{fmtPct0(r.metaPct)}</span>
        </Donut>
        <div className="min-w-0">
          <p className="text-sm text-muted">🎯 Minha meta</p>
          <p className="num text-xl font-bold">{fmtUSD(s.config.metaUSD)}</p>
          <p className="num text-sm text-muted">{r.falta > 0 ? `Faltam ${fmtUSD(r.falta)}` : 'Meta batida! 🎉'}</p>
        </div>
      </div>

      {r.usd > 0 && (
        <div className="card mt-4 grid grid-cols-2 gap-4 p-5">
          <Stat label="Paguei no total" value={fmtBRL(r.pago)} />
          <Stat label="Cotação média que paguei" value={fmtBRL(r.media)} />
          <Stat label="Ganhei / perdi" value={fmtBRL(r.ganho)} tone={r.ganho >= 0 ? 'good' : 'bad'} />
          <Stat label="Em %" value={fmtPct(r.ganhoPct)} tone={r.ganho >= 0 ? 'good' : 'bad'} />
        </div>
      )}

      <SectionTitle>Minhas compras</SectionTitle>
      {lista.length ? (
        <div className="card divide-y divide-line overflow-hidden">
          {lista.map((d) => (
            <button key={d.id} onClick={() => onEdit(d.id)} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-soft text-xl">💵</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{d.onde || 'Compra de dólar'}</span>
                <span className="num block text-xs text-muted">
                  {fmtData(d.data, { day: '2-digit', month: 'short', year: 'numeric' })} · {fmtBRL(d.pagouBRL / d.recebeuUSD)}/US$
                </span>
              </span>
              <span className="text-right">
                <span className="num block font-bold text-blue">{fmtUSD(d.recebeuUSD)}</span>
                <span className="num block text-xs text-muted">{fmtBRL(d.pagouBRL)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Empty emoji="💵" title="Nenhuma compra ainda" text="Toque em + → Comprei dólar e anote quanto pagou e quanto recebeu." />
      )}

      <SectionTitle>Entenda</SectionTitle>
      <div className="space-y-3">
        <Details summary="🤔 Por que a cotação que paguei é maior?">
          A cotação do Google é o dólar "comercial", sem taxas. Quando você compra, paga também IOF e a taxa do app (spread). Por isso anote sempre o total que saiu da sua
          conta: assim você vê o custo real. Compare apps: a diferença pode ser grande.
        </Details>
        <Details summary="📉📈 E se o dólar cair?">
          O dólar sobe e desce todo dia. Se hoje estiver mais barato do que você pagou, aparece em vermelho, mas você só perde de verdade se vender. Comprar um pouco todo
          mês ajuda a fazer uma média.
        </Details>
      </div>

      <CotacaoSheet open={editCot} onClose={() => setEditCot(false)} />
    </div>
  )
}

function CotacaoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Dólar">
      {open && <CotacaoForm onClose={onClose} />}
    </Sheet>
  )
}

function CotacaoForm({ onClose }: { onClose: () => void }) {
  const s = useAppState()
  const [v, setV] = useState(s.config.cotacaoDolar)
  const [meta, setMeta] = useState(s.config.metaUSD)
  return (
    <div>
      <Field label="Cotação de hoje (R$ por US$ 1)" hint='Pesquise "dólar hoje" no Google ou veja no app onde você compra.'>
        <MoneyInput value={v} onChange={setV} big autoFocus />
      </Field>
      <Field label="Minha meta em dólares">
        <MoneyInput value={meta} onChange={setMeta} prefix="US$" />
      </Field>
      <div className="pb-2">
        <Button
          disabled={!(v > 0)}
          onClick={() => {
            updateConfig({ cotacaoDolar: v, cotacaoData: hoje(), metaUSD: meta > 0 ? meta : s.config.metaUSD })
            onClose()
          }}
        >
          Salvar
        </Button>
      </div>
    </div>
  )
}
