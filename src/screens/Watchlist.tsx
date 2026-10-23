import { useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { db } from '../db'
import { useLiveQuery } from '../useLiveQuery'
import { usePosterUrl } from '../usePosterUrl'
import { Screen } from '../components/Screen'
import { RatingPicker } from '../components/RatingPicker'
import { openMovie } from '../components/MovieSheet'
import { today, updateEntry } from '../data/collection'
import { displayTitle, type Item } from '../data/query'
import { tab } from '../app'

async function loadWatchlist(): Promise<Item[]> {
  const entries = await db.entries.where('status').equals('watchlist').toArray()
  const movies = await db.movies.bulkGet(entries.map((e) => e.tmdbId))
  return entries
    .flatMap((entry, i) => (movies[i] ? [{ entry, movie: movies[i]! }] : []))
    .sort((a, b) => b.entry.addedAt.localeCompare(a.entry.addedAt))
}

export function Watchlist() {
  const items = useLiveQuery(loadWatchlist)
  const [rating, setRating] = useState<number | null>(null)

  if (items && items.length === 0) {
    return (
      <Screen title={t('titles.watchlist')}>
        <div class="notice">
          <p class="muted">{t('watchlist.empty')}</p>
          <button class="btn" onClick={() => (tab.value = 'search')}>
            {t('watchlist.goSearch')}
          </button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title={t('titles.watchlist')}>
      {items && <div class="collection-count">{tn('collection.count', items.length)}</div>}
      <ul class="results">
        {items?.map((item) => (
          <WatchlistRow
            key={item.movie.tmdbId}
            item={item}
            rating={rating === item.movie.tmdbId}
            onRate={(open) => setRating(open ? item.movie.tmdbId : null)}
          />
        ))}
      </ul>
    </Screen>
  )
}

function WatchlistRow({ item, rating, onRate }: { item: Item; rating: boolean; onRate: (open: boolean) => void }) {
  const { movie } = item
  const url = usePosterUrl(movie.posterBlob, movie.posterPath, 'w185')
  const title = displayTitle(movie, lang.value)
  const other = lang.value === 'uk' ? movie.titleEn : movie.titleUk
  return (
    <li class="result watch-row">
      <div class="watch-main" onClick={() => (openMovie.value = { id: movie.tmdbId })}>
        {url ? <img class="thumb" src={url} alt="" loading="lazy" /> : <div class="thumb placeholder" />}
        <div class="result-text">
          <div class="result-title">{title}</div>
          {other && other !== title && <div class="result-sub">{other}</div>}
          {movie.year > 0 && <div class="result-year">{movie.year}</div>}
        </div>
        {!rating && (
          <button
            class="btn small"
            onClick={(e) => {
              e.stopPropagation()
              onRate(true)
            }}
          >
            {t('watchlist.watched')}
          </button>
        )}
      </div>
      {rating && (
        <div class="watch-rate">
          <div class="entry-label">{t('watchlist.rate')}</div>
          <RatingPicker
            onChange={(myRating) => {
              onRate(false)
              updateEntry(movie.tmdbId, { status: 'watched', myRating, watchedAt: today() })
            }}
          />
          <button class="link" onClick={() => onRate(false)}>
            {t('watchlist.cancel')}
          </button>
        </div>
      )}
    </li>
  )
}
