import { expect, test } from '@playwright/test'
import {
  closeSheet,
  goTo,
  mockGithub,
  mockTmdb,
  openSearch,
  search,
  setTmdbToken,
  setupBackup,
  swipe,
  type FakeRepo
} from './mocks'

test.beforeEach(async ({ context, page }) => {
  await mockTmdb(context)
  await page.goto('./')
  await setTmdbToken(page)
})

test('search waits for 2 characters and pages through results', async ({ page }) => {
  await openSearch(page)
  await page.fill('.search-bar input', 'a')
  await expect(page.getByText('Введи хоча б 2 символи')).toBeVisible()
  await search(page, 'ab')
  await expect(page.locator('.result')).toHaveCount(20)
  await expect(page.locator('.result-count')).toContainText('140')
  await page.getByRole('button', { name: 'Наступна сторінка' }).click()
  await expect(page.locator('.result').first()).toContainText('Фільм 21')
  await expect(page.locator('.pagination [aria-current="page"]')).toHaveText('2')
})

test('search closes back to the section it was opened from', async ({ page }) => {
  await goTo(page, 'Я')
  await openSearch(page)
  await expect(page.locator('.tabbar')).toHaveCount(0)
  await page.getByRole('button', { name: 'Закрити пошук' }).click()
  await expect(page.locator('.large-title')).toHaveText('Я')
})

test('rating panel has no gap above the number', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  const box = await page.locator('.rate-panel').boundingBox()
  const num = await page.locator('.rate-big').boundingBox()
  expect(num!.y - box!.y).toBeLessThan(40)
})

test('search field stays pinned at the top while results scroll', async ({ page }) => {
  await search(page, 'film')
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(200)
  const bar = await page.locator('.search-bar').boundingBox()
  expect(bar!.y).toBeLessThan(10)
})

test('rating: big number with label, date chips, Done collapses to a summary', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  await expect(page.locator('.rate-big')).toContainText('Обери оцінку')
  await page.locator('.rating-picker button', { hasText: /^8$/ }).click()
  await expect(page.locator('.rate-big')).toContainText('Дуже добре')
  await expect(page.getByRole('button', { name: 'Сьогодні' })).toHaveClass(/on/)
  await page.getByRole('button', { name: 'Вчора' }).click()
  await expect(page.getByRole('button', { name: 'Вчора' })).toHaveClass(/on/)
  await page.locator('.entry-note textarea').fill('Класний фільм')
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.entry-summary')).toContainText('8')
  await expect(page.locator('.note-card')).toContainText('Класний фільм')
  await page.getByRole('button', { name: 'Змінити' }).click()
  await page.locator('.rating-picker button.active').click()
  await expect(page.locator('.rating-picker button.active')).toHaveCount(0)
})

test('cancelling the rating of a new movie saves nothing', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  await page.getByRole('button', { name: 'Скасувати' }).click()
  await expect(page.getByRole('button', { name: 'Хочу подивитись' })).toBeVisible()
  await closeSheet(page)
  await expect(page.locator('.result').first().locator('.add-btn')).toBeVisible()
})

