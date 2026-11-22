import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Cast } from './pages/Cast'
import { FilmDetail } from './pages/FilmDetail'
import { Films } from './pages/Films'
import { Login } from './pages/Login'
import { NotFound } from './pages/NotFound'
import { Overview } from './pages/Overview'
import { Review } from './pages/Review'
import { Settings } from './pages/Settings'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <Overview /> },
      { path: '/films', element: <Films /> },
      { path: '/films/:id', element: <FilmDetail /> },
      { path: '/review', element: <Review /> },
      { path: '/cast', element: <Cast /> },
      { path: '/settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])
