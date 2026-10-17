import { createApp, nextTick, type App, type Component } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import TreePanel from '../src/components/TreePanel.vue'
import NewBlockDialog from '../src/components/NewBlockDialog.vue'
import {
  commitMetaDraft,
  createNewBlockDocument,
  discardMetaDraft,
  hasPendingMetaDraft,
  hasUnexportedChanges,
  loadExchangeXml,
  metaDraft,
  resetMetaDraft,
  saveActiveSection,
  setActiveSource
} from '../src/actions'
import { buildEmptyXdbXml, createEmptyDocument, validateBlockName } from '../src/core/newDocument'
import { buildXdb } from '../src/core/exportXdb'
import { parseExchange } from '../src/core/parseExchange'
import { directChildren, firstDirectChild, parseXml } from '../src/core/xml'
import { state } from '../src/store'

const MODBUS_XDB = readFileSync(resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb'), 'utf8')

/** Any self closing tag; Unity Pro XL V13.1 rejects them. */
const SELF_CLOSING = /<[^>]+\/>/

const NEW_BLOCK = { fbName: 'LGF_NewBlock', comment: '空功能块', now: new Date(2026, 9, 18, 9, 30, 0) }

let app: App | undefined
let host: HTMLDivElement

function mountComponent(component: Component, props: Record<string, unknown> = {}): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component, props)
  app.mount(host)
}

/** Elements created by a TDialog live on `document.body`, not inside the host element. */
function testElement<T extends Element = HTMLElement>(testId: string): T {
  const element = document.body.querySelector<T>(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`未找到 data-testid=${testId}`)
  return element
}

