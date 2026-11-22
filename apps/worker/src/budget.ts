import { type Db, getFilm, getWorkspace, spentOnDay } from '@stick/db'
import { BudgetExceededError } from './errors.js'

/** Throws BudgetExceededError when spend is at or above a cap, the film cap first. NULL caps fall back to `defaults`. */
export async function checkBudget(db: Db, ws: string, filmId: string, defaults: { film: number; day: number }, now = new Date()): Promise<void> {
  const [workspace, film] = await Promise.all([getWorkspace(db, ws), getFilm(db, ws, filmId)])
  if (!workspace || !film) throw new Error('film not found')
  const filmCap = workspace.maxCostPerFilmUsd ?? defaults.film
  // `!(x < cap)` instead of `x >= cap`: a NaN spend must block, not pass.
  if (!(film.costUsd < filmCap)) throw new BudgetExceededError('film', film.costUsd, filmCap)
  const dayCap = workspace.maxCostPerDayUsd ?? defaults.day
  const spent = await spentOnDay(db, ws, now)
  if (!(spent < dayCap)) throw new BudgetExceededError('day', spent, dayCap)
}
