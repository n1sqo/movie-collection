import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { tmdbToken } from '../settings'
import { online } from '../useOnline'
import { getTrailerKey } from '../api/tmdb'

/** Trailer from TMDB, played inline via YouTube. Needs a connection, so it hides offline. */
export function Trailer({ tmdbId }: { tmdbId: number }) {
  const [key, setKey] = useState<string | null>()
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!online.value || !tmdbToken.value || key !== undefined) return
    const controller = new AbortController()
    getTrailerKey(tmdbToken.value, tmdbId, controller.signal)
      .then((k) => setKey(k ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [tmdbId, online.value])

  if (!key || !online.value) return null
  return (
    <section class="trailer">
      <h2 class="section-h">{t('movie.trailer')}</h2>
      <div class="trailer-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${key}?playsinline=1&rel=0&autoplay=1`}
            title={t('movie.trailer')}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          // A still from YouTube until tapped, so the card doesn't load a player for every movie.
          <button class="trailer-poster" aria-label={t('movie.playTrailer')} onClick={() => setPlaying(true)}>
            <img src={`https://i.ytimg.com/vi/${key}/hqdefault.jpg`} alt="" loading="lazy" />
            <span class="play">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="currentColor" d="M8 5v14l11-7z" />
              </svg>
            </span>
          </button>
        )}
      </div>
      <a class="trailer-link" href={`https://www.youtube.com/watch?v=${key}`} target="_blank" rel="noopener">
        {t('movie.openYoutube')}
      </a>
    </section>
  )
}
