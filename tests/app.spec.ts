import { expect, test } from '@playwright/test'
import { mockGithub, mockTmdb, search, setTmdbToken, setupBackup, type FakeRepo } from './mocks'

test.beforeEach(async ({ context, page }) => {
  await mockTmdb(context)
  await page.goto('./')
  await setTmdbToken(page)
})

test('search waits for 2 characters and pages through results', async ({ page }) => {
  await page.locator('.tab').first().click()
  await page.fill('input[type=search]', 'a')
  await expect(page.getByText('Введи хоча б 2 символи')).toBeVisible()
  await search(page, 'ab')
  await expect(page.locator('.result')).toHaveCount(20)
  await page.getByRole('button', { name: 'Наступна сторінка' }).click()
  await expect(page.locator('.result').first()).toContainText('Фільм 21')
  await expect(page.locator('.pagination [aria-current="page"]')).toHaveText('2')
})

test('rating collapses to a summary and can be cleared', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив' }).click()
  await page.locator('.rating-picker button', { hasText: /^8$/ }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.entry-summary')).toContainText('8')
  await page.getByRole('button', { name: 'Змінити' }).click()
  await page.locator('.rating-picker button.active').click()
  await expect(page.locator('.rating-picker button.active')).toHaveCount(0)
})

test('shows the best trailer at the bottom of the card', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  const frame = page.locator('.trailer iframe')
  await expect(frame).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/trailer1/)
})

test('removing a movie offers undo', async ({ page }) => {
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив' }).click()
  await page.locator('.rating-picker button', { hasText: /^7$/ }).click()
  await page.getByRole('button', { name: 'Видалити з колекції' }).click()
  await page.locator('.remove-confirm .destructive').click()
  await page.locator('.toast button').click()
  await page.locator('.tab').nth(1).click()
  await expect(page.locator('.poster-tile')).toHaveCount(1)
})

test('watchlist: mark watched with a rating and remove', async ({ page }) => {
  for (const n of [1, 2]) {
    await search(page, 'film')
    await page
      .locator('.result')
      .nth(n - 1)
      .click()
    await page.getByRole('button', { name: 'Хочу подивитись' }).click()
    await page.getByRole('button', { name: 'Закрити' }).click()
  }
  await page.locator('.tab').nth(2).click()
  await expect(page.locator('.watch-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Бачив' }).first().click()
  await page.locator('.rating-picker button', { hasText: /^9$/ }).click()
  await expect(page.locator('.watch-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Прибрати зі списку' }).click()
  await expect(page.locator('.watch-row')).toHaveCount(0)
})

test('backup merges remote changes and keeps deletions', async ({ context, page }) => {
  const repo: FakeRepo = { file: null, sha: null, commits: [] }
  await mockGithub(context, repo)
  await setupBackup(page)
  await search(page, 'film')
  await page.locator('.result').first().click()
  await page.getByRole('button', { name: 'Бачив' }).click()
  await page.locator('.rating-picker button', { hasText: /^6$/ }).click()
  await page.getByRole('button', { name: 'Закрити' }).click()
  await page.locator('.tab').last().click()
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

  // Deleting here must win over the older copy still in the remote file.
  await page.locator('.tab').nth(1).click()
  await page.locator('.poster-tile', { hasText: 'Фільм 1' }).click()
  await page.getByRole('button', { name: 'Видалити з колекції' }).click()
  await page.locator('.remove-confirm .destructive').click()
  await page.locator('.tab').last().click()
  await page.getByRole('button', { name: 'Зробити бекап зараз' }).click()
  await expect.poll(() => repo.commits.length).toBe(3)
  const afterDelete = JSON.parse(repo.file!)
  expect(afterDelete.entries.map((e: { tmdbId: number }) => e.tmdbId)).toEqual([99])
  expect(afterDelete.deleted.map((d: { tmdbId: number }) => d.tmdbId)).toEqual([1])
  expect(repo.file).not.toContain('github_pat')
})
