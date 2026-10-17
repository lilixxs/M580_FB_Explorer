import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'

const realXdb = resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb')

/**
 * Read the active section source through the in-page MCP bridge.
 *
 * Assertions on the whole source are stronger than `.view-lines` text, which only covers the
 * lines Monaco currently renders.
 */
async function readSource(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const bridge = window.__M580_MCP_BRIDGE__!
    const result = await bridge.callTool('m580_fb_get_source', {})
    return (result.result as { source: string }).source
  })
}

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

test('type picker fills elementary and ARRAY types and reports invalid bounds', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await page.locator('#var-name').fill('iTypePick')
  await page.getByTestId('open-type-picker').click()
  await expect(page.getByTestId('type-picker')).toBeVisible()
  await page.locator('[data-type="INT"]').click()
  await expect(page.locator('#var-type')).toHaveValue('INT')
  await page.getByRole('button', { name: '保存', exact: true }).click()

  const row = page.locator('.var-row').filter({ hasText: 'iTypePick' })
  await expect(row.locator('.var-type')).toContainText('INT')
  await row.getByTitle('修改变量').click()
  await page.getByTestId('open-type-picker').click()
  await page.getByTestId('type-mode-array').click()
  await page.getByTestId('array-element').selectOption('DINT')
  await page.getByTestId('array-upper').fill('19')
  await page.getByTestId('apply-array').click()
  await expect(page.locator('#var-type')).toHaveValue('ARRAY[0..19] OF DINT')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(row.locator('.var-type')).toContainText('ARRAY[0..19] OF DINT')

  await row.getByTitle('修改变量').click()
  await page.getByTestId('open-type-picker').click()
  await expect(page.getByTestId('array-lower')).toHaveValue('0')
  await expect(page.getByTestId('array-upper')).toHaveValue('19')
  await page.getByTestId('array-lower').fill('9')
  await page.getByTestId('array-upper').fill('0')
  await expect(page.getByTestId('array-error')).toContainText('下界不能大于上界')
  await expect(page.getByTestId('apply-array')).toBeDisabled()
  await page.getByTestId('type-picker-close').click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(row.locator('.var-type')).toContainText('ARRAY[0..19] OF DINT')
})

test('function call dialog inserts library, sub and custom calls at the cursor', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\n')

  const openCallBrowser = page.getByRole('button', { name: '函数/功能块调用', exact: true })
  await openCallBrowser.click()
  await expect(page.getByTestId('function-call-dialog')).toBeVisible()
  await expect(page.locator('[data-category]')).toHaveCount(5)
  await page.locator('[data-entry-label="READ_VAR"] .lib-insert').click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('READ_VAR(ADR := stAddr')

  await openCallBrowser.click()
  await page.locator('[data-category="sub"]').click()
  await page.locator('[data-entry-label="LGF_DemoMotor"] .lib-insert').click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('LGF_DemoMotor()')

  await openCallBrowser.click()
  await page.locator('[data-category="custom"]').click()
  await page.getByTestId('custom-call-name').fill('fbMotor')
  await page.getByTestId('custom-call-params').fill('xStart := xStartCmd')
  await page.getByTestId('insert-custom-call').click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('fbMotor(xStart := xStartCmd)')

  await openCallBrowser.click()
  await page.locator('[data-category="efb"]').click()
  // An EFB must never insert a bare type-name call: it opens the instance panel instead.
  await page.locator('[data-entry-label="TON"] .lib-insert').click()
  await expect(page.getByTestId('efb-panel')).toBeVisible()
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('TON(IN := ')

  // The demo function block already declares `tonRun : TON`, so it is offered as the instance.
  await page.getByTestId('efb-instance').selectOption({ label: 'tonRun' })
  await page.getByTestId('insert-efb-call').click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(/tonRun\([^()]*\);/)
  await expect(page.locator('.status-text')).toContainText('输出请按该功能块的声明读取')
  expect(await readSource(page)).not.toContain(';;')

  // Inserting right before the existing terminator must reuse it instead of writing `;;`.
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('ArrowLeft')
  await openCallBrowser.click()
  await page.locator('[data-category="efb"]').click()
  await page.locator('[data-entry-label="TON"] .lib-insert').click()
  await page.getByTestId('insert-efb-call').click()
  const withSecondInstanceCall = await readSource(page)
  expect(withSecondInstanceCall).not.toContain(';;')
  // The original call plus two inserted ones: the third insert reused the terminator.
  expect(withSecondInstanceCall.match(/tonRun\(/g)).toHaveLength(3)
})

