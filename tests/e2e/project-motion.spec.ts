import { test, expect } from '@playwright/test'

test('切换项目时旧任务立即移除，新列表与输入框保持原位', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  for (const text of ['旧任务甲', '旧任务乙', '旧任务丙']) {
    await page.locator('.composer-input').fill(text)
    await page.locator('.composer-input').press('Enter')
  }
  await page.getByRole('button', { name: '新建项目', exact: true }).click()
  await page.getByRole('textbox', { name: '项目名称' }).fill('新项目')
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  await page.locator('.composer-input').fill('新项目任务')
  await page.locator('.composer-input').press('Enter')
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: /^收件箱 3$/ }).click()
  await expect(page.locator('.task-text')).toHaveText(['旧任务丙', '旧任务乙', '旧任务甲'])
  await page.getByRole('button', { name: /^新项目 1$/ }).click()
  const frames = await page.evaluate(async () => {
    const samples: { taskTop: number, inputTop: number, oldTasks: boolean }[] = []
    for (let frame = 0; frame < 18; frame++) {
      await new Promise(requestAnimationFrame)
      samples.push({
        taskTop: document.querySelector('.task')!.getBoundingClientRect().top,
        inputTop: document.querySelector('.task-add-row')!.getBoundingClientRect().top,
        oldTasks: [...document.querySelectorAll('.task-text')].some(el => el.textContent!.startsWith('旧任务')),
      })
    }
    return samples
  })
  expect(frames.every(frame => !frame.oldTasks)).toBe(true)
  for (const key of ['taskTop', 'inputTop'] as const) {
    const values = frames.map(frame => frame[key])
    expect(Math.max(...values) - Math.min(...values)).toBeLessThan(0.5)
  }
  await expect(page.locator('.task-text')).toHaveText(['新项目任务'])
})
