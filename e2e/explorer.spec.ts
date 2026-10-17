import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'

const realXdb = resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb')

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.waitForLoadState('networkidle')
})

test('real file import → variable CRUD → editor save → xdb download', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.locator('input[type=file]').setInputFiles(realXdb)
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('[data-pin-id]')).toHaveCount(21)
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await page.locator('#var-name').fill('testInput')
  await page.locator('#var-init').fill('TRUE')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('[data-pin-id]')).toHaveCount(22)
  const variable = page.locator('.var-row').filter({ hasText: 'testInput' })
  await variable.getByTitle('修改变量').click()
  await page.locator('#var-comment').fill('浏览器回归变量')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(variable).toContainText('浏览器回归变量')

  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nRegression_Call();')
  await page.keyboard.press('Control+s')
  await expect(page.locator('.call-name').filter({ hasText: 'Regression_Call' })).toHaveCount(1)
  // Saving ST must not reset variables to the original XML.
  await expect(variable).toHaveCount(1)
  await expect(page.locator('[data-pin-id]')).toHaveCount(22)

  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 .xdb', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('ModbusTCP_Client.xdb')
  await download.saveAs('artifacts/browser-export.xdb')
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const xml = readFileSync(path!, 'utf8')
  expect(xml).not.toMatch(/<[^>]+\/>/)
  const valid = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const variable = Array.from(doc.querySelectorAll('variables')).find(v => v.getAttribute('name') === 'testInput')
    return !doc.querySelector('parsererror') && variable?.querySelector('variableInit')?.getAttribute('value') === 'TRUE' && doc.querySelector('STSource')?.textContent?.includes('Regression_Call()')
  }, xml)
  expect(valid).toBe(true)
  await variable.getByTitle('删除变量').click()
  await variable.getByRole('button', { name: '确认' }).click()
  await expect(page.locator('[data-pin-id]')).toHaveCount(21)
  expect(errors).toEqual([])
})

test('resizable layout, call navigation, search and help drawer', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const main = page.locator('.workspace > .split')
  const pane = main.locator(':scope > .split-pane').first()
  const dimensions = await main.boundingBox()
  const before = await pane.boundingBox()
  expect(before!.width / dimensions!.width).toBeCloseTo(0.34, 2)
  const right = main.locator(':scope > .split-pane').last().locator(':scope > .split')
  const rightBox = (await right.boundingBox())!
  const topBox = (await right.locator(':scope > .split-pane').first().boundingBox())!
  expect(topBox.height / rightBox.height).toBeCloseTo(1 / 3, 2)
  const separator = main.locator(':scope > [role=separator]')
  const bar = (await separator.boundingBox())!
  await page.mouse.move(bar.x + 2, bar.y + 30)
  await page.mouse.down()
  await page.mouse.move(bar.x + 100, bar.y + 30)
  await page.mouse.up()
  expect((await pane.boundingBox())!.width).toBeGreaterThan(before!.width + 50)
  // All three horizontal handles adjust the top pane of their own split.
  for (const handle of await page.locator('.workspace [aria-orientation=horizontal]').all()) {
    const value = Number(await handle.getAttribute('aria-valuenow'))
    await handle.focus()
    await handle.press('ArrowDown')
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(value + 2)
  }

  const firstCall = page.locator('.call-row').first()
  await firstCall.click()
  await expect(page.locator('.editor-head')).toContainText('行 2')
  await page.getByPlaceholder('搜索名称 / 类型 / 地址 / 注释').fill('xStart')
  await expect(page.locator('.var-row')).toHaveCount(1)
  await page.getByPlaceholder('搜索名称 / 类型 / 地址 / 注释').fill('')
  await page.getByRole('button', { name: '全折叠', exact: true }).click()
  await expect(page.locator('.var-row')).toHaveCount(0)
  await page.getByRole('button', { name: '全展开', exact: true }).click()
  await expect(page.locator('.var-row')).toHaveCount(10)
  await page.getByRole('button', { name: '帮助', exact: true }).click()
  await expect(page.locator('.t-drawer--open')).toBeVisible()
  await expect(page.locator('.t-drawer--open')).toContainText('m580_fb_insert_snippet')
})