test('EFB without an instance creates a PRIVATE variable only on insert', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+End')

  const openCallBrowser = page.getByRole('button', { name: '函数/功能块调用', exact: true })
  await openCallBrowser.click()
  await page.locator('[data-category="efb"]').click()
  await page.locator('[data-entry-label="TOF"] .lib-insert').click()
  await expect(page.getByTestId('efb-no-instance')).toContainText('未声明 TOF')

  await page.getByTestId('efb-new-instance').fill('tofGate')
  // Cancelling (ESC / close) must not create the variable.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('function-call-dialog')).toBeHidden()
  await expect(page.locator('.var-row').filter({ hasText: 'tofGate' })).toHaveCount(0)
  await expect(page.locator('.monaco-editor .view-lines')).not.toContainText('tofGate')

  await openCallBrowser.click()
  await page.locator('[data-category="efb"]').click()
  await page.locator('[data-entry-label="TOF"] .lib-insert').click()
  await page.getByTestId('efb-new-instance').fill('tofGate')
  await page.getByTestId('insert-efb-call').click()
  await expect(page.locator('.monaco-editor .view-lines')).toContainText(/tofGate\([^()]*\);/)
  expect(await readSource(page)).toContain('tofGate')
  await page.getByRole('button', { name: '全展开', exact: true }).click()
  await page.getByPlaceholder('搜索名称 / 类型 / 地址 / 注释').fill('tofGate')
  await expect(page.locator('.var-row')).toHaveCount(1)
  await expect(page.locator('.var-row .var-type')).toContainText('TOF')
  await page.getByPlaceholder('搜索名称 / 类型 / 地址 / 注释').fill('')
})

test('variable references view lists plain uses, highlights and stays put for unused pins', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles(realXdb)
  await expect(page.locator('.monaco-editor')).toBeVisible()

  await page.getByTestId('view-references').click()
  await expect(page.locator('.reference-row').first()).toBeVisible()
  await expect(page.locator('.reference-row .badge').first()).toHaveText(/读|写|调用/)
  // Plain uses that are not calls are visible here: the call list shows `rtExecute(` only.
  await page.getByPlaceholder('按名字过滤变量引用').fill('xExecute')
  await expect(page.locator('.reference-row')).not.toHaveCount(0)
  await page.getByPlaceholder('按名字过滤变量引用').fill('')

  // Selecting a variable row highlights its references and keeps the references view.
  const row = page.locator('.var-row').filter({ hasText: 'rtExecute' })
  await row.click()
  await expect(page.getByTestId('view-references')).toHaveClass(/mini-btn--active/)
  await expect(page.locator('.reference-row.call-row--active')).not.toHaveCount(0)

  // A variable without any use shows the no-reference state and does not jump elsewhere.
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await page.locator('#var-name').fill('xNeverUsedPin')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.locator('.var-row').filter({ hasText: 'xNeverUsedPin' }).click()
  await expect(page.getByTestId('references-empty')).toContainText('xNeverUsedPin')
  await expect(page.locator('.reference-row.call-row--active')).toHaveCount(0)
})

test('unsaved badge clears after save while the page keeps 有修改 until export', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nBadge_Probe();')
  await expect(page.locator('.editor-head .dirty')).toHaveText('● 未保存')
  await expect(page.locator('.doc-meta')).toContainText('有修改')

  await page.keyboard.press('Control+s')
  await expect(page.locator('.editor-head .dirty')).toHaveCount(0)
  await expect(page.locator('.doc-meta')).toContainText('有修改')
})

