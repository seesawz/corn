import { test, expect } from '@playwright/test'

const account = '11111111-1111-4111-8111-111111111111'
const storageKey = 'sb-auth-test-auth-token'
function session() {
  const expires = Math.floor(Date.now() / 1000) + 3600
  const jwt = [
    { alg: 'HS256', typ: 'JWT' },
    { sub: account, exp: expires, role: 'authenticated' },
  ].map(part => Buffer.from(JSON.stringify(part)).toString('base64url')).join('.') + '.test'
  return { access_token: jwt, refresh_token: 'test-refresh', token_type: 'bearer', expires_at: expires, expires_in: 3600,
    user: { id: account, email: 'user-a@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'github' }, user_metadata: { full_name: '用户 A' }, created_at: new Date().toISOString() } }
}

test('未登录只显示登录页，旧访客数据不泄露，移动端无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => localStorage.setItem('aster.tasks', JSON.stringify([{ text: '访客秘密' }])))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '欢迎来到 corn' })).toBeVisible()
  await expect(page.getByText('访客秘密')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '使用 Google 登录' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

for (const provider of ['github']) {
  test(`${provider} 登录使用 PKCE 和应用子路径回跳`, async ({ page }) => {
    await page.route('https://auth-test.supabase.co/auth/v1/authorize**', route => route.fulfill({ contentType: 'text/html', body: 'OAuth provider' }))
    await page.goto('./')
    await page.getByRole('button', { name: '使用 GitHub 登录' }).click()
    await page.waitForURL('https://auth-test.supabase.co/auth/v1/authorize**')
    const url = new URL(page.url())
    expect(url.searchParams.get('provider')).toBe(provider)
    expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4173/corn/')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
  })
}

test('取消 OAuth 授权后提示可重试并清理错误 URL', async ({ page }) => {
  await page.goto('./?error=access_denied&error_description=cancelled')
  await expect(page.getByRole('alert')).toContainText('授权未完成')
  await expect(page.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled()
  expect(new URL(page.url()).search).toBe('')
})

test('PKCE 回调交换、刷新恢复、任务写入带用户 ID，退出同步到其他标签页', async ({ page, context }) => {
  const data = session()
  const writes: any[] = []
  await context.route('https://auth-test.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/token') {
      expect(url.searchParams.get('grant_type')).toBe('pkce')
      expect(route.request().postDataJSON().auth_code).toBe('test-code')
      return route.fulfill({ json: data })
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname.startsWith('/rest/v1/')) {
      if (route.request().method() === 'GET') {
        expect(url.searchParams.get('user_id')).toBe(`eq.${account}`)
        return route.fulfill({ json: url.pathname.endsWith('tasks') ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner: account, user_id: account, text: 'A 的私人待办', project_id: 'inbox', created_at: new Date().toISOString() }] : [] })
      }
      writes.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: null })
    }
    throw new Error(`Unexpected request: ${route.request().url()}`)
  })
  await page.addInitScript(key => localStorage.setItem(key + '-code-verifier', JSON.stringify('test-verifier')), storageKey)
  await page.goto('./?code=test-code')
  await expect(page.getByText('A 的私人待办', { exact: true })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.reload()
  await expect(page.getByText('A 的私人待办', { exact: true })).toBeVisible()
  const input = page.locator('.composer-input')
  await input.fill('新待办')
  await input.press('Enter')
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0].user_id).toBe(account)
  const otherTab = await context.newPage()
  await otherTab.goto('./')
  await expect(otherTab.getByText('A 的私人待办', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出登录' }).click()
  for (const tab of [page, otherTab]) {
    await expect(tab.getByRole('heading', { name: '欢迎来到 corn' })).toBeVisible()
    await expect(tab.getByText('A 的私人待办', { exact: true })).toHaveCount(0)
  }
})

