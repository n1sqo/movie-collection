import { useEffect, useState } from 'preact/hooks'
import { IMG } from './api/tmdb'

export function usePosterUrl(blob: Blob | undefined, posterPath: string | undefined, size = 'w500'): string | undefined {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (blob) {
      const objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    }
    setUrl(posterPath ? `${IMG}/${size}${posterPath}` : undefined)
  }, [blob, posterPath, size])
  return url
}