test('variable rows, call rows and pins share one selection and navigation', async ({ page }) => {
  await page.locator('input[type=file]').setInputFiles(realXdb)
  await expect(page.locator('.monaco-editor')).toBeVisible()

  const callRow = page.locator('.call-row').first()
  await expect(callRow.locator('.badge')).toHaveText('变量')
  await callRow.click()
  await expect(page.locator('.var-row--active')).toContainText('rtExecute')
  await expect(page.locator('.editor-head')).toContainText('行 ')

  await page.locator('.var-row').filter({ hasText: 'rtExecute' }).click()
  await expect(page.locator('.var-row--active')).toContainText('rtExecute')

  await page.locator('[data-pin-id]').first().locator('text').first().click()
  await expect(page.locator('.fb-pin--active')).toHaveCount(1)
  await expect(page.locator('.var-row--active')).toContainText('xConnect')

  // Clicking a variable token in the editor selects it and shows its references, without moving
  // the caret to another line: the panel follows the click.
  await page.getByTestId('view-calls').click()
  await page.locator('.monaco-editor .view-lines').getByText('xExecute', { exact: true }).first().click()
  await expect(page.getByTestId('view-references')).toHaveClass(/mini-btn--active/)
  await expect(page.locator('.var-row--active')).toContainText('xExecute')
  await expect(page.locator('.reference-row.call-row--active')).not.toHaveCount(0)
})

test('stale single-replace cache re-searches instead of rewriting the wrong range', async ({ page }) => {
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const before = await readSource(page)
  expect(before).toContain('iSpeedLimit')

  const editor = page.locator('.monaco-editor textarea')
  await editor.focus()
  await page.getByPlaceholder('查找', { exact: true }).fill('iSpeedLimit')
  await expect(page.locator('.match-info')).not.toContainText('0/0')

  // Edit at the very top: every cached match offset is stale from here on.
  await editor.focus()
  await page.keyboard.press('Control+Home')
  await page.keyboard.type('xProbeMark := 0;\n')
  const afterEdit = await readSource(page)
  expect(afterEdit).toBe(`xProbeMark := 0;\n${before}`)

  await page.getByPlaceholder('替换为', { exact: true }).fill('iSpeedMax')
  // The first click only re-searches; no stale range is rewritten and nothing is lost.
  await page.getByRole('button', { name: '替换', exact: true }).click()
  expect(await readSource(page)).toBe(afterEdit)

  // The second click replaces the freshly located match, and only that match.
  await page.getByRole('button', { name: '替换', exact: true }).click()
  const afterReplace = await readSource(page)
  expect(afterReplace).not.toContain('iSpeedLimit')
  expect(afterReplace).toContain('iSpeedMax')
  expect(afterReplace.startsWith('xProbeMark := 0;\n')).toBe(true)
  expect(afterReplace.length).toBe(afterEdit.length - 2) // iSpeedLimit -> iSpeedMax
})

test('fallback textarea drops stale match offsets before a single replace', async ({ page }) => {
  await page.route('**/assets/editor*.js', (route) => route.abort())
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await expect(page.locator('.editor-note')).toContainText('降级为原生文本框')
  const area = page.locator('textarea.editor-fallback')
  const before = await readSource(page)
  expect(before).toContain('iSpeedLimit')

  await page.getByPlaceholder('查找', { exact: true }).fill('iSpeedLimit')
  await expect(page.locator('.match-info')).not.toContainText('0/0')

  await area.click()
  await area.press('Control+Home')
  await page.keyboard.type('xProbeMark := 0;\n')
  const afterEdit = await readSource(page)
  expect(afterEdit).toBe(`xProbeMark := 0;\n${before}`)
  await expect(area).toHaveValue(afterEdit)

  await page.getByPlaceholder('替换为', { exact: true }).fill('iSpeedMax')
  await page.getByRole('button', { name: '替换', exact: true }).click()
  expect(await readSource(page)).toBe(afterEdit)

  await page.getByRole('button', { name: '替换', exact: true }).click()
  const afterReplace = await readSource(page)
  expect(afterReplace).not.toContain('iSpeedLimit')
  expect(afterReplace).toContain('iSpeedMax')
  expect(afterReplace.startsWith('xProbeMark := 0;\n')).toBe(true)
  expect(afterReplace.length).toBe(afterEdit.length - 2)
})

