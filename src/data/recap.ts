import type { Entry, Movie } from '../db'
import { viewDates } from './collection'
import { displayGenres } from './query'

export interface RecapItem {
  entry: Entry
  movie: Movie
}

export interface YearRecap {
  year: string
  films: number
  views: number
  hours: number
  avg?: number
  best?: RecapItem
  genre?: string
  director?: string
  /** YYYY-MM with the most views. */
  topMonth?: string
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: [string, number] | undefined
  for (const c of counts) if (!best || c[1] > best[1]) best = c
  return best?.[0]
}

/** Years with at least one view, newest first. */
export function recapYears(items: RecapItem[]): string[] {
  const years = new Set(items.flatMap((i) => viewDates(i.entry).map((d) => d.slice(0, 4))))
  return [...years].sort().reverse()
}

export function yearRecap(items: RecapItem[], year: string, lang: 'uk' | 'en'): YearRecap {
  const inYear = items
    .map((item) => ({ item, dates: viewDates(item.entry).filter((d) => d.startsWith(year)) }))
    .filter((x) => x.dates.length > 0)
  const dates = inYear.flatMap((x) => x.dates)
  const minutes = inYear.reduce((sum, x) => sum + x.item.movie.runtime * x.dates.length, 0)
  const rated = inYear.filter((x) => x.item.entry.myRating !== undefined)
  // Highest rating wins; among equals, the one watched most recently this year.
  const best = [...rated].sort(
    (a, b) => b.item.entry.myRating! - a.item.entry.myRating! || b.dates.at(-1)!.localeCompare(a.dates.at(-1)!)
  )[0]?.item
  return {
    year,
    films: inYear.length,
    views: dates.length,
    hours: Math.round(minutes / 60),
    avg: rated.length ? rated.reduce((s, x) => s + x.item.entry.myRating!, 0) / rated.length : undefined,
    best,
    genre: mostCommon(inYear.flatMap((x) => displayGenres(x.item.movie, lang))),
    director: mostCommon(inYear.flatMap((x) => x.item.movie.directors)),
    topMonth: mostCommon(dates.map((d) => d.slice(0, 7)))
  }
}
