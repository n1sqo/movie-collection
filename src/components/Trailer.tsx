import { useEffect, useState } from 'preact/hooks'
import { t } from '../i18n'
import { tmdbToken } from '../settings'
import { online } from '../useOnline'
import { getTrailerKey } from '../api/tmdb'

/** Trailer from TMDB, played inline via YouTube. Needs a connection, so it hides offline. */
export function Trailer({ tmdbId }: { tmdbId: number }) {
  const [key, setKey] = useState<string | null>()

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
      <h3>{t('movie.trailer')}</h3>
      <div class="trailer-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${key}?playsinline=1&rel=0`}
          title={t('movie.trailer')}
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <a class="trailer-link" href={`https://www.youtube.com/watch?v=${key}`} target="_blank" rel="noopener">
        {t('movie.openYoutube')}
      </a>
    </section>
  )
}