for (const insertion of ['template', 'call'] as const) {
  test(`fallback ${insertion} insertion invalidates offsets before single replacement`, async ({ page }) => {
    await page.route('**/assets/editor*.js', route => route.abort())
    await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
    const area = page.locator('textarea.editor-fallback')
    await expect(area).toBeVisible()
    const original = 'iTargetMarker := 10;\n'
    await area.fill(original)
    await page.getByPlaceholder('查找', { exact: true }).fill('iTargetMarker')
    await expect(page.locator('.match-info')).not.toContainText('0/0')
    await page.getByPlaceholder('替换为', { exact: true }).fill('iTargetReplaced')
    await area.evaluate((element: HTMLTextAreaElement) => {
      element.focus()
      element.setSelectionRange(0, 0)
    })

    if (insertion === 'template') {
      await page.getByRole('button', { name: 'IF', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '函数/功能块调用', exact: true }).click()
      await page.getByTestId('function-call-dialog').locator('[data-entry-label="ABS"] .lib-insert').click()
    }
    const afterInsert = await readSource(page)
    expect(afterInsert).not.toBe(original)
    expect(afterInsert.endsWith(original)).toBe(true)
    await expect(area).toHaveValue(afterInsert)

    await page.getByRole('button', { name: '替换', exact: true }).click()
    expect(await readSource(page)).toBe(afterInsert)
    await page.getByRole('button', { name: '替换', exact: true }).click()
    expect(await readSource(page)).toBe(afterInsert.replace('iTargetMarker', 'iTargetReplaced'))
  })
}

test('write toolbar is disabled while the editor is still loading', async ({ page }) => {
  await page.route('**/assets/editor*.js', async (route) => {
    await new Promise((done) => setTimeout(done, 1500))
    await route.continue()
  })
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()

  // No write target exists yet: every write action must be disabled, not silently append.
  await expect(page.locator('.editor-note')).toContainText('正在加载编辑器')
  await expect(page.getByRole('button', { name: '函数/功能块调用', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'IF', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'FOR', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '格式化', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '替换', exact: true })).toBeDisabled()

  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.getByRole('button', { name: '函数/功能块调用', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'IF', exact: true })).toBeEnabled()
})

test('a jump issued while Monaco is loading lands in the fallback textarea', async ({ page }) => {
  await page.route('**/assets/editor*.js', async (route) => {
    await new Promise((done) => setTimeout(done, 1200))
    await route.abort()
  })
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()

  // The jump arrives while the editor is still loading: the fallback path must still apply it.
  const jumped = await page.evaluate(async () => {
    const bridge = window.__M580_MCP_BRIDGE__!
    return bridge.callTool('m580_jump', { line: 2, column: 1 })
  })
  expect(jumped.ok).toBe(true)

  await expect(page.locator('.editor-note')).toContainText('降级为原生文本框')
  const expectedOffset = await page.evaluate(async () => {
    const bridge = window.__M580_MCP_BRIDGE__!
    const result = await bridge.callTool('m580_fb_get_source', {})
    const lines = (result.result as { source: string }).source.split('\n')
    return lines[0].length + 1
  })
  const selectionStart = await page
    .locator('textarea.editor-fallback')
    .evaluate((element) => (element as HTMLTextAreaElement).selectionStart)
  expect(selectionStart).toBe(expectedOffset)
})
