import type { BrowserContext, Page } from '@playwright/test'

export const TMDB_TOKEN = 'test-tmdb-token'
export const GH_TOKEN = 'github_pat_TEST'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
)

export function rawMovie(id: number, lang: 'uk' | 'en') {
  return {
    id,
    title: lang === 'uk' ? `Фільм ${id}` : `Movie ${id}`,
    original_title: `Movie ${id}`,
    release_date: `${1990 + (id % 30)}-01-01`,
    poster_path: `/p${id}.jpg`,
    vote_average: 5 + (id % 5)
  }
}

/** Fake TMDB: 140 results over 7 pages, details for any id, a trailer only in English. */
export async function mockTmdb(ctx: BrowserContext) {
  await ctx.route('https://api.themoviedb.org/**', (route) => {
    const url = new URL(route.request().url())
    const lang = url.searchParams.get('language') === 'uk-UA' ? 'uk' : 'en'
    if (url.pathname.endsWith('/search/movie')) {
      const page = Number(url.searchParams.get('page') ?? 1)
      const results = Array.from({ length: 20 }, (_, i) => rawMovie((page - 1) * 20 + i + 1, lang))
      return route.fulfill({ json: { page, results, total_pages: 7, total_results: 140 } })
    }
    if (url.pathname.endsWith('/videos')) {
      const results =
        lang === 'en'
          ? [
              { key: 'teaser1', site: 'YouTube', type: 'Teaser', official: true },
              { key: 'trailer1', site: 'YouTube', type: 'Trailer', official: true }
            ]
          : []
      return route.fulfill({ json: { results } })
    }
    const id = Number(url.pathname.split('/').pop())
    return route.fulfill({
      json: {
        ...rawMovie(id, lang),
        genres: [{ id: 1, name: lang === 'uk' ? 'Драма' : 'Drama' }],
        overview: lang === 'uk' ? 'Опис' : 'Overview',
        runtime: 120,
        credits: {
          cast: [{ name: 'Actor', character: 'Hero', order: 0 }],
          crew: [{ name: 'Director', job: 'Director' }]
        }
      }
    })
  })
  await ctx.route('https://image.tmdb.org/**', (route) =>
    route.fulfill({ body: PNG, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } })
  )
  await ctx.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ body: '<html></html>' }))
}

export interface FakeRepo {
  file: string | null
  sha: string | null
  commits: string[]
}

/** Fake GitHub Contents API for the backup repo. */
export async function mockGithub(ctx: BrowserContext, repo: FakeRepo) {
  await ctx.route('https://api.github.com/**', (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    if (req.headers().authorization !== `Bearer ${GH_TOKEN}`) return route.fulfill({ status: 401, json: {} })
    if (path === '/repos/me/movie-collection-backup')
      return route.fulfill({ json: { name: 'movie-collection-backup', private: true, permissions: { push: true } } })
    if (path !== '/repos/me/movie-collection-backup/contents/collection.json')
      return route.fulfill({ status: 404, json: {} })
    if (req.method() === 'GET') {
      if (!repo.file) return route.fulfill({ status: 404, json: {} })
      if (req.headers().accept?.includes('raw')) return route.fulfill({ body: repo.file })
      // Like GitHub, files over 1 MB come without inline content.
      if (repo.file.length > 1_000_000) return route.fulfill({ json: { sha: repo.sha, encoding: 'none', content: '' } })
      return route.fulfill({
        json: { sha: repo.sha, encoding: 'base64', content: Buffer.from(repo.file).toString('base64') }
      })
    }
    const body = JSON.parse(req.postData() ?? '{}')
    if ((body.sha ?? null) !== repo.sha) return route.fulfill({ status: 409, json: { message: 'sha mismatch' } })
    repo.file = Buffer.from(body.content, 'base64').toString('utf8')
    repo.sha = `sha${repo.commits.length}`
    repo.commits.push(body.message)
    return route.fulfill({ json: { content: { sha: repo.sha } } })
  })
}

export async function setTmdbToken(page: Page) {
  await page.locator('.tab').last().click()
  await page.locator('input[type=password]').first().fill(TMDB_TOKEN)
  await page.getByRole('button', { name: 'Зберегти' }).first().click()
}

export async function setupBackup(page: Page) {
  await page.locator('.tab').last().click()
  const inputs = page.locator('.group.stack input')
  await inputs.nth(0).fill('me')
  await inputs.nth(2).fill(GH_TOKEN)
  await page.locator('.group.stack').getByRole('button', { name: 'Зберегти' }).click()
}

export async function search(page: Page, query: string) {
  await page.locator('.tab').first().click()
  await page.fill('input[type=search]', query)
  await page.locator('.result').first().waitFor()
}
