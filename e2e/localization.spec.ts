import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const languages = ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']
const helpImages = ['workspace', 'new-block', 'variable-editor', 'type-picker', 'call-browser']
const messages = (language: string) => JSON.parse(readFileSync(resolve(`src/locales/app.${language}.json`), 'utf8'))

for (const language of languages) {
  test(`${language}: language, new block, draft confirmation and help images`, async ({ page, request }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.text().includes('[intlify]')) errors.push(message.text())
    })
    await page.goto('./')
    await page.getByTestId('language-select').selectOption(language)
    await expect(page.locator('html')).toHaveAttribute('lang', language)
    const text = messages(language)
    await expect(page.getByTestId('new-block')).toHaveText(text.newBlock.title)
    await page.reload()
    await expect(page.getByTestId('language-select')).toHaveValue(language)
    await page.getByTestId('new-block').click()
    const dialog = page.getByTestId('new-block-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel(text.newBlock.name, { exact: true }).fill('RoundTrip_FB')
    await dialog.getByLabel(text.newBlock.comment, { exact: true }).fill('User comment 中文 日本語 한국어')
    await dialog.getByRole('button', { name: text.newBlock.create, exact: true }).click()
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await expect(page.locator('.var-row')).toHaveCount(0)
    await expect(page.locator('.section-row')).toHaveCount(1)
    await expect(page.locator('.panel-head').first().getByRole('button')).toHaveCount(0)

    const name = page.getByRole('textbox', { name: text.tree.nameLabel, exact: true })
    await name.fill('Cancelled_FB')
    await page.getByTestId('cancel-metadata').click()
    await expect(name).toHaveValue('RoundTrip_FB')
    await name.fill('Renamed_FB')
    await page.getByTestId('confirm-metadata').click()
    await expect(page.locator('.fb-name')).toHaveText('Renamed_FB')

    // Export is XML-checked in the actual browser, not inferred from a screenshot.
    const downloaded = page.waitForEvent('download')
    await page.getByTestId('export-file').click()
    const download = await downloaded
    expect(download.suggestedFilename()).toBe('Renamed_FB.xdb')
    const xml = readFileSync((await download.path())!, 'utf8')
    expect(xml).not.toMatch(/<[^>]+\/>/)
    expect(await page.evaluate(source => {
      const doc = new DOMParser().parseFromString(source, 'application/xml')
      return !doc.querySelector('parsererror') && doc.querySelector('FBSource')?.getAttribute('nameOfFBType') === 'Renamed_FB'
        && doc.querySelector('FBSource > comment')?.textContent === 'User comment 中文 日本語 한국어'
        && doc.querySelectorAll('FBProgram').length === 1
    }, xml)).toBe(true)
    await page.keyboard.press('Escape')

    await page.getByTestId('open-help').click()
    const help = page.locator('.markdown')
    // 帮助渲染当前语言的 README，并只加载本语言的五张截图。
    for (const image of helpImages) {
      const screenshot = help.locator(`img[src*="images/${language}/${image}.png"]`)
      await expect(screenshot).toHaveCount(1)
      expect((await request.get((await screenshot.getAttribute('src'))!)).ok()).toBe(true)
    }
    const sources = await help.locator('img').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') ?? ''))
    expect(sources).toHaveLength(helpImages.length)
    for (const source of sources) expect(source).toMatch(/docs\/images\/(?:zh-CN|en|zh-TW|ja|ko)\/[a-z0-9-]+\.png$/)
    expect(errors).toEqual([])
  })
}

test('README language links switch the interface language and keep the edited document', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('demo-0').click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_set_source', { source: '(* keep me *)' }))
  const source = async () => {
    const result = await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_get_source', {}))
    return (result.result as { source: string }).source
  }
  expect(await source()).toBe('(* keep me *)')

  await page.getByTestId('open-help').click()
  const help = page.locator('.markdown')
  await expect(help.locator('img[src*="images/zh-CN/"]').first()).toBeVisible()
  await help.locator('[data-help-language="en"]').click()

  // 链接切换语言并换成英文 README，不打开 Markdown 文件。
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(help.locator('img[src*="images/en/"]').first()).toBeVisible()
  await expect(help.locator('[data-help-language="zh-CN"]')).toBeVisible()
  await expect(page).toHaveURL(/\/explorer\/$/)

  // 文档、源码和「有修改」标记保持不变。
  expect(await source()).toBe('(* keep me *)')
  await expect(page.locator('.doc-meta')).toContainText(messages('en').dirty)
  await expect(page.getByTestId('language-select')).toHaveValue('en')
})

test('switching languages preserves an edited Monaco model and the undo stack', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('demo-0').click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nLocale_Keep();')
  for (const language of ['en', 'zh-TW', 'ja', 'ko', 'zh-CN']) {
    await page.getByTestId('language-select').selectOption(language)
    await expect.poll(async () => {
      const result = await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_get_source', {}))
      return (result.result as { source: string }).source
    }).toContain('Locale_Keep();')
    await expect(page.locator('.doc-meta')).toContainText(messages(language).dirty)
  }
  await page.locator('.monaco-editor textarea').focus()
  await page.keyboard.press('Control+z')
  await expect.poll(async () => {
    const result = await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_get_source', {}))
    return (result.result as { source: string }).source
  }).not.toContain('Locale_Keep();')
})

test('new-block cancellation and replacement refusal preserve the current document', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('demo-0').click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_set_source', { source: '(* keep me *)' }))
  await page.getByTestId('new-block').click()
  let dialog = page.getByTestId('new-block-dialog')
  await dialog.getByLabel('功能块名称', { exact: true }).fill('Cancelled_FB')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const source = async () => {
    const result = await page.evaluate(() => window.__M580_MCP_BRIDGE__!.callTool('m580_fb_get_source', {}))
    return (result.result as { source: string }).source
  }
  expect(await source()).toBe('(* keep me *)')
  await page.getByTestId('new-block').click()
  dialog = page.getByTestId('new-block-dialog')
  await dialog.getByLabel('功能块名称', { exact: true }).fill('Bad-Name')
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(dialog.locator('.error')).toBeVisible()
  expect(await source()).toBe('(* keep me *)')
  await dialog.getByLabel('功能块名称', { exact: true }).fill('Accepted_FB')
  const refused = page.waitForEvent('dialog').then(async prompt => { await prompt.dismiss() })
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await refused
  await expect(dialog).toBeVisible()
  expect(await source()).toBe('(* keep me *)')
  page.once('dialog', async prompt => { await prompt.accept() })
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.fb-name')).toHaveText('Accepted_FB')
  expect((await source()).trim()).toBe('')
})

test('translated header and new-block dialog remain within a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('./')
  for (const language of languages) {
    await page.getByTestId('language-select').selectOption(language)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByTestId('new-block').click()
    const dialog = page.getByTestId('new-block-dialog')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(360)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
})
