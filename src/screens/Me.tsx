import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { Screen } from '../components/Screen'
import { displayGenres } from '../data/query'
import { SettingsSections } from './Settings'

async function loadWatched() {
  const entries = await db.entries.where('status').equals('watched').toArray()
  const movies = await db.movies.bulkGet(entries.map((e) => e.tmdbId))
  return entries.flatMap((entry, i) => (movies[i] ? [{ entry, movie: movies[i]! }] : []))
}

export function Me() {
  return (
    <Screen title={t('titles.me')}>
      <MyStats />
      <SettingsSections />
    </Screen>
  )
}

function MyStats() {
  const items = useLiveQuery(loadWatched)
  if (!items || items.length === 0) return null

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
    </>
  )
}
