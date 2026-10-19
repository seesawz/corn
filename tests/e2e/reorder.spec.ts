import { test, expect } from '@playwright/test'

test('拖动任务可上下调整顺序，刷新后保留', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  const input = page.locator('.composer-input')
  for (const text of ['任务甲', '任务乙', '任务丙']) {
    await input.fill(text)
    await input.press('Enter')
  }
  const rows = page.locator('.task')
  const texts = page.locator('.task-text')
  await expect(texts).toHaveText(['任务丙', '任务乙', '任务甲'])
  await rows.nth(2).dragTo(rows.nth(0), { targetPosition: { x: 100, y: 5 } })
  await expect(texts).toHaveText(['任务甲', '任务丙', '任务乙'])
  await expect(page.getByText('仅保存在此浏览器', { exact: true })).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(texts).toHaveText(['任务甲', '任务丙', '任务乙'])
  const bottom = await rows.nth(2).boundingBox()
  await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 100, y: bottom!.height - 5 } })
  await expect(texts).toHaveText(['任务丙', '任务乙', '任务甲'])
  await expect(page.getByText('仅保存在此浏览器', { exact: true })).toHaveAttribute('aria-busy', 'false')
  await page.reload()
  await expect(texts).toHaveText(['任务丙', '任务乙', '任务甲'])
})
