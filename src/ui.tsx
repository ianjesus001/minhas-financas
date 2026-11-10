import { useEffect, useState, type ReactNode } from 'react'
import { categoria } from './categorias'
import { fmtBRL, fmtData, parseValor, valorInput } from './format'
import type { Movimento } from './types'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-black/35" onClick={onClose} />
      <div
        role="dialog"
        aria-label={title}
        className="sheet-in safe-bottom relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-white px-5 pt-3"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} className="press grid h-9 w-9 place-items-center rounded-full bg-bg text-muted" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="safe-top mb-5 flex items-end justify-between gap-3 pt-2">
      <div>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        <h1 className="text-[1.75rem] leading-tight font-extrabold tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-7 mb-3 flex items-center justify-between px-1">
      <h2 className="text-[0.95rem] font-bold">{children}</h2>
      {action}
    </div>
  )
}

export function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: 'good' | 'bad' | 'muted'; hint?: string }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'muted' ? 'text-muted' : 'text-ink'
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={`num truncate text-lg font-bold ${color}`}>{value}</p>
      {hint && <p className="truncate text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

export function Progress({ value, color, bg = 'bg-bg' }: { value: number; color: string; bg?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full ${bg}`}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

export function Donut({ parts, size = 120, stroke = 16, children }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (Math.max(0, p.value) / total) * c
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={stroke}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
              />
            )
            acc += len
            return el
          })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-2xl border border-line bg-bg px-4 py-3.5 text-base outline-none transition focus:border-purple focus:bg-white'

/** Input de dinheiro: o texto é livre ("1.234,56"), o valor sai como número. */
export function MoneyInput({
  value,
  onChange,
  prefix = 'R$',
  big,
  autoFocus,
  decimals = 2,
}: {
  value: number
  onChange: (v: number) => void
  prefix?: string
  big?: boolean
  autoFocus?: boolean
  decimals?: number
}) {
  const [txt, setTxt] = useState(value ? valorInput(value) : '')
  useEffect(() => {
    if (parseValor(txt) !== value && !(isNaN(parseValor(txt)) && !value)) setTxt(value ? valorInput(value) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={`flex items-center rounded-2xl border border-line bg-bg px-4 transition focus-within:border-purple focus-within:bg-white ${big ? 'py-3' : 'py-2.5'}`}>
      <span className={`mr-2 font-semibold text-muted ${big ? 'text-2xl' : 'text-base'}`}>{prefix}</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={decimals === 4 ? '0,0000' : '0,00'}
        value={txt}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,]/g, '')
          setTxt(t)
          const n = parseValor(t)
          onChange(isNaN(n) ? 0 : n)
        }}
        className={`num w-full min-w-0 bg-transparent font-bold outline-none ${big ? 'text-3xl' : 'text-base'}`}
      />
    </div>
  )
}

export function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-sm font-medium transition ${
        active ? 'border-transparent text-white shadow-sm' : 'border-line bg-white text-ink'
      }`}
      style={active ? { background: color ?? 'var(--color-purple)' } : undefined}
    >
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-bg p-3.5 text-left">
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-teal' : 'bg-line'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, className = '' }: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'soft' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const v =
    variant === 'primary'
      ? 'bg-ink text-white'
      : variant === 'danger'
        ? 'bg-coral-soft text-bad'
        : 'bg-bg text-ink'
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`press w-full rounded-2xl px-5 py-4 text-base font-bold transition disabled:opacity-40 ${v} ${className}`}>
      {children}
    </button>
  )
}

export function MovRow({ m, onClick }: { m: Movimento; onClick?: () => void }) {
  const cat = categoria(m.categoria)
  const tipo = cat?.tipo ?? 'Gasto'
  const sinal = tipo === 'Entrada' || tipo === 'Resgate' ? '+' : '−'
  const color = tipo === 'Entrada' ? 'text-good' : tipo === 'Investimento' || tipo === 'Resgate' ? 'text-teal' : 'text-ink'
  return (
    <button onClick={onClick} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl" style={{ background: (cat?.cor ?? '#8D99AE') + '22' }}>
        {cat?.emoji ?? '❓'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem] font-semibold">{m.descricao || cat?.curto || m.categoria}</span>
        <span className="block truncate text-xs text-muted">
          {cat?.curto ?? m.categoria} · {fmtData(m.data)}
        </span>
      </span>
      <span className={`num shrink-0 font-bold ${color}`}>
        {sinal} {fmtBRL(m.valor)}
      </span>
    </button>
  )
}

export function Empty({ emoji, title, text }: { emoji: string; title: string; text: string }) {
  return (
    <div className="card px-6 py-8 text-center">
      <div className="mb-2 text-4xl">{emoji}</div>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </div>
  )
}

export function Info({ children, tone = 'gold' }: { children: ReactNode; tone?: 'gold' | 'blue' | 'teal' | 'purple' }) {
  const bg = { gold: 'bg-gold-soft', blue: 'bg-blue-soft', teal: 'bg-teal-soft', purple: 'bg-purple-soft' }[tone]
  return <div className={`rounded-3xl p-4 text-sm leading-relaxed ${bg}`}>{children}</div>
}

export function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
        {summary}
        <span className="text-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="px-5 pb-5 text-sm leading-relaxed text-ink/90">{children}</div>
    </details>
  )
}