function typeInto(element: HTMLInputElement, value: string): void {
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function loadFixture(): void {
  expect(loadExchangeXml(MODBUS_XDB, 'ModbusTCP_Client.xdb')).toBe(true)
}

beforeEach(() => {
  localStorage.clear()
  state.doc = null
  state.dirty = false
  state.dirtySections = {}
  state.activeSectionId = ''
  state.selectedVariableId = ''
  state.status = null
  resetMetaDraft()
})

afterEach(() => {
  app?.unmount()
  host?.remove()
  app = undefined
})

describe('new function block name validation', () => {
  it('accepts IEC identifiers and rejects empty, malformed and reserved names', () => {
    expect(validateBlockName('LGF_NewBlock')).toBe(null)
    expect(validateBlockName('_x1')).toBe(null)

    // Assertions stay locale robust: only the reserved identifier itself must appear literally.
    expect(validateBlockName('   ')).not.toBe(null)
    expect(validateBlockName('1Block')).not.toBe(null)
    expect(validateBlockName('Bad Name')).not.toBe(null)
    expect(validateBlockName('EN')).toContain('EN')
    expect(validateBlockName('eno')).toContain('EN')
  })
})

describe('empty .xdb document', () => {
  it('writes the repository exchange header without self closing tags', () => {
    const xml = buildEmptyXdbXml(NEW_BLOCK)

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(xml).toContain('company="Schneider Automation"')
    expect(xml).toContain('product="Unity Pro XL V13.1 - 180823C"')
    expect(xml).toContain('DTDVersion="41"')
    expect(xml).toContain('content="功能块源文件"')
    expect(xml).toContain('nameOfFBType="LGF_NewBlock"')
    expect(xml).toContain('<comment>空功能块</comment>')
    expect(xml).not.toMatch(SELF_CLOSING)
    // The expanded form of an attribute-only node proves the self closing rewrite ran.
    expect(xml).toContain('<attribute name="TypePassword" value=""></attribute>')
  })

  it('keeps exactly one empty ST section and no VAR declaration block', () => {
    const xml = buildEmptyXdbXml(NEW_BLOCK)
    const parsed = parseExchange(xml, 'LGF_NewBlock.xdb')
    const root = parseXml(xml).documentElement
    const programs = directChildren(firstDirectChild(root, 'FBSource'), 'FBProgram')

    expect(programs).toHaveLength(1)
    expect(firstDirectChild(programs[0], 'STSource')!.textContent!.trim()).toBe('')
    expect(parsed.sections).toHaveLength(1)
    expect(parsed.sections[0].language).toBe('ST')
    expect(parsed.sections[0].stSource).toBe('')
    expect(parsed.variables).toEqual([])
  })

  it('parses into a document ready for the existing editor and export path', () => {
    const parsed = createEmptyDocument(NEW_BLOCK)

    expect(parsed.kind).toBe('xdb')
    expect(parsed.fileName).toBe('LGF_NewBlock.xdb')
    expect(parsed.rootTag).toBe('FBExchangeFile')
    expect(parsed.fbName).toBe('LGF_NewBlock')
    expect(parsed.comment).toBe('空功能块')
    expect(parsed.sections.map((section) => [section.name, section.language, section.stSource]))
      .toEqual([['LGF_NewBlock', 'ST', '']])
    expect(parsed.variables).toEqual([])
    expect(parsed.warnings).toEqual([])
    // The stored raw XML stays re-parsable, which is what "save triggers a real re-parse" relies on.
    expect(() => parseExchange(parsed.rawXml, parsed.fileName)).not.toThrow()
  })

  it('omits the comment node when the comment is empty or blank', () => {
    const xml = buildEmptyXdbXml({ ...NEW_BLOCK, comment: '   ' })
    expect(xml).not.toContain('<comment>')
    expect(parseExchange(xml, 'Blank.xdb').comment).toBe('')
  })
})

describe('new document action', () => {
  it('installs an empty variable table plus one empty ST section and marks it unexported', () => {
    const before = state.doc
    expect(createNewBlockDocument('LGF_NewBlock', '空功能块')).toBe(null)

    expect(state.doc).not.toBe(before)
    expect(state.doc!.fbName).toBe('LGF_NewBlock')
    expect(state.doc!.comment).toBe('空功能块')
    expect(state.doc!.variables).toEqual([])
    expect(state.doc!.sections).toHaveLength(1)
    expect(state.activeSectionId).toBe(state.doc!.sections[0].id)
    expect(state.dirty).toBe(true)
    expect(metaDraft.fbName).toBe('LGF_NewBlock')
    expect(metaDraft.comment).toBe('空功能块')
  })

  it('keeps the current document when the name is rejected', () => {
    loadFixture()
    const before = state.doc

    expect(createNewBlockDocument('EN', '')).toContain('EN')
    expect(createNewBlockDocument('bad name', '')).not.toBe(null)
    expect(state.doc).toBe(before)
    expect(state.doc!.variables.length).toBeGreaterThan(0)
    expect(state.doc!.fbName).toBe(before!.fbName)
  })

  it('saves source edits and exports back to a parsable .xdb', () => {
    expect(createNewBlockDocument('LGF_NewBlock', '')).toBe(null)

    setActiveSource('xRun := TRUE;')
    expect(state.dirtySections[state.activeSectionId]).toBe(true)
    expect(saveActiveSection()).toBe(true)
    expect(state.doc!.sections[0].stSource).toBe('xRun := TRUE;')
    expect(state.doc!.variables).toEqual([])

    const exported = buildXdb(state.doc!, { now: new Date(2026, 9, 18, 10, 0, 0) })
    expect(exported.fileName).toBe('LGF_NewBlock.xdb')
    expect(exported.xml).not.toMatch(SELF_CLOSING)

    const reread = parseExchange(exported.xml, exported.fileName)
    expect(reread.fbName).toBe('LGF_NewBlock')
    expect(reread.variables).toEqual([])
    expect(reread.sections.map((section) => [section.language, section.stSource]))
      .toEqual([['ST', 'xRun := TRUE;']])
  })
})

describe('function block name and comment draft', () => {
  it('edits a copy, writes on confirm and restores on cancel', () => {
    loadFixture()
    const original = { name: state.doc!.fbName, comment: state.doc!.comment }

    metaDraft.fbName = 'LGF_Renamed'
    metaDraft.comment = '新注释'
    // Typing must not touch the document and must not clear the page's dirty flag.
    expect(state.doc!.fbName).toBe(original.name)
    expect(state.doc!.comment).toBe(original.comment)
    // A pending draft is still protected against replacement and unload.
    expect(hasPendingMetaDraft()).toBe(true)
    expect(hasUnexportedChanges()).toBe(true)

    expect(commitMetaDraft()).toBe(null)
    expect(state.doc!.fbName).toBe('LGF_Renamed')
    expect(state.doc!.comment).toBe('新注释')
    expect(state.dirty).toBe(true)
    expect(hasPendingMetaDraft()).toBe(false)
    expect(metaDraft.fbName).toBe('LGF_Renamed')

    metaDraft.fbName = 'LGF_Discarded'
    discardMetaDraft()
    expect(state.doc!.fbName).toBe('LGF_Renamed')
    expect(metaDraft.fbName).toBe('LGF_Renamed')
    expect(hasPendingMetaDraft()).toBe(false)
  })

  it('refuses a reserved name on confirm and keeps the draft for correction', () => {
    loadFixture()
    const before = state.doc!.fbName
    metaDraft.fbName = 'ENO'

    expect(commitMetaDraft()).toContain('EN')
    expect(state.doc!.fbName).toBe(before)
    expect(state.dirty).toBe(false)
    expect(metaDraft.fbName).toBe('ENO')
  })
})

describe('TreePanel draft editing and single top bar entry', () => {
  it('drops the duplicate import and export buttons from the panel head', () => {
    loadFixture()
    mountComponent(TreePanel)
    const head = host.querySelector('.panel-head')!

    expect(Array.from(head.querySelectorAll('button'))).toEqual([])
    expect(head.querySelector('[aria-label="左栏导入文件"]')).toBe(null)
    expect(head.querySelector('[aria-label="左栏导出文件"]')).toBe(null)
    // The panel's draft buttons keep an accessible name of their own, so a page-scoped
    // getByRole('button', { name: '取消' }) in the e2e suite still resolves to a single element.
    expect(testElement('confirm-metadata').getAttribute('aria-label')).toContain('功能块名称')
    expect(testElement('cancel-metadata').getAttribute('aria-label')).toContain('功能块名称')
    expect(host.querySelector('[aria-label="取消"]')).toBe(null)
    // The panel no longer declares the import/export event contract.
    const source = readFileSync(resolve(process.cwd(), 'src/components/TreePanel.vue'), 'utf8')
    expect(source).not.toContain('import-file')
    expect(source).not.toContain('export-file')
  })

  it('confirms and cancels the meta draft from the panel buttons', async () => {
    loadFixture()
    const originalName = state.doc!.fbName
    mountComponent(TreePanel)
    await nextTick()

    const nameInput = testElement<HTMLInputElement>('metadata-name')
    expect(nameInput.value).toBe(originalName)
    expect(testElement('confirm-metadata').hasAttribute('disabled')).toBe(true)

    typeInto(nameInput, 'LGF_FromPanel')
    await nextTick()
    expect(state.doc!.fbName).toBe(originalName)
    // The pending indicator appears; the document stays untouched until 确认.
    expect(testElement('metadata-pending')).not.toBe(null)
    expect(testElement('cancel-metadata')).not.toBe(null)

    testElement('confirm-metadata').click()
    await nextTick()
    expect(state.doc!.fbName).toBe('LGF_FromPanel')

    typeInto(testElement<HTMLInputElement>('metadata-name'), 'LGF_Cancelled')
    await nextTick()
    testElement('cancel-metadata').click()
    await nextTick()
    expect(state.doc!.fbName).toBe('LGF_FromPanel')
    expect(testElement<HTMLInputElement>('metadata-name').value).toBe('LGF_FromPanel')
  })
})

describe('top bar 新建功能块', () => {
  it('validates the name in the dialog before emitting a create request', async () => {
    const submitted: Array<{ name: string; comment: string }> = []
    mountComponent(NewBlockDialog, {
      visible: true,
      onSubmit: (payload: { name: string; comment: string }) => submitted.push(payload)
    })
    await nextTick()

    testElement<HTMLButtonElement>('new-block-submit').click()
    await nextTick()
    expect(testElement('new-block-error').textContent!.trim()).not.toBe('')

    typeInto(testElement<HTMLInputElement>('new-block-name'), 'ENO')
    await nextTick()
    testElement<HTMLButtonElement>('new-block-submit').click()
    await nextTick()
    expect(testElement('new-block-error').textContent).toContain('EN')
    expect(submitted).toEqual([])

    typeInto(testElement<HTMLInputElement>('new-block-name'), 'LGF_FromDialog')
    typeInto(testElement<HTMLInputElement>('new-block-comment'), '对话框创建')
    await nextTick()
    testElement<HTMLButtonElement>('new-block-submit').click()
    await nextTick()
    expect(submitted).toEqual([{ name: 'LGF_FromDialog', comment: '对话框创建' }])
  })

  /**
   * The replace confirm and the unload guard are checked through `hasUnexportedChanges` and through
   * the App.vue wiring instead of by mounting App: mounting it pulls in every panel of the
   * workspace, so this file would fail whenever an unrelated panel is mid-refactor. The click path
   * itself belongs to the Playwright suite.
   */
  it('counts a pending draft as an unexported change for the replace and unload guards', () => {
    loadFixture()
    expect(hasUnexportedChanges()).toBe(false)

    setActiveSource('(* 未导出修改 *)')
    expect(hasUnexportedChanges()).toBe(true)
    state.dirty = false
    expect(hasUnexportedChanges()).toBe(false)

    metaDraft.comment = '未确认注释'
    expect(hasPendingMetaDraft()).toBe(true)
    expect(hasUnexportedChanges()).toBe(true)
    discardMetaDraft()
    expect(hasUnexportedChanges()).toBe(false)

    // A document created in this session has never been exported either.
    createNewBlockDocument('LGF_Created', '')
    expect(hasUnexportedChanges()).toBe(true)
  })

  it('wires the top bar entry and both guards to the shared unexported-changes check', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')

    // Assertions use stable identifiers, not user facing text: these literals move into the
    // language files when this view is localized.
    expect(source).toContain('data-testid="new-block"')
    expect(source).toContain('data-testid="import-file"')
    expect(source).toContain('data-testid="export-file"')
    expect(source).toContain('<NewBlockDialog')
    expect(source).toContain('@submit="onNewBlockSubmit"')
    // One call in confirmReplace, one in beforeUnload: a draft cannot be dropped silently.
    expect(source.match(/hasUnexportedChanges\(\)/g)).toHaveLength(2)
    expect(source).not.toContain('!state.dirty || window.confirm')
    expect(source).not.toContain('if (state.dirty) { event.preventDefault()')
    // The panel receives no import/export listeners any more.
    expect(source).not.toContain('@import-file')
    expect(source).not.toContain('@export-file')
  })
})