test('Monaco context actions, completion, formatting, search and replace', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  const input = page.locator('.monaco-editor textarea')
  await expect(input).toBeAttached()
  await input.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('REA')
  await page.keyboard.press('Control+Space')
  await expect(page.locator('.suggest-widget')).toBeVisible()
  await expect(page.locator('.suggest-widget')).toContainText('READ_VAR')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+z')
  await page.getByPlaceholder('查找', { exact: true }).fill('xStop')
  await expect(page.locator('.match-info')).not.toContainText('0/0')
  await page.getByPlaceholder('替换为', { exact: true }).fill('xStopChanged')
  await page.getByRole('button', { name: '全部替换', exact: true }).click()
  await page.getByRole('button', { name: 'IF', exact: true }).click()
  await page.getByRole('button', { name: '格式化', exact: true }).click()
  await page.locator('.monaco-editor .view-lines').click({ button: 'right', position: { x: 200, y: 50 } })
  await expect(page.locator('.context-view.monaco-menu-container')).toContainText('WHILE')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存并重新解析', exact: true }).click()
})

test('non-ST fallback is read-only, MCP and mobile stay usable', async ({ page }) => {
  await page.getByRole('button', { name: '示例程序段 .xst', exact: true }).click()
  await page.getByRole('button', { name: /XML Demo_Interlocks/ }).click()
  await expect(page.locator('.editor-note')).toContainText('只读')
  await expect(page.getByRole('button', { name: '格式化', exact: true })).toBeDisabled()
  const result = await page.evaluate(async () => {
    const bridge = window.__M580_MCP_BRIDGE__!
    return {
      metadata: await bridge.callTool('m580_fb_get_metadata'),
      rejected: await bridge.callTool('m580_fb_set_source', { source: 'Cannot edit XML' })
    }
  })
  expect(result.metadata.ok).toBe(true)
  expect(result.rejected.ok).toBe(false)
  await page.setViewportSize({ width: 360, height: 844 })
  await page.getByRole('button', { name: '帮助', exact: true }).click()
  await expect(page.locator('.t-drawer--open')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360)
})

test('production assets, workers and square theme load without remote dependencies', async ({ page }) => {
  const errors: string[] = []
  const remote: string[] = []
  const failed: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => failed.push(request.url()))
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`) })
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5191') && !request.url().startsWith('data:')) remote.push(request.url()) })
  await page.reload()
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.waitForLoadState('networkidle')
  const styles = await page.locator('.app').evaluate(element => ({
    background: getComputedStyle(element).backgroundColor,
    radius: Array.from(document.querySelectorAll('button,input,.panel')).every(el => getComputedStyle(el).borderRadius === '0px')
  }))
  expect(styles.background).toBe('rgb(250, 249, 245)')
  expect(styles.radius).toBe(true)
  expect(remote).toEqual([])
  expect(failed).toEqual([])
  expect(errors).toEqual([])
  await page.screenshot({ path: 'artifacts/explorer-desktop.png' })
})

test('GLOBAL conversion warnings are visible to the user, not just counted', async ({ page }) => {
  await page.getByRole('button', { name: '示例程序段 .xst', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 .xdb', exact: true }).click()
  await download
  await expect(page.locator('.t-drawer--open')).toContainText('GLOBAL')
  await expect(page.locator('.t-drawer--open')).toContainText('PRIVATE')
})

test('replacing ST with a non-ST section with the same id resets editor permissions', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({
    name: 'only-xml.xdb', mimeType: 'application/xml',
    buffer: Buffer.from('<FBExchangeFile><FBSource nameOfFBType="OnlyXml"><FBProgram name="OnlyXml"><FBDSource><network></network></FBDSource></FBProgram></FBSource></FBExchangeFile>')
  })
  await expect(page.locator('.editor-note')).toContainText('只读')
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.type('MUST_NOT_INSERT')
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('MUST_NOT_INSERT')
})
