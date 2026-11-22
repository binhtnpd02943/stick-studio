import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { useLogin } from '../api/queries'
import { BrandMark } from '../components/Brand'
import { ErrorNotice } from '../components/ErrorNotice'
import { vi } from '../i18n/vi'
import { safeNext } from '../safe-next'
import '../styles/login.css'

function LoginError({ error }: { error: unknown }) {
  if (error instanceof ApiError && error.status === 401) return <p role="alert" className="error-notice">{vi.login.wrong}</p>
  if (error instanceof ApiError && error.code === 'internal') return <p role="alert" className="error-notice">{vi.login.unavailable}</p>
  return <ErrorNotice error={error} />
}

export function Login() {
  const login = useLogin()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    login.mutate(
      { email: String(form.get('email')), password: String(form.get('password')) },
      { onSuccess: () => void navigate(safeNext(params.get('next')), { replace: true }) },
    )
  }

  return (
    <main className="login">
      <div className="login-brand">
        <BrandMark />
        <span>{vi.brand}</span>
      </div>
      <div className="login-art">
        <svg width="260" height="200" viewBox="0 0 260 200" aria-hidden="true">
          <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="150" y="30" width="70" height="150" rx="4" />
            <circle cx="206" cy="108" r="4" />
            <path d="M20 180 L240 180" />
          </g>
          <g className="login-breathe" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="80" cy="66" r="14" />
            <path d="M80 80 L80 126 M80 94 L62 116 M80 94 L112 100 M80 126 L68 178 M80 126 L92 178" />
          </g>
          <g fill="none" stroke="#ff8c26" strokeWidth="4" strokeLinecap="round">
            <circle cx="120" cy="100" r="7" />
            <path d="M127 100 L144 100 M138 100 L138 107 M143 100 L143 105" />
          </g>
        </svg>
      </div>
      <div className="login-heading">
        <h1>{vi.login.title}</h1>
        <p>{vi.login.subtitle}</p>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <label>
          {vi.login.email}
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          {vi.login.password}
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {login.isError && <LoginError error={login.error} />}
        <button type="submit" className="login-submit" disabled={login.isPending}>{vi.login.submit}</button>
      </form>
      <p className="login-foot">{vi.login.footer}</p>
    </main>
  )
}
