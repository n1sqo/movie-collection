import { useState } from 'preact/hooks'
import { lang, t, tn } from '../i18n'
import { recapYears, yearRecap, type RecapItem } from '../data/recap'
import { usePosterUrl } from '../usePosterUrl'
import { showToast } from '../components/Toast'
import { formatAvg } from './Collection'
import { renderRecapImage } from './recapImage'

function monthName(ym: string): string {
  const name = new Date(`${ym}-01T00:00:00`).toLocaleDateString(lang.value === 'uk' ? 'uk-UA' : 'en-US', {
    month: 'long'
  })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** «Мій рік у кіно»: the year in numbers, the best movie and favourites, shareable as a picture. */
export function Recap({
  items,
  year,
  onYear,
  onBack
}: {
  items: RecapItem[]
  year: string
  onYear: (year: string) => void
  onBack: () => void
}) {
  const [sharing, setSharing] = useState(false)
  const years = recapYears(items)
  const recap = yearRecap(items, year, lang.value)
  const best = recap.best
  const bestTitle = best ? (lang.value === 'uk' ? best.movie.titleUk : best.movie.titleEn) || best.movie.titleUk : ''
  const poster = usePosterUrl(best?.movie.posterBlob, best?.movie.posterPath, 'w342')
  const title = t('recap.title').replace('{year}', year)

  const share = async () => {
    setSharing(true)
    try {
      const blob = await renderRecapImage(
        recap,
        {
          title: t('recap.kicker'),
          films: tn('recap.filmsWord', recap.films),
          hours: t('stats.hoursUnit'),
          avg: t('stats.avgShort'),
          avgValue: recap.avg !== undefined ? formatAvg(recap.avg) : '–',
          best: t('recap.best'),
          genre: t('recap.genre'),
          director: t('recap.director'),
          monthLabel: t('recap.month'),
          month: recap.topMonth && monthName(recap.topMonth),
          footer: t('recap.footer')
        },
        bestTitle
      )
      const file = new File([blob], `kino-${year}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title })
      } else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(file)
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }
    } catch (e) {
      // Closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) showToast(t('recap.shareFailed'))
    } finally {
      setSharing(false)
    }
  }

  return (
    <section class="recap">
      <div class="screen-header">
        <button class="round-btn" aria-label={t('recap.back')} onClick={onBack}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>
      <p class="recap-kicker">{t('recap.kicker')}</p>
      <h1 class="recap-year">{year}</h1>
      {years.length > 1 && (
        <div class="chip-row" role="tablist" aria-label={t('recap.years')}>
          {years.map((y) => (
            <button
              key={y}
              role="tab"
              aria-selected={y === year}
              class={y === year ? 'chip on' : 'chip'}
              onClick={() => onYear(y)}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div class="stat-strip recap-stats">
        <div class="stat-tile">
          <b>{recap.films}</b>
          <span>{tn('recap.filmsWord', recap.films)}</span>
        </div>
        <div class="stat-tile">
          <b>{recap.hours}</b>
          <span>{t('stats.hoursUnit')}</span>
        </div>
        <div class="stat-tile">
          <b class="accent">{recap.avg !== undefined ? formatAvg(recap.avg) : '–'}</b>
          <span>{t('stats.avgShort')}</span>
        </div>
      </div>
      {recap.views > recap.films && <p class="hint recap-views">{tn('recap.withRewatches', recap.views)}</p>}

      {best && (
        <section class="card recap-best">
          {poster ? <img src={poster} alt="" /> : <div class="recap-poster" aria-hidden="true" />}
          <div>
            <div class="entry-label">{t('recap.best')}</div>
            <div class="recap-best-title">{bestTitle}</div>
            <div class="recap-rating">
              <b>{best.entry.myRating}</b>
              <span>/10</span>
            </div>
          </div>
        </section>
      )}

      <section class="card recap-facts">
        {recap.genre && (
          <div>
            <span>{t('recap.genre')}</span>
            <b>{recap.genre}</b>
          </div>
        )}
        {recap.director && (
          <div>
            <span>{t('recap.director')}</span>
            <b>{recap.director}</b>
          </div>
        )}
        {recap.topMonth && (
          <div>
            <span>{t('recap.month')}</span>
            <b>{monthName(recap.topMonth)}</b>
          </div>
        )}
      </section>

      <button class="btn primary big wide" disabled={sharing} onClick={share}>
        {t('recap.share')}
      </button>
    </section>
  )
}
