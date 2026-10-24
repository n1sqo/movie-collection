import { lang, t, tn } from '../i18n'
import { db, type Entry, type Movie } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { Screen } from '../components/Screen'
import { displayGenres } from '../data/query'
import { formatAvg } from './Collection'
import { viewDates } from '../data/collection'
import { signal } from '@preact/signals'
import { Recap } from './Recap'
import { recapYears } from '../data/recap'

type Item = { entry: Entry; movie: Movie }

async function loadWatched() {
  const entries = await db.entries.where('status').equals('watched').toArray()
  const movies = await db.movies.bulkGet(entries.map((e) => e.tmdbId))
  return entries.flatMap((entry, i) => (movies[i] ? [{ entry, movie: movies[i]! }] : []))
}

/** The year shown in «Мій рік у кіно», or none for the main «Я» page. */
const recapYear = signal<string | undefined>(undefined)

function openRecap(year: string | undefined) {
  recapYear.value = year
  window.scrollTo(0, 0)
}

export function Me() {
  if (recapYear.value) return <RecapPage year={recapYear.value} />
  return (
    <Screen title={t('titles.me')}>
      <MyStats />
    </Screen>
  )
}

function RecapPage({ year }: { year: string }) {
  const items = useLiveQuery(loadWatched)
  if (!items) return null
  return <Recap items={items} year={year} onYear={openRecap} onBack={() => openRecap(undefined)} />
}