test('trailer shows a still and plays on tap', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await expect(page.locator('.trailer-poster img')).toHaveAttribute('src', /i\.ytimg\.com\/vi\/trailer1\//)
  await page.getByRole('button', { name: 'Відтворити трейлер' }).click()
  await expect(page.locator('.trailer iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/trailer1/)
})

test('plus in search adds to the watchlist, with undo', async ({ page }) => {
  await search(page, 'film')
  const first = page.locator('.result').first()
  await first.getByRole('button', { name: 'Додати в «Подивитись»' }).click()
  await expect(first.locator('.status-pill')).toHaveText('У списку')
  await page.locator('.toast button').click()
  await expect(first.locator('.add-btn')).toBeVisible()
  await page.locator('.result').nth(1).getByRole('button', { name: 'Додати в «Подивитись»' }).click()
  await goTo(page, 'Колекція')
  await page.getByRole('tab', { name: /Подивитись · 1/ }).click()
  await expect(page.locator('.watch-row')).toHaveCount(1)
})

test('removing a movie offers undo', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  await page.locator('.rating-picker button', { hasText: /^7$/ }).click()
  await page.getByRole('button', { name: 'Видалити з колекції' }).click()
  await page.locator('.remove-confirm .destructive').click()
  await page.locator('.toast button').click()
  await goTo(page, 'Колекція')
  await expect(page.locator('.poster-tile')).toHaveCount(1)
})

test('collection: stats, segments, quick filters and title search', async ({ page }) => {
  for (const [n, rating] of [
    [0, 9],
    [1, 6],
    [2, 10]
  ]) {
    await search(page, 'film')
    await page.locator('.result').nth(n).click()
    await page.getByRole('button', { name: 'Бачив', exact: true }).click()
    await page.locator('.rating-picker button', { hasText: new RegExp(`^${rating}$`) }).click()
    await closeSheet(page)
  }
  await goTo(page, 'Колекція')
  await expect(page.locator('.stat-tile')).toHaveCount(0)
  await expect(page.locator('.poster-tile')).toHaveCount(3)
  await page.getByRole('button', { name: '9–10' }).click()
  await expect(page.locator('.poster-tile')).toHaveCount(2)
  await page.getByRole('button', { name: '9–10' }).click()
  await page.getByRole('button', { name: 'Фільтри' }).click()
  await page.locator('.filter-panel input[type=search]').fill('Фільм 2')
  await expect(page.locator('.poster-tile')).toHaveCount(1)
  await page.getByRole('button', { name: 'Скинути' }).click()
  await expect(page.locator('.poster-tile')).toHaveCount(3)
  await page.getByRole('tab', { name: /Подивитись · 0/ }).click()
  await expect(page.getByText('Додавай сюди фільми')).toBeVisible()
})

test('watchlist: mark watched with a rating and remove', async ({ page }) => {
  await search(page, 'film')
  for (const n of [0, 1]) {
    await page.locator('.result').nth(n).click()
    await page.getByRole('button', { name: 'Хочу подивитись' }).click()
    await closeSheet(page)
  }
  await goTo(page, 'Колекція')
  await page.getByRole('tab', { name: /Подивитись/ }).click()
  await expect(page.locator('.watch-row')).toHaveCount(2)
  await page.locator('.watch-row').first().getByRole('button', { name: 'Бачив' }).click()
  await page.locator('.rating-picker button', { hasText: /^9$/ }).click()
  await expect(page.locator('.watch-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Прибрати зі списку' }).click()
  await expect(page.locator('.watch-row')).toHaveCount(0)
  await page.getByRole('tab', { name: /Бачив · 1/ }).click()
  await expect(page.locator('.poster-tile')).toHaveCount(1)
})

test('watchlist swipe: right to rate (with undo), left to remove', async ({ page }) => {
  await search(page, 'film')
  for (const n of [0, 1]) {
    await page.locator('.result').nth(n).getByRole('button', { name: 'Додати в «Подивитись»' }).click()
    await expect(page.locator('.result').nth(n).locator('.status-pill')).toHaveText('У списку')
  }
  await goTo(page, 'Колекція')
  await page.getByRole('tab', { name: /Подивитись/ }).click()
  await expect(page.locator('.watch-row')).toHaveCount(2)

  await swipe(page, '.watch-row >> nth=0 >> .watch-main', 120)
  await page.locator('.watch-row').first().locator('.rating-picker button', { hasText: /^9$/ }).click()
  await expect(page.locator('.toast')).toContainText('оцінкою 9')
  await expect(page.locator('.watch-row')).toHaveCount(1)
  await page.locator('.toast button').click()
  await expect(page.locator('.watch-row')).toHaveCount(2)

  // A short drag does nothing; a long one to the left removes.
  await swipe(page, '.watch-row >> nth=0 >> .watch-main', -40)
  await expect(page.locator('.watch-row')).toHaveCount(2)
  await expect(page.locator('.sheet')).toHaveCount(0)
  await swipe(page, '.watch-row >> nth=0 >> .watch-main', -120)
  await expect(page.locator('.watch-row')).toHaveCount(1)
  await expect(page.locator('.toast')).toContainText('Фільм видалено')
})

test('Me: rating histogram and favourite genres', async ({ page }) => {
  await search(page, 'film')
  for (const n of [0, 1]) {
    await page.locator('.result').nth(n).click()
    await page.getByRole('button', { name: 'Бачив', exact: true }).click()
    await page.locator('.rating-picker button', { hasText: /^8$/ }).click()
    await closeSheet(page)
  }
  await goTo(page, 'Я')
  await expect(page.locator('.stat-tile').first()).toContainText('2')
  await expect(page.locator('.stat-tile').nth(1)).toContainText('8,0')
  const ratings = page.locator('.card', { hasText: 'Мої оцінки' })
  await expect(ratings.locator('.bar.top')).toHaveCount(1)
  await expect(ratings.locator('.bar-col').nth(7)).toContainText('2')
  await expect(page.locator('.card', { hasText: 'Улюблені жанри' })).toContainText('Драма')
  await expect(page.locator('.hours-card')).toContainText('4год у кіно')
  await expect(page.locator('.hours-card')).toContainText('З них 4 год цього року')
  const directors = page.locator('.card', { hasText: 'Улюблені режисери' })
  await expect(directors.locator('li')).toHaveText(['Director2 фільми8,0'])
  await expect(page.locator('.card', { hasText: 'Улюблені актори' })).toContainText('Actor')
})

test('re-watches: add with undo, remove, counted by month and year', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  await page.locator('.rating-picker button', { hasText: /^9$/ }).click()
  await page.getByRole('button', { name: 'Готово' }).click()

  await page.getByRole('button', { name: 'Переглянув ще раз' }).click()
  await expect(page.locator('.rewatch-count')).toContainText('Ще 1 раз')
  await page.getByRole('button', { name: 'Скасувати' }).click()
  await expect(page.locator('.rewatch-count')).toHaveCount(0)

  await page.getByRole('button', { name: 'Переглянув ще раз' }).click()
  await page.getByRole('button', { name: 'Переглянув ще раз' }).click()
  await expect(page.locator('.rewatch-count')).toContainText('Ще 2 рази')
  await closeSheet(page)

  await goTo(page, 'Я')
  const months = page.locator('.card', { hasText: 'Перегляди по місяцях' })
  await expect(months).toContainText('3 перегляди')
  await expect(months.locator('.bar-col')).toHaveCount(12)
  await expect(months.locator('.bar-col').last()).toContainText('3')
  const year = String(new Date().getFullYear())
  await expect(page.locator('.card', { hasText: 'По роках' })).toContainText(`${year}3 перегляди`)
  // Every view counts towards the hours: 3 × 2 h.
  await expect(page.locator('.hours-card')).toContainText('6год у кіно')

  // Removing a re-watch from the edit panel updates the stats.
  await goTo(page, 'Колекція')
  await page.getByRole('button', { name: 'Фільм 1', exact: true }).click()
  await page.getByRole('button', { name: 'Змінити' }).click()
  await page.locator('.rewatch-chip').first().click()
  await expect(page.locator('.rewatch-chip')).toHaveCount(1)
  await page.getByRole('button', { name: 'Готово' }).click()
  await closeSheet(page)
  await goTo(page, 'Я')
  await expect(months).toContainText('2 перегляди')
})

