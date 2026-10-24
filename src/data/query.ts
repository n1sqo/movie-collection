import type { Entry, Movie } from '../db'
import type { Lang } from '../i18n'

export type SortKey = 'myRating' | 'tmdbRating' | 'year' | 'watchedAt' | 'title' | 'addedAt'

export interface Filters {
  text: string
  genre: string
  person: string
  /** One of the user's lists; '' for all. */
  tag?: string
  yearFrom?: number
  yearTo?: number
  ratingFrom?: number
  ratingTo?: number
}

export interface Item {
  movie: Movie
  entry: Entry
}

export const emptyFilters: Filters = { text: '', genre: '', person: '' }

export function activeFilterCount(f: Filters): number {
  return [f.genre, f.person.trim(), f.yearFrom ?? f.yearTo, f.ratingFrom ?? f.ratingTo].filter(
    (v) => v !== undefined && v !== ''
  ).length
}

export function displayTitle(movie: Movie, lang: Lang): string {
  return (lang === 'uk' ? movie.titleUk || movie.titleEn : movie.titleEn || movie.titleUk) || movie.originalTitle
}

/** Genres in the current language; EN names fall back to UK when missing. */
export function displayGenres(movie: Movie, lang: Lang): string[] {
  return lang === 'en' && movie.genresEn?.length ? movie.genresEn : movie.genres
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Accepts the range in either order, so "2020 – 1990" means 1990–2020. */
function range(a?: number, b?: number): [number | undefined, number | undefined] {
  return a !== undefined && b !== undefined && a > b ? [b, a] : [a, b]
}

export function applyQuery(items: Item[], filters: Filters, sort: SortKey, asc: boolean, lang: Lang): Item[] {
  const text = norm(filters.text.trim())
  const [yearFrom, yearTo] = range(filters.yearFrom, filters.yearTo)
  const [ratingFrom, ratingTo] = range(filters.ratingFrom, filters.ratingTo)
  const person = norm(filters.person.trim())
  const result = items.filter(({ movie, entry }) => {
    if (text && ![movie.titleUk, movie.titleEn, movie.originalTitle].some((title) => norm(title ?? '').includes(text)))
      return false
    if (filters.tag && !entry.tags?.includes(filters.tag)) return false
    if (filters.genre && ![...movie.genres, ...(movie.genresEn ?? [])].includes(filters.genre)) return false
    if (person && ![...movie.directors, ...movie.cast.map((c) => c.name)].some((name) => norm(name).includes(person)))
      return false
    if (yearFrom !== undefined && (!movie.year || movie.year < yearFrom)) return false
    if (yearTo !== undefined && (!movie.year || movie.year > yearTo)) return false
    if (ratingFrom !== undefined && (entry.myRating ?? 0) < ratingFrom) return false
    if (ratingTo !== undefined && (entry.myRating ?? 0) > ratingTo) return false
    return true
  })

  const collator = new Intl.Collator(lang === 'uk' ? 'uk' : 'en', { sensitivity: 'base' })
  // undefined = unknown (no rating, no release date…): always sorted to the end.
  const key = (item: Item): number | string | undefined => {
    switch (sort) {
      case 'myRating':
        return item.entry.myRating
      case 'tmdbRating':
        return item.movie.tmdbRating || undefined
      case 'year':
        return item.movie.releaseDate || (item.movie.year ? String(item.movie.year) : undefined)
      case 'watchedAt':
        // The most recent view, so a re-watch moves the movie up.
        return item.entry.rewatches?.at(-1) ?? item.entry.watchedAt
      case 'title':
        return displayTitle(item.movie, lang)
      case 'addedAt':
        return item.entry.addedAt
    }
  }
  const dir = asc ? 1 : -1
  return result.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (ka === undefined || kb === undefined) {
      if (ka !== kb) return ka === undefined ? 1 : -1
      return b.entry.addedAt.localeCompare(a.entry.addedAt)
    }
    const primary =
      typeof ka === 'number' && typeof kb === 'number' ? ka - kb : collator.compare(String(ka), String(kb))
    if (primary !== 0) return primary * dir
    // Stable tiebreak: newest added first, then title.
    return (
      b.entry.addedAt.localeCompare(a.entry.addedAt) ||
      collator.compare(displayTitle(a.movie, lang), displayTitle(b.movie, lang))
    )
  })
}