function MyStats() {
  const items = useLiveQuery(loadWatched)
  if (!items) return null
  if (items.length === 0) return <p class="notice muted">{t('stats.empty')}</p>

  const ratedItems = items.filter((i) => i.entry.myRating !== undefined)
  const avg = ratedItems.length ? ratedItems.reduce((s, i) => s + i.entry.myRating!, 0) / ratedItems.length : undefined
  const year = String(new Date().getFullYear())
  const lastYearOfViews = recapYears(items)[0]
  const views = items.flatMap((i) => viewDates(i.entry))
  const watchedThisYear = items.filter((i) => viewDates(i.entry).some((d) => d.startsWith(year))).length

  const counts = Array.from({ length: 10 }, () => 0)
  for (const { entry } of items) if (entry.myRating) counts[entry.myRating - 1]++
  const rated = counts.reduce((a, b) => a + b, 0)
  const max = Math.max(...counts)
  const favourite = counts.indexOf(max) + 1

  const genreCounts = new Map<string, number>()
  for (const { movie } of items)
    for (const g of displayGenres(movie, lang.value)) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1)
  const genres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const topGenre = genres[0]?.[1] ?? 1

  return (
    <>
      <div class="stat-strip">
        <div class="stat-tile">
          <b>{items.length}</b>
          <span>{t('stats.watchedShort')}</span>
        </div>
        <div class="stat-tile">
          <b class="accent">{avg !== undefined ? formatAvg(avg) : '–'}</b>
          <span>{t('stats.avgShort')}</span>
        </div>
        <div class="stat-tile">
          <b>{watchedThisYear}</b>
          <span>{t('stats.thisYear')}</span>
        </div>
      </div>

      {lastYearOfViews && (
        <button class="card recap-entry" onClick={() => openRecap(lastYearOfViews)}>
          <span>
            <b>{t('recap.title').replace('{year}', lastYearOfViews)}</b>
            <span class="muted">{t('recap.teaser')}</span>
          </span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      <HoursCard items={items} year={year} />

      {rated > 0 && (
        <section class="card">
          <div class="card-head">
            <h2>{t('stats.ratings')}</h2>
            <span>{tn('collection.count', rated)}</span>
          </div>
          <div class="histogram" role="img" aria-label={t('stats.ratingsAria').replace('{n}', String(favourite))}>
            {counts.map((c, i) => (
              <div key={i} class="bar-col">
                <span class="bar-value">{c || ''}</span>
                <div
                  class={c === max ? 'bar top' : 'bar'}
                  style={{ height: `${Math.max(c ? 6 : 2, Math.round((c / max) * 100))}%` }}
                />
              </div>
            ))}
          </div>
          <div class="histogram-axis" aria-hidden="true">
            {counts.map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        </section>
      )}

      <ViewsByMonth views={views} />
      <ViewsByYear views={views} />

      {genres.length > 0 && (
        <section class="card">
          <div class="card-head">
            <h2>{t('stats.topGenres')}</h2>
          </div>
          {genres.map(([g, n]) => (
            <div key={g} class="meter">
              <div class="meter-label">
                <span>{g}</span>
                <span class="muted">{n}</span>
              </div>
              <div class="meter-track">
                <div class="meter-fill" style={{ width: `${Math.round((n / topGenre) * 100)}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <TopPeople title={t('stats.directors')} items={items} names={(m) => m.directors} />
      <TopPeople title={t('stats.actors')} items={items} names={(m) => m.cast.slice(0, 5).map((c) => c.name)} />
    </>
  )
}

/** Last 12 months, oldest first, as YYYY-MM. */
function lastMonths(now = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

function ViewsByMonth({ views }: { views: string[] }) {
  const months = lastMonths()
  const counts = months.map((m) => views.filter((d) => d.startsWith(m)).length)
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const max = Math.max(...counts)
  const locale = lang.value === 'uk' ? 'uk-UA' : 'en-US'
  const label = (m: string) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString(locale, { month: 'short' }).replace('.', '').slice(0, 3)
  return (
    <section class="card">
      <div class="card-head">
        <h2>{t('stats.byMonth')}</h2>
        <span>{tn('stats.views', total)}</span>
      </div>
      <div class="histogram months" role="img" aria-label={months.map((m, i) => `${label(m)} ${counts[i]}`).join(', ')}>
        {counts.map((c, i) => (
          <div key={months[i]} class="bar-col">
            <span class="bar-value">{c || ''}</span>
            <div
              class={c === max ? 'bar top' : 'bar'}
              style={{ height: `${Math.max(c ? 6 : 2, Math.round((c / max) * 100))}%` }}
            />
          </div>
        ))}
      </div>
      <div class="histogram-axis months" aria-hidden="true">
        {months.map((m) => (
          <span key={m}>{label(m)}</span>
        ))}
      </div>
    </section>
  )
}

function ViewsByYear({ views }: { views: string[] }) {
  const byYear = new Map<string, number>()
  for (const d of views) byYear.set(d.slice(0, 4), (byYear.get(d.slice(0, 4)) ?? 0) + 1)
  const years = [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  if (years.length === 0) return null
  const max = Math.max(...years.map(([, n]) => n))
  return (
    <section class="card">
      <div class="card-head">
        <h2>{t('stats.byYear')}</h2>
      </div>
      {years.map(([y, n]) => (
        <div key={y} class="meter">
          <div class="meter-label">
            <span>{y}</span>
            <span class="muted">{tn('stats.views', n)}</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill" style={{ width: `${Math.round((n / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  )
}

/** Total runtime of every view, re-watches included. */
function HoursCard({ items, year }: { items: Item[]; year: string }) {
  let minutes = 0
  let minutesThisYear = 0
  for (const { entry, movie } of items) {
    const dates = viewDates(entry)
    // A movie marked watched without a date still counts once.
    minutes += movie.runtime * Math.max(1, dates.length)
    minutesThisYear += movie.runtime * dates.filter((d) => d.startsWith(year)).length
  }
  const hours = Math.round(minutes / 60)
  if (hours === 0) return null
  const days = Math.floor(minutes / 60 / 24)
  return (
    <section class="card hours-card">
      <div class="hours-big">
        <b>{hours.toLocaleString(lang.value === 'uk' ? 'uk-UA' : 'en-US')}</b>
        <span>{t('stats.hoursUnit')}</span>
      </div>
      <div class="hours-text">
        <div>{days > 0 ? tn('stats.daysNonStop', days) : t('stats.hoursTitle')}</div>
        {minutesThisYear > 0 && (
          <div class="muted">{t('stats.hoursThisYear').replace('{n}', String(Math.round(minutesThisYear / 60)))}</div>
        )}
      </div>
    </section>
  )
}

/** People in at least two of the watched movies, most frequent first. */
function TopPeople({ title, items, names }: { title: string; items: Item[]; names: (m: Movie) => string[] }) {
  const people = new Map<string, { count: number; ratings: number[] }>()
  for (const { entry, movie } of items)
    for (const name of new Set(names(movie))) {
      const p = people.get(name) ?? { count: 0, ratings: [] }
      p.count++
      if (entry.myRating) p.ratings.push(entry.myRating)
      people.set(name, p)
    }
  const avg = (r: number[]) => (r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0)
  const top = [...people.entries()]
    .filter(([, p]) => p.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || avg(b[1].ratings) - avg(a[1].ratings))
    .slice(0, 5)
  if (top.length === 0) return null
  return (
    <section class="card">
      <div class="card-head">
        <h2>{title}</h2>
      </div>
      <ol class="people">
        {top.map(([name, p]) => (
          <li key={name}>
            <span class="people-name">{name}</span>
            <span class="muted">{tn('collection.count', p.count)}</span>
            {p.ratings.length > 0 && <b class="people-avg">{formatAvg(avg(p.ratings))}</b>}
          </li>
        ))}
      </ol>
    </section>
  )
}
