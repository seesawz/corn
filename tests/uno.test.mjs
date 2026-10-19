import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createGenerator } from 'unocss'
import config from '../uno.config.ts'

const uno = await createGenerator(config)

test('全部组件 shortcuts 的工具类均可生成，避免迁移后静默丢失样式', async () => {
  const tokens = new Set(Object.values(config.shortcuts).flatMap(value => value.split(/\s+/)))
  const { matched } = await uno.generate([...tokens].join(' '), { preflights: false, safelist: false })
  assert.deepEqual([...tokens].filter(token => !matched.has(token)), [])
})

test('主题、触屏操作入口和移动端布局生成对应规则', async () => {
  const { css } = await uno.generate('app sidebar task-action icon-sun icon-moon')
  assert.ok(css.includes(':root[data-theme="dark"]'))
  assert.ok(css.includes('@media (max-width:720px)'))
  assert.ok(css.includes('@media (hover:none)'))
  assert.ok(css.includes('prefers-reduced-motion'))
  assert.ok(css.includes('color:var(--text-3)'))
})

test('启动页样式也由 UnoCSS 生成，不依赖内联 style', async () => {
  const source = await readFile(new URL('../app/spa-loading-template.html', import.meta.url), 'utf8')
  const { css } = await uno.generate('')
  assert.ok(!source.includes('<style'))
  assert.ok(css.includes('.startup-screen'))
  assert.ok(css.includes('prefers-reduced-motion'))
})


test('组件 shortcut 本身能生成，避免与 UnoCSS 内置变体前缀冲突', async () => {
  for (const name of Object.keys(config.shortcuts)) {
    const { css, matched } = await uno.generate(name, { preflights: false, safelist: false })
    assert.ok(matched.has(name), name)
    assert.ok(css.includes('/* layer: shortcuts */'), name)
  }
})
