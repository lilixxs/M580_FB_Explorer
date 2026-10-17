import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'

// Capture the built application with bundled demo data, not local user files.
const server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { stdio: 'pipe' })
let browser
try {
  await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Production test:')) resolve() })
    server.once('error', reject)
    server.once('exit', code => reject(new Error(`Screenshot server exited: ${code}`)))
    server.stderr.on('data', chunk => reject(new Error(chunk.toString())))
  })
  await mkdir('docs/images', { recursive: true })
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined })
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:5191/explorer/')
  await page.getByRole('button', { name: '示例功能块 .xdb', exact: true }).click()
  await page.locator('.monaco-editor').waitFor()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'docs/images/workspace.png' })
  await page.locator('.var-row').filter({ hasText: 'xStart' }).getByTitle('修改变量').click()
  await page.locator('#var-name').waitFor({ state: 'visible' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/images/variable-editor.png' })
  await page.getByTestId('open-type-picker').click()
  await page.getByTestId('type-picker').waitFor()
  await page.screenshot({ path: 'docs/images/type-picker.png' })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '函数/功能块调用', exact: true }).click()
  await page.getByTestId('function-call-dialog').waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'docs/images/call-browser.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '帮助', exact: true }).click()
  await page.locator('.t-drawer--open').waitFor()
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: 'docs/images/help.png' })
  console.log('Saved docs/images/{workspace,variable-editor,type-picker,call-browser,help}.png')
} finally {
  await browser?.close()
  server.kill()
}