test('bottom bar sits at the same place on every tab, short pages included', async ({ page }) => {
  // «Я» with no movies is the shortest page; it is where the bar floated up on iPhone.
  // Chromium has no notch, so stand in the iPhone 14 Pro status-bar inset.
  await page.addStyleTag({ content: ':root { --top-inset: 59px }' })
  const offsets: number[] = []
  for (const section of ['Я', 'Колекція', 'Опції'] as const) {
    await goTo(page, section)
    const bar = await page.locator('.tabbar').boundingBox()
    const viewport = page.viewportSize()!
    offsets.push(Math.round(viewport.height - (bar!.y + bar!.height)))
    // iOS only pins fixed elements to the real screen bottom when the page is at least screen-high.
    const tall = await page.evaluate(() => document.documentElement.scrollHeight >= window.innerHeight + 59)
    expect(tall, `${section} page shorter than screen + status bar`).toBe(true)
  }
  expect(new Set(offsets).size, `bar offsets ${offsets.join(', ')}`).toBe(1)
  expect(offsets[0]).toBeGreaterThanOrEqual(16)
  expect(offsets[0]).toBeLessThanOrEqual(40)
})

test('English interface', async ({ page }) => {
  await goTo(page, 'Опції')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('.tabbar')).toContainText('Collection')
  await expect(page.locator('.tabbar')).toContainText('Options')
  await expect(page.locator('.large-title')).toHaveText('Settings')
})

test('backup merges remote changes and keeps deletions', async ({ context, page }) => {
  const repo: FakeRepo = { file: null, sha: null, commits: [] }
  await mockGithub(context, repo)
  await setupBackup(page)
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив', exact: true }).click()
  await page.locator('.rating-picker button', { hasText: /^6$/ }).click()
  await closeSheet(page)
  await goTo(page, 'Опції')
  await page.getByRole('button', { name: 'Зробити бекап зараз' }).click()
  await expect.poll(() => repo.commits.length).toBe(1)

  // Another device adds movie 99; this device must not overwrite it.
  const remote = JSON.parse(repo.file!)
  const now = new Date().toISOString()
  remote.movies.push({ ...remote.movies[0], tmdbId: 99, titleUk: 'Інший пристрій', posterPath: '' })
  remote.entries.push({ tmdbId: 99, status: 'watchlist', addedAt: now, updatedAt: now })
  repo.file = JSON.stringify(remote)
  repo.sha = 'other-device'

  await page.getByRole('button', { name: 'Зробити бекап зараз' }).click()
  await expect.poll(() => repo.commits.length).toBe(2)
  const merged = JSON.parse(repo.file!)
  expect(merged.entries.map((e: { tmdbId: number }) => e.tmdbId).sort()).toEqual([1, 99])
  expect(merged).not.toHaveProperty('token')
  expect(repo.file).not.toContain('github_pat')

  // Deleting here must win over the older copy still in the remote file.
  await goTo(page, 'Колекція')
  await page.getByRole('button', { name: 'Фільм 1', exact: true }).click()
  await page.getByRole('button', { name: 'Видалити з колекції' }).click()
  await page.locator('.remove-confirm .destructive').click()
  await goTo(page, 'Опції')
  await page.getByRole('button', { name: 'Зробити бекап зараз' }).click()
  await expect.poll(() => repo.commits.length).toBe(3)
  const afterDelete = JSON.parse(repo.file!)
  expect(afterDelete.entries.map((e: { tmdbId: number }) => e.tmdbId)).toEqual([99])
  expect(afterDelete.deleted.map((d: { tmdbId: number }) => d.tmdbId)).toEqual([1])
})
