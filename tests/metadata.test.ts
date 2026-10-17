import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TreePanel from '../src/components/TreePanel.vue'
import { loadDemoFile } from '../src/actions'
import { state } from '../src/store'
import { setLocale } from '../src/i18n'

let app: App
let host: HTMLDivElement
async function input(label: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function click(id: string) {
  host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click()
  await nextTick()
}
beforeEach(async () => {
  setLocale('zh-CN')
  loadDemoFile(0)
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(TreePanel)
  app.mount(host)
  await nextTick()
})
afterEach(() => { app.unmount(); host.remove(); setLocale('zh-CN') })

describe('metadata draft editing', () => {
  it('does not modify document data until confirmation and cancels both fields', async () => {
    const original = { name: state.doc!.fbName, comment: state.doc!.comment }
    await input('功能块名称', 'Draft_Name')
    await input('功能块注释', 'draft comment')
    expect(state.doc!.fbName).toBe(original.name)
    expect(state.doc!.comment).toBe(original.comment)
    await click('cancel-metadata')
    expect(host.querySelector<HTMLInputElement>('[aria-label="功能块名称"]')!.value).toBe(original.name)
    expect(host.querySelector<HTMLInputElement>('[aria-label="功能块注释"]')!.value).toBe(original.comment)
  })

  it('confirms both fields together and marks the document as unexported', async () => {
    await input('功能块名称', 'Confirmed_Name')
    await input('功能块注释', 'comment 中文 / 日本語 / 한국어')
    await click('confirm-metadata')
    expect(state.doc!.fbName).toBe('Confirmed_Name')
    expect(state.doc!.comment).toBe('comment 中文 / 日本語 / 한국어')
    expect(state.dirty).toBe(true)
  })

  it.each(['Bad-Name', '', 'ENO', 'en', '9name'])('rejects invalid or reserved name %j without partial updates', async name => {
    const original = { name: state.doc!.fbName, comment: state.doc!.comment }
    await input('功能块名称', name)
    await input('功能块注释', 'must not apply')
    await click('confirm-metadata')
    expect(state.doc!.fbName).toBe(original.name)
    expect(state.doc!.comment).toBe(original.comment)
  })

  it('preserves a draft across language changes without applying it', async () => {
    const original = state.doc!.fbName
    await input('功能块名称', 'Pending_Name')
    setLocale('ja')
    await nextTick()
    expect(host.querySelector<HTMLInputElement>('.mono')!.value).toBe('Pending_Name')
    expect(state.doc!.fbName).toBe(original)
  })

  it('does not render duplicate import or export buttons', () => {
    expect(host.querySelector('.panel-head')!.querySelectorAll('button')).toHaveLength(0)
  })
})