test('当前用户云端失败时只显示自己的缓存，重连后恢复编辑', async ({ page }) => {
  let offline = true
  await page.addInitScript(({ key, data, id }) => {
    localStorage.setItem(key, JSON.stringify(data))
    localStorage.setItem('aster.tasks.user.' + id, JSON.stringify([{ id: 'cached', text: '当前账号缓存' }]))
    localStorage.setItem('aster.tasks.user.other', JSON.stringify([{ text: '其他账号秘密' }]))
  }, { key: storageKey, data: session(), id: account })
  await page.route('https://auth-test.supabase.co/rest/v1/**', route => route.fulfill(offline
    ? { status: 500, json: { message: 'offline' } }
    : { json: [] }))
  await page.goto('./')
  await expect(page.getByRole('alert')).toContainText('编辑已暂停')
  await expect(page.getByText('当前账号缓存', { exact: true })).toBeVisible()
  await expect(page.getByText('其他账号秘密')).toHaveCount(0)
  expect(await page.locator('.composer-input').evaluate(el => !!el.closest('[inert]'))).toBe(true)
  offline = false
  await page.getByRole('button', { name: '重新连接' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.composer-input')).toBeEditable()
})


test('失效的授权码会提示重新登录且不会停留在加载页', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key + '-code-verifier', JSON.stringify('test-verifier')), storageKey)
  await page.route('https://auth-test.supabase.co/auth/v1/token**', route => route.fulfill({ status: 400, json: { code: 'flow_state_expired', message: 'expired code' } }))
  await page.goto('./?code=expired-code')
  await expect(page.getByRole('alert')).toContainText('请重新登录')
  await expect(page.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled()
  expect(new URL(page.url()).search).toBe('')
})

async function guestSnapshot(page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const open = indexedDB.open('aster-todo', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('workspaces', 'readonly')
      const result = tx.objectStore('workspaces').get('guest')
      tx.oncomplete = () => { db.close(); resolve(result.result) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  }))
}

test('访客无需登录：项目和任务写入 IndexedDB，刷新保留，提供默认头像且不请求云端', async ({ page }) => {
  const cloudRequests: string[] = []
  await page.route('https://auth-test.supabase.co/**', route => {
    cloudRequests.push(route.request().url())
    return route.abort()
  })
  await page.goto('./')
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  await expect(page.getByText('访客', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '默认头像' })).toBeVisible()
  await expect(page.locator('.composer-input')).toBeEditable()
  await page.getByRole('button', { name: '新建项目', exact: true }).click()
  await page.getByRole('textbox', { name: '项目名称' }).fill('本地工作')
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  await page.locator('.composer-input').fill('访客任务')
  await page.locator('.composer-input').press('Enter')
  await expect.poll(async () => (await guestSnapshot(page))?.tasks?.[0]?.text).toBe('访客任务')
  expect(await page.evaluate(() => localStorage.getItem('aster.tasks'))).toBeNull()
  await page.reload()
  await expect(page.getByText('访客', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '本地工作' })).toBeVisible()
  await page.getByRole('button', { name: /^本地工作 \d+$/ }).click()
  await expect(page.getByText('访客任务', { exact: true })).toBeVisible()
  expect(cloudRequests).toEqual([])
})

test('访客切换到账号及退出后切回，两个空间互不混合，不自动上传访客数据', async ({ page }) => {
  const writes: string[] = []
  await page.route('https://auth-test.supabase.co/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/token') return route.fulfill({ json: session() })
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (route.request().method() !== 'GET') writes.push(route.request().url())
    return route.fulfill({ json: url.pathname.endsWith('tasks') ? [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner: account, user_id: account, text: '账号专属任务', created_at: new Date().toISOString() }] : [] })
  })
  await page.goto('./')
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  await expect(page.locator('.composer-input')).toBeEditable()
  await page.locator('.composer-input').fill('访客专属任务')
  await page.locator('.composer-input').press('Enter')
  await expect.poll(async () => (await guestSnapshot(page))?.tasks?.[0]?.text).toBe('访客专属任务')
  await page.getByRole('button', { name: '登录账号', exact: true }).click()
  await expect(page.getByRole('heading', { name: '欢迎来到 corn' })).toBeVisible()
  await expect(page.getByText('访客专属任务', { exact: true })).toHaveCount(0)
  await page.evaluate(key => localStorage.setItem(key + '-code-verifier', JSON.stringify('test-verifier')), storageKey)
  await page.goto('./?code=test-code')
  await expect(page.getByText('账号专属任务', { exact: true })).toBeVisible()
  await expect(page.getByText('访客专属任务', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('img', { name: '默认头像' })).toBeVisible()
  expect(writes).toEqual([])
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  await expect(page.getByText('访客专属任务', { exact: true })).toBeVisible()
  await expect(page.getByText('账号专属任务', { exact: true })).toHaveCount(0)
})

test('浏览器阻止 IndexedDB 时提示本地错误，不允许未保存的访客编辑', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: { open() { throw new Error('blocked') } } }))
  await page.goto('./')
  await page.getByRole('button', { name: '暂不登录，本地使用' }).click()
  await expect(page.getByRole('alert')).toContainText('本地数据读写失败')
  expect(await page.locator('.composer-input').evaluate(el => !!el.closest('[inert]'))).toBe(true)
  await expect(page.getByRole('button', { name: '重试本地存储' })).toBeVisible()
})
