import { useState } from 'react'
import { hoje } from './calc'
import { CATEGORIAS } from './categorias'
import { fmtBRL } from './format'
import { apagarLancamento, salvarLancamento, type Lancamento } from './store'
import { Button, Chip, Field, MoneyInput, Sheet, Toggle, inputCls } from './ui'

type Tipo = 'gasto' | 'entrada' | 'guardar' | 'resgatar' | 'dolar'

const TIPOS: { id: Tipo; emoji: string; label: string; hint: string; bg: string }[] = [
  { id: 'gasto', emoji: '💸', label: 'Gastei', hint: 'mercado, aluguel, uber...', bg: 'bg-coral-soft' },
  { id: 'entrada', emoji: '💰', label: 'Recebi', hint: 'salário, renda extra', bg: 'bg-teal-soft' },
  { id: 'guardar', emoji: '🌱', label: 'Guardei no CDI', hint: 'coloquei na caixinha', bg: 'bg-teal-soft' },
  { id: 'dolar', emoji: '💵', label: 'Comprei dólar', hint: 'troquei reais por dólares', bg: 'bg-blue-soft' },
  { id: 'resgatar', emoji: '↩️', label: 'Tirei do CDI', hint: 'resgatei da caixinha', bg: 'bg-gold-soft' },
]

function tipoDe(l: Lancamento): Tipo {
  if (l.tipo === 'cdi') return l.resgate ? 'resgatar' : 'guardar'
  return l.tipo
}

export function AddSheet({ open, onClose, editar }: { open: boolean; onClose: () => void; editar?: { id: string; lanc: Lancamento } | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={editar ? 'Editar' : 'Anotar'}>
      {/* key força estado novo a cada abertura */}
      {open && <Form key={editar?.id ?? 'novo'} onClose={onClose} editar={editar ?? null} />}
    </Sheet>
  )
}

function Form({ onClose, editar }: { onClose: () => void; editar: { id: string; lanc: Lancamento } | null }) {
  const l = editar?.lanc
  const [tipo, setTipo] = useState<Tipo | null>(l ? tipoDe(l) : null)
  const [data, setData] = useState(l?.data ?? hoje())
  const [valor, setValor] = useState(l && 'valor' in l ? l.valor : 0)
  const [categoria, setCategoria] = useState(l && 'categoria' in l ? l.categoria : '')
  const [texto, setTexto] = useState(l ? (l.tipo === 'cdi' ? l.nota : l.tipo === 'dolar' ? l.onde : l.descricao) : '')
  const [usd, setUsd] = useState(l?.tipo === 'dolar' ? l.recebeuUSD : 0)
  const [brl, setBrl] = useState(l?.tipo === 'dolar' ? l.pagouBRL : 0)
  const [noMes, setNoMes] = useState(l && 'noMes' in l ? l.noMes : true)

  if (!tipo) {
    return (
      <div className="grid grid-cols-2 gap-3 pb-2">
        {TIPOS.map((t, i) => (
          <button
            key={t.id}
            onClick={() => setTipo(t.id)}
            className={`press rounded-3xl p-4 text-left ${t.bg} ${i === TIPOS.length - 1 ? 'col-span-2' : ''}`}
          >
            <div className="mb-2 text-3xl">{t.emoji}</div>
            <div className="font-bold">{t.label}</div>
            <div className="text-xs text-muted">{t.hint}</div>
          </button>
        ))}
      </div>
    )
  }

  const cats = CATEGORIAS.filter((c) => c.tipo === (tipo === 'entrada' ? 'Entrada' : 'Gasto'))
  const ok =
    tipo === 'dolar' ? brl > 0 && usd > 0 : valor > 0 && (tipo === 'gasto' || tipo === 'entrada' ? !!categoria : true)

  function salvar() {
    if (!ok) return
    let lanc: Lancamento
    if (tipo === 'gasto' || tipo === 'entrada') lanc = { tipo, data, valor, categoria, descricao: texto.trim() }
    else if (tipo === 'dolar') lanc = { tipo: 'dolar', data, pagouBRL: brl, recebeuUSD: usd, onde: texto.trim(), noMes }
    else lanc = { tipo: 'cdi', data, valor, resgate: tipo === 'resgatar', nota: texto.trim(), noMes }
    salvarLancamento(lanc, editar?.id)
    navigator.vibrate?.(15)
    onClose()
  }

  const info = TIPOS.find((t) => t.id === tipo)!

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      {!editar && (
        <button type="button" onClick={() => setTipo(null)} className={`press mb-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${info.bg}`}>
          <span>{info.emoji}</span> {info.label} <span className="text-muted">· trocar</span>
        </button>
      )}

      {tipo === 'dolar' ? (
        <>
          <Field label="Quanto saiu da sua conta (com taxas e IOF)">
            <MoneyInput value={brl} onChange={setBrl} big autoFocus={!editar} />
          </Field>
          <Field label="Quantos dólares você recebeu">
            <MoneyInput value={usd} onChange={setUsd} prefix="US$" big />
          </Field>
          {brl > 0 && usd > 0 && (
            <p className="-mt-2 mb-4 rounded-2xl bg-blue-soft px-4 py-3 text-sm">
              Você pagou <b className="num">{fmtBRL(brl / usd)}</b> por cada dólar.
            </p>
          )}
          <Field label="Onde comprou (opcional)">
            <input className={inputCls} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Wise, Nomad, banco..." />
          </Field>
        </>
      ) : (
        <>
          <Field label={tipo === 'resgatar' ? 'Quanto tirou' : tipo === 'guardar' ? 'Quanto guardou' : tipo === 'entrada' ? 'Quanto recebeu' : 'Quanto gastou'}>
            <MoneyInput value={valor} onChange={setValor} big autoFocus={!editar} />
          </Field>
          {(tipo === 'gasto' || tipo === 'entrada') && (
            <div className="mb-4">
              <span className="mb-1.5 block text-sm font-semibold">Categoria</span>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <Chip key={c.nome} active={categoria === c.nome} onClick={() => setCategoria(c.nome)} color={c.cor}>
                    <span>{c.emoji}</span> {c.curto}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <Field label={tipo === 'gasto' || tipo === 'entrada' ? 'Descrição (opcional)' : 'Anotação (opcional)'}>
            <input
              className={inputCls}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={tipo === 'gasto' ? 'Ex: compra do mês' : tipo === 'entrada' ? 'Ex: salário de novembro' : 'Ex: reserva de emergência'}
            />
          </Field>
        </>
      )}

      <Field label="Data">
        <input type="date" className={inputCls} value={data} max="2100-12-31" onChange={(e) => e.target.value && setData(e.target.value)} />
      </Field>

      {(tipo === 'guardar' || tipo === 'dolar' || tipo === 'resgatar') && (
        <Toggle
          checked={noMes}
          onChange={setNoMes}
          label={tipo === 'resgatar' ? 'Voltou para minha conta este mês' : 'Saiu da minha conta este mês'}
          hint={
            tipo === 'resgatar'
              ? 'Aparece como entrada no Meu Mês.'
              : 'Aparece no Meu Mês como dinheiro guardado. Desligue se era um dinheiro que você já tinha guardado antes.'
          }
        />
      )}

      <div className="flex flex-col gap-2 pt-1 pb-2">
        <Button type="submit" disabled={!ok}>
          {editar ? 'Salvar alterações' : 'Anotar'}
        </Button>
        {editar && (
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Apagar este registro?')) {
                apagarLancamento(editar.id)
                onClose()
              }
            }}
          >
            Apagar
          </Button>
        )}
      </div>
    </form>
  )
}
