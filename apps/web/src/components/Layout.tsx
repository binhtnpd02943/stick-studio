import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useLogout } from '../api/queries'
import { vi } from '../i18n/vi'
import { BrandMark } from './Brand'

const ITEMS = [
  { to: '/', label: vi.nav.overview, end: true },
  { to: '/films', label: vi.nav.films, end: false },
  { to: '/review', label: vi.nav.review, end: false },
  { to: '/cast', label: vi.nav.cast, end: false },
  { to: '/settings', label: vi.nav.settings, end: false },
] as const

export function Layout() {
  const logout = useLogout()
  const inReview = useLocation().pathname.startsWith('/review')
  return (
    <div className={inReview ? 'shell shell-review' : 'shell'}>
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
          {inReview && (
            <Link to="/" className="shell-close" aria-label={vi.close}>
              ×
            </Link>
          )}
          <button type="button" className="shell-logout" disabled={logout.isPending} onClick={() => logout.mutate()}>
            {vi.logout}
          </button>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  )
}
