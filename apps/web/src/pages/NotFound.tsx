import { Link } from 'react-router'
import { vi } from '../i18n/vi'

export function NotFound() {
  return (
    <>
      <h1>{vi.notFound.title}</h1>
      <p>
        <Link to="/">{vi.notFound.back}</Link>
      </p>
    </>
  )
}
