import type { Entry, Movie } from '../db'
import type { Lang } from '../i18n'

export type SortKey = 'myRating' | 'tmdbRating' | 'year' | 'watchedAt' | 'title' | 'addedAt'

export interface Filters {
  text: string
  genre: string
  person: string
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
  return [
    f.genre,
    f.person.trim(),
    f.yearFrom ?? f.yearTo,
    f.ratingFrom ?? f.ratingTo
  ].filter((v) => v !== undefined && v !== '').length
}

export function displayTitle(movie: Movie, lang: Lang): string {
  return (lang === 'uk' ? movie.titleUk || movie.titleEn : movie.titleEn || movie.titleUk) || movie.originalTitle
}

/** Genres in the current language; EN names fall back to UK when missing. */
export function displayGenres(movie: Movie, lang: Lang): string[] {
  return lang === 'en' && movie.genresEn?.length ? movie.genresEn : movie.genres
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

export function applyQuery(items: Item[], filters: Filters, sort: SortKey, asc: boolean, lang: Lang): Item[] {
  const text = norm(filters.text.trim())
  const person = norm(filters.person.trim())
  const result = items.filter(({ movie, entry }) => {
    if (text && ![movie.titleUk, movie.titleEn, movie.originalTitle].some((title) => norm(title ?? '').includes(text))) return false
    if (filters.genre && ![...movie.genres, ...(movie.genresEn ?? [])].includes(filters.genre)) return false
    if (person && ![...movie.directors, ...movie.cast.map((c) => c.name)].some((name) => norm(name).includes(person))) return false
    if (filters.yearFrom !== undefined && movie.year < filters.yearFrom) return false
    if (filters.yearTo !== undefined && movie.year > filters.yearTo) return false
    if (filters.ratingFrom !== undefined && (entry.myRating ?? 0) < filters.ratingFrom) return false
    if (filters.ratingTo !== undefined && (entry.myRating ?? 0) > filters.ratingTo) return false
    return true
  })

  const collator = new Intl.Collator(lang === 'uk' ? 'uk' : 'en', { sensitivity: 'base' })
  const key = (item: Item): number | string => {
    switch (sort) {
      case 'myRating':
        return item.entry.myRating ?? 0
      case 'tmdbRating':
        return item.movie.tmdbRating
      case 'year':
        return item.movie.releaseDate || String(item.movie.year)
      case 'watchedAt':
        return item.entry.watchedAt ?? ''
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
    const primary =
      typeof ka === 'number' && typeof kb === 'number' ? ka - kb : collator.compare(String(ka), String(kb))
    if (primary !== 0) return primary * dir
    // Stable tiebreak: newest added first, then title.
    return b.entry.addedAt.localeCompare(a.entry.addedAt) || collator.compare(displayTitle(a.movie, lang), displayTitle(b.movie, lang))
  })
}
