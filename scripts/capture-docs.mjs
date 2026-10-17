import { chromium, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'

// Capture the built application with bundled demo data, not local user files.
// Port 0 gives this script its own free port, so it never collides with another session's host.
const server = spawn(process.execPath, ['scripts/serve-dist.mjs'], {
  stdio: 'pipe',
  env: { ...process.env, PORT: '0' }
})
let browser
try {
  const baseUrl = await new Promise((resolve, reject) => {
    let output = ''
    server.stdout.on('data', chunk => {
      output += chunk.toString()
      const match = output.match(/Production test: (\S+)/)
      if (match) resolve(match[1])
    })
    server.once('error', reject)
    server.once('exit', code => reject(new Error(`Screenshot server exited: ${code}`)))
    server.stderr.on('data', chunk => reject(new Error(chunk.toString())))
  })
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined })
  for (const language of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']) {
    const messages = JSON.parse(await readFile(`src/locales/${language}.json`, 'utf8'))
    const directory = `docs/images/${language}`
    await mkdir(directory, { recursive: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
    await context.addInitScript((value) => localStorage.setItem('m580-locale', value), language)
    const page = await context.newPage()
    const failures = []
    page.on('pageerror', error => failures.push(error.message))
    page.on('response', response => {
      // First capture precedes image publication. The help image references are verified after the final build.
      if (response.status() >= 400 && !response.url().includes('/images/')) failures.push(`${response.status()} ${response.url()}`)
    })
    await page.goto(baseUrl)
    await page.getByTestId('demo-0').click()
    await expect(page.locator('.monaco-editor')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' })
    }
    await capture('workspace')
    await page.locator('.var-row').filter({ hasText: 'xStart' }).getByTitle(messages.variablesPanel.edit, { exact: true }).click()
    await expect(page.locator('#var-name')).toBeVisible()
    await capture('variable-editor')
    await page.getByTestId('open-type-picker').click()
    await expect(page.getByTestId('type-picker')).toBeVisible()
    await capture('type-picker')
    await page.getByRole('button', { name: messages.common.cancel, exact: true }).click()
    await page.getByRole('button', { name: messages.codeEditor.openCallDialog, exact: true }).click()
    await expect(page.getByTestId('function-call-dialog')).toBeVisible()
    await capture('call-browser')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('function-call-dialog')).not.toBeVisible()
    await page.getByTestId('new-block').click()
    await expect(page.getByTestId('new-block-dialog')).toBeVisible()
    await capture('new-block')
    await page.keyboard.press('Escape')
    if (failures.length) throw new Error(`${language}: ${failures.join('\n')}`)
    await context.close()
    console.log(`Saved ${directory}/{workspace,variable-editor,type-picker,call-browser,new-block}.png`)
  }
} finally {
  await browser?.close()
  server.kill()
}
