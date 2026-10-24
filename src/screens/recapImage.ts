import { posterUrl } from '../api/tmdb'
import type { YearRecap } from '../data/recap'

const W = 1080
const H = 1920
const FONT = '"Inter Variable", -apple-system, system-ui, sans-serif'

export interface RecapLabels {
  title: string
  films: string
  hours: string
  avg: string
  /** The average, already formatted for the language. */
  avgValue: string
  best: string
  genre: string
  director: string
  month?: string
  monthLabel: string
  footer: string
}

async function loadPoster(item: YearRecap['best']): Promise<CanvasImageSource | undefined> {
  if (!item) return undefined
  try {
    if (item.movie.posterBlob) return await createImageBitmap(item.movie.posterBlob)
    if (!item.movie.posterPath) return undefined
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = posterUrl(item.movie.posterPath, 'w500')
    await img.decode()
    return img
  } catch {
    return undefined
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Shortens text with an ellipsis until it fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > width) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

/** Story-sized (9:16) picture of the year, ready for Instagram or Messages. */
export async function renderRecapImage(recap: YearRecap, labels: RecapLabels, title: string): Promise<Blob> {
  await document.fonts?.load(`800 100px ${FONT}`).catch(() => undefined)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0b0b0f'
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.8, 120, 40, W * 0.8, 120, 900)
  glow.addColorStop(0, 'rgba(255,181,71,0.45)')
  glow.addColorStop(1, 'rgba(255,181,71,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const left = 90
  ctx.fillStyle = '#ffb547'
  ctx.font = `700 44px ${FONT}`
  ctx.fillText(labels.title, left, 200)
  ctx.fillStyle = '#f5f5f7'
  ctx.font = `800 220px ${FONT}`
  ctx.fillText(recap.year, left - 10, 410)

  // Three big numbers.
  const stats: [string, string][] = [
    [String(recap.films), labels.films],
    [String(recap.hours), labels.hours],
    [labels.avgValue, labels.avg]
  ]
  const colW = (W - left * 2) / 3
  stats.forEach(([value, label], i) => {
    const x = left + i * colW
    ctx.fillStyle = i === 2 ? '#ffb547' : '#f5f5f7'
    ctx.font = `800 120px ${FONT}`
    ctx.fillText(value, x, 600)
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `500 36px ${FONT}`
    ctx.fillText(fit(ctx, label, colW - 20), x, 655)
  })

  // Best movie: poster with title and rating.
  let y = 720
  if (recap.best) {
    roundRect(ctx, left - 30, y, W - (left - 30) * 2, 540, 48)
    ctx.fillStyle = '#1c1c22'
    ctx.fill()
    const poster = await loadPoster(recap.best)
    const pw = 300
    const ph = 450
    const px = left + 10
    const py = y + 45
    ctx.save()
    roundRect(ctx, px, py, pw, ph, 24)
    ctx.clip()
    if (poster) ctx.drawImage(poster, px, py, pw, ph)
    else {
      ctx.fillStyle = '#2a2a32'
      ctx.fillRect(px, py, pw, ph)
    }
    ctx.restore()
    const tx = px + pw + 50
    const tw = W - tx - left
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 36px ${FONT}`
    ctx.fillText(labels.best, tx, py + 50)
    ctx.fillStyle = '#f5f5f7'
    ctx.font = `800 56px ${FONT}`
    const words = (title || recap.best.movie.titleUk).split(' ')
    const lines: string[] = []
    for (const w of words) {
      const last = lines.at(-1)
      if (last !== undefined && ctx.measureText(`${last} ${w}`).width <= tw) lines[lines.length - 1] = `${last} ${w}`
      else lines.push(w)
    }
    lines.slice(0, 4).forEach((line, i) => ctx.fillText(fit(ctx, line, tw), tx, py + 130 + i * 66))
    ctx.fillStyle = '#ffb547'
    ctx.font = `800 110px ${FONT}`
    ctx.fillText(String(recap.best.entry.myRating), tx, py + ph - 10)
    const ratingW = ctx.measureText(String(recap.best.entry.myRating)).width
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `600 44px ${FONT}`
    ctx.fillText('/10', tx + ratingW + 8, py + ph - 10)
    y += 600
  }

  // Favourites.
  const rows: [string, string | undefined][] = [
    [labels.genre, recap.genre],
    [labels.director, recap.director],
    [labels.monthLabel, labels.month]
  ]
  for (const [label, value] of rows) {
    if (!value) continue
    ctx.fillStyle = '#a1a1aa'
    ctx.font = `500 36px ${FONT}`
    ctx.fillText(label, left, y + 36)
    ctx.fillStyle = '#f5f5f7'
    ctx.font = `700 56px ${FONT}`
    ctx.fillText(fit(ctx, value, W - left * 2), left, y + 100)
    y += 140
  }

  ctx.fillStyle = '#a1a1aa'
  ctx.font = `600 34px ${FONT}`
  ctx.fillText(labels.footer, left, H - 70)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png')
  )
}
