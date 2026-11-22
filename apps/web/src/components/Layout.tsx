import { useRef, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { useLogout, useMe, useUsageToday, useWorkspace } from '../api/queries'
import { vi } from '../i18n/vi'
import { BrandMark } from './Brand'
import { CostBadge } from './CostBadge'
import { useDismiss } from './use-dismiss'

const ITEMS = [
  { to: '/', label: vi.nav.overview, end: true },
  { to: '/films', label: vi.nav.films, end: false },
  { to: '/cast', label: vi.nav.cast, end: false },
  { to: '/settings', label: vi.nav.settings, end: false },
] as const

function TodaySpend() {
  const usage = useUsageToday().data
  const workspace = useWorkspace().data
  if (!usage || !workspace) return null
  return <CostBadge spentUsd={usage.total_usd} capUsd={workspace.effective_max_cost_per_day_usd} label={vi.spend.label} prefix={vi.spend.today} />
}

/** The avatar opens a small menu; Escape or a click elsewhere closes it. */
function AccountMenu() {
  const logout = useLogout()
  const name = useMe().data?.user.name ?? ''
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useDismiss(open, () => setOpen(false), box)
  return (
    <div className="account" ref={box}>
      <button type="button" className="avatar" aria-label={vi.account} aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
        <span aria-hidden="true">{name.trim().charAt(0).toUpperCase() || '·'}</span>
      </button>
      {open && (
        <div id="account-menu" className="account-menu">
          <button type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{vi.logout}</button>
        </div>
      )}
    </div>
  )
}

export function Layout() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-bar">
          <Link to="/" className="shell-brand">
            <BrandMark />
            <span>{vi.brand}</span>
          </Link>
          <nav aria-label={vi.nav.label} className="shell-nav">
            {ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <TodaySpend />
          <AccountMenu />
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
