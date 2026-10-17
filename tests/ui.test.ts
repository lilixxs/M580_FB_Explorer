import { createApp, nextTick, type App, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SplitPane from '../src/components/SplitPane.vue'
import VariablesPanel from '../src/components/VariablesPanel.vue'
import CallsPanel from '../src/components/CallsPanel.vue'
import PinDiagram from '../src/components/PinDiagram.vue'
import FunctionCallDialog from '../src/components/FunctionCallDialog.vue'
import { loadExchangeXml, addVariable, deleteVariable, revealVariable } from '../src/actions'
import { state } from '../src/store'
import { emptyVariableInput } from '../src/types'
import { ALL_LIBRARY_ENTRIES, findLibraryEntry, snippetToPlainText, type CallInsertPayload } from '../src/core/functionLibrary'

let app: App | undefined
let host: HTMLDivElement
function mount(component: Component, props = {}) {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(component, props)
  app.mount(host)
}
beforeEach(() => {
  localStorage.clear()
  state.variableSearch = ''
  state.callSearch = ''
  state.collapsed = {}
  loadExchangeXml(readFileSync(resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb'), 'utf8'), 'ModbusTCP_Client.xdb')
})
afterEach(() => { app?.unmount(); host?.remove() })

describe('workspace components', () => {
  it('initializes a 1:2 split and supports accessible keyboard resizing and reset', async () => {
    mount(SplitPane, { direction: 'vertical', defaultSize: 100 / 3 })
    const pane = host.querySelector<HTMLElement>('.split-pane')!
    const separator = host.querySelector<HTMLElement>('[role=separator]')!
    expect(parseFloat(pane.style.height)).toBeCloseTo(33.333, 2)
    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await nextTick()
    expect(parseFloat(pane.style.height)).toBeCloseTo(35.333, 2)
    separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    expect(parseFloat(pane.style.height)).toBeCloseTo(33.333, 2)
  })

  it('renders every real IN/OUT pin and updates on variable mutations', async () => {
    mount(PinDiagram)
    expect(host.querySelectorAll('[data-pin-id]')).toHaveLength(21)
    expect(host.textContent).toContain('ModbusTCP_Client')
    expect(addVariable({ ...emptyVariableInput('IN_OUT'), name: 'testBoth' })).toBe(null)
    await nextTick()
    expect(host.querySelectorAll('[data-pin-id]')).toHaveLength(23)
    deleteVariable(state.doc!.variables.find(v => v.name === 'testBoth')!.id)
    await nextTick()
    expect(host.querySelectorAll('[data-pin-id]')).toHaveLength(21)
  })

  it('filters variables and expands matches in collapsed groups', async () => {
    mount(VariablesPanel)
    const count = state.doc!.variables.length
    expect(host.querySelectorAll('.var-row')).toHaveLength(count)
    state.collapsed.IN = true
    await nextTick()
    expect(host.querySelectorAll('.var-row')).toHaveLength(count - 16)
    state.variableSearch = 'xConnect'
    await nextTick()
    expect(host.querySelectorAll('.var-row')).toHaveLength(1)
    expect(host.textContent).toContain('xConnect')
  })

  it('refreshes calls and emits a real editor navigation request', async () => {
    mount(CallsPanel)
    const call = state.calls[0]
    host.querySelector<HTMLElement>('.call-row')!.click()
    expect(state.jump).toMatchObject({ line: call.line, column: call.column, sectionId: call.sectionId })
    const refresh = Array.from(host.querySelectorAll('button')).find(b => b.textContent === '刷新解析')!
    state.doc!.sections[0].stSource += '\nExtra_Call();'
    refresh.click()
    await nextTick()
    expect(state.calls.some(c => c.displayName === 'Extra_Call')).toBe(true)
    expect(state.calls.find(c => c.displayName === 'Extra_Call')?.snippet).toBe('Extra_Call();')
  })

  it('highlights the raw search text rather than corrupting HTML entities', async () => {
    state.doc!.variables[0].name = 'amp'
    state.doc!.variables[0].typeName = 'ARRAY[0..4] OF INT & amp'
    state.variableSearch = 'amp'
    mount(VariablesPanel)
    await nextTick()
    expect(host.querySelector('.var-type')!.textContent).toContain('ARRAY[0..4] OF INT & amp')
    expect(host.querySelector('.var-type mark')!.textContent).toBe('amp')
  })

  it('renders the variable table with separate type and address columns inside group wrappers', async () => {
    expect(
      addVariable({
        ...emptyVariableInput('GLOBAL'),
        name: 'iAddrCol',
        typeName: 'INT',
        topologicalAddress: '%MW120'
      })
    ).toBe(null)
    mount(VariablesPanel)
    await nextTick()

    const labels = Array.from(host.querySelector('.variable-column-head')!.querySelectorAll('span')).map(
      (span) => span.textContent
    )
    expect(labels).toEqual(['变量名', '类型', '地址', '初值', '注释', '操作'])

    expect(host.querySelectorAll('.var-group').length).toBeGreaterThan(0)
    expect(host.querySelector('.var-group .var-group-head')).toBeTruthy()

    const id = state.doc!.variables.find((variable) => variable.name === 'iAddrCol')!.id
    const row = host.querySelector(`[data-var-id="${id}"]`)!
    expect(row.querySelector('.var-type')!.textContent).toContain('INT')
    expect(row.querySelector('.var-addr')!.textContent).toContain('%MW120')
  })

  it('labels variable calls and selects the variable when a call is clicked', async () => {
    mount(CallsPanel)
    const variableCall = state.calls.find((call) => call.kind === 'variable')!
    const row = Array.from(host.querySelectorAll<HTMLElement>('.call-row')).find((item) =>
      item.textContent?.includes(variableCall.displayName)
    )!
    expect(row.querySelector('.badge')!.textContent).toBe('变量')
    row.click()
    expect(state.selectedVariableId).toBe(variableCall.targetId)
    expect(state.jump).toMatchObject({
      sectionId: variableCall.sectionId,
      line: variableCall.line,
      column: variableCall.column
    })
  })

  it('links a variable row click to its first related call', async () => {
    const variable = state.doc!.variables.find((item) => item.name === 'rtExecute')!
    const call = state.calls.find((item) => item.name === 'rtExecute')!
    mount(VariablesPanel)
    const row = host.querySelector<HTMLElement>(`[data-var-id="${variable.id}"]`)!
    row.click()
    await nextTick()
    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.jump).toMatchObject({ sectionId: call.sectionId, line: call.line })
  })

  it('links a pin click and its keyboard activation to the selected variable', async () => {
    mount(PinDiagram)
    const pin = host.querySelector<SVGGElement>('[data-pin-id]')!
    const id = pin.getAttribute('data-pin-id')!
    pin.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(state.selectedVariableId).toBe(id)
    expect(host.querySelector('.fb-pin--active')).toBeTruthy()

    const other = Array.from(host.querySelectorAll<SVGGElement>('[data-pin-id]')).find(
      (item) => item.getAttribute('data-pin-id') !== id
    )!
    other.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(state.selectedVariableId).toBe(other.getAttribute('data-pin-id'))
  })

  it('shows plain variable references and highlights the selected variable', async () => {
    mount(CallsPanel)
    expect(state.variableReferences.length).toBeGreaterThan(0)
    host.querySelector<HTMLElement>('[data-testid="view-references"]')!.click()
    await nextTick()

    expect(host.querySelectorAll('.reference-row')).toHaveLength(state.variableReferences.length)
    const accesses = Array.from(host.querySelectorAll('.reference-row .badge')).map((badge) => badge.textContent)
    expect(accesses).toContain('调用')
    expect(accesses).toContain('读')

    const variable = state.doc!.variables.find((item) => item.name === 'rtExecute')!
    revealVariable(variable.id)
    await nextTick()
    const expected = state.variableReferences.filter((reference) => reference.targetId === variable.id)
    expect(expected.length).toBeGreaterThan(0)
    const active = host.querySelectorAll('.call-row--active')
    expect(active).toHaveLength(expected.length)
    expect(active[0].textContent).toContain('rtExecute')
  })

  it('filters variable references by name and jumps to the clicked occurrence', async () => {
    mount(CallsPanel)
    state.referenceView = 'references'
    state.callSearch = 'rtExecute'
    await nextTick()

    const rows = host.querySelectorAll<HTMLElement>('.reference-row')
    expect(rows.length).toBeGreaterThan(0)
    const reference = state.variableReferences.find((item) => item.targetName === 'rtExecute')!
    rows[0].click()
    expect(state.selectedVariableId).toBe(reference.targetId)
    expect(state.jump).toMatchObject({
      sectionId: reference.sectionId,
      line: reference.line,
      column: reference.column
    })
  })

  it('shows the no-reference state for an unused variable and never jumps elsewhere', async () => {
    expect(addVariable({ ...emptyVariableInput('IN'), name: 'xNeverUsed' })).toBe(null)
    const variable = state.doc!.variables.find((item) => item.name === 'xNeverUsed')!
    mount(CallsPanel)
    state.jump = null

    revealVariable(variable.id)
    await nextTick()
    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.referenceView).toBe('references')
    expect(host.querySelector('[data-testid="references-empty"]')!.textContent).toContain('xNeverUsed')
    expect(state.jump).toBeNull()
    expect(host.querySelectorAll('.call-row--active')).toHaveLength(0)
  })

  it('keeps the no-reference state when an unused pin is clicked', async () => {
    expect(addVariable({ ...emptyVariableInput('IN'), name: 'xPinNoRef' })).toBe(null)
    const variable = state.doc!.variables.find((item) => item.name === 'xPinNoRef')!
    mount(PinDiagram)
    state.jump = null

    host.querySelector<SVGGElement>(`[data-pin-id="${variable.id}"]${''}`)!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.referenceView).toBe('references')
    expect(state.variableReferences.some((reference) => reference.targetId === variable.id)).toBe(false)
    expect(state.jump).toBeNull()
  })
})

describe('function call dialog', () => {
  function openDialog(): CallInsertPayload[] {
    const inserted: CallInsertPayload[] = []
    mount(FunctionCallDialog, { visible: true, onInsert: (payload: CallInsertPayload) => inserted.push(payload) })
    return inserted
  }

  function dialogElement<T extends Element = Element>(selector: string): T {
    const element = document.body.querySelector<T>(selector)
    if (!element) throw new Error(`未找到元素 ${selector}`)
    return element
  }

  function insertButton(label: string): HTMLButtonElement {
    return dialogElement<HTMLButtonElement>(`[data-entry-label="${label}"] .lib-insert`)
  }

  /** Input parameters come from the library JSON, so expectations stay data driven. */
  function efbParameters(label: string): string[] {
    return (findLibraryEntry(label) as { parameters?: string[] } | null)?.parameters ?? []
  }

  /** Mirrors the dialog placeholder rule: PT/PV keep a literal, others get x<Parameter>. */
  function parameterPlaceholder(parameter: string): string {
    if (parameter === 'PT') return 't#2s'
    if (parameter === 'PV') return '0'
    return `x${parameter.charAt(0)}${parameter.slice(1).toLowerCase()}`
  }

  function expectedInstanceCall(instance: string, label: string): string {
    const args = efbParameters(label)
      .map((parameter) => `${parameter} := ${parameterPlaceholder(parameter)}`)
      .join(', ')
    return `${instance}(${args});`
  }

  it('lists all five categories and every library entry plus ST sub functions', async () => {
    openDialog()
    await nextTick()
    const tabs = Array.from(document.body.querySelectorAll('[data-category]')).map((tab) =>
      tab.textContent?.replace(/\d+$/, '').trim()
    )
    expect(tabs).toEqual(['全部', '函数', '功能块', '子函数', '自定义调用'])
    expect(document.body.querySelectorAll('.call-lib-item')).toHaveLength(ALL_LIBRARY_ENTRIES.length + (state.doc?.sections.filter(section => section.language === 'ST').length ?? 0))
  })

  it('inserts a library function with its signature text', async () => {
    const inserted = openDialog()
    await nextTick()
    insertButton('READ_VAR').click()
    const entry = findLibraryEntry('READ_VAR')!
    expect(inserted).toEqual([
      { label: 'READ_VAR', kind: 'ef', text: snippetToPlainText(entry.insertText) }
    ])
    expect(inserted[0].text).toContain('READ_VAR(ADR := stAddr')
    expect(inserted[0].text).toContain('GEST := aiGest')
    expect(inserted[0].text).toContain('RECP => aiRecv')
  })

  it('filters by category and requires an EFB instance before insertion', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="efb"]').click()
    await nextTick()
    expect(document.body.querySelectorAll('.call-lib-item')).toHaveLength(ALL_LIBRARY_ENTRIES.filter(entry => entry.kind === 'efb').length)
    insertButton('TON').click()
    await nextTick()
    // Clicking an EFB must never insert a type-name call; it opens the instance panel instead.
    expect(inserted).toEqual([])
    expect(dialogElement('[data-testid="efb-panel"]')).toBeTruthy()
    // Either the JSON parameter table is shown, or the entry is flagged as needing arguments.
    expect(dialogElement('[data-testid="efb-parameter-hint"]').textContent).toMatch(/参数：|需要补参数/)
  })

  it('inserts a terminated instance statement for an EFB that already has a declared instance', async () => {
    const inserted = openDialog()
    await nextTick()
    insertButton('R_TRIG').click()
    await nextTick()

    const instance = dialogElement<HTMLSelectElement>('[data-testid="efb-instance"]')
    expect(Array.from(instance.options).map((option) => option.textContent?.trim())).toContain('rtExecute')
    // With an existing instance the name input stays hidden: nothing is created by default.
    expect(document.body.querySelector('[data-testid="efb-new-instance"]')).toBeNull()
    instance.value = instance.options[0].value
    instance.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    dialogElement<HTMLElement>('[data-testid="insert-efb-call"]').click()

    expect(inserted).toEqual([
      { label: 'R_TRIG', kind: 'efb', text: expectedInstanceCall('rtExecute', 'R_TRIG') }
    ])
    // A complete ST statement: instance(args);
    expect(inserted[0].text).toMatch(/^[A-Za-z_][A-Za-z0-9_]*\([^()]*\);$/)
    expect(dialogElement('[data-testid="efb-outputs"]').textContent).toContain('输出')
  })

  it('creates a second instance of a type that already has one only after choosing 新建实例', async () => {
    const inserted = openDialog()
    await nextTick()
    insertButton('R_TRIG').click()
    await nextTick()

    const select = dialogElement<HTMLSelectElement>('[data-testid="efb-instance"]')
    const newOption = Array.from(select.options).find((option) => option.textContent?.includes('新建实例'))
    expect(newOption).toBeTruthy()
    expect(document.body.querySelector('[data-testid="efb-new-instance"]')).toBeNull()

    select.value = newOption!.value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    const name = dialogElement<HTMLInputElement>('[data-testid="efb-new-instance"]')
    name.value = 'rtSecond'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    // Choosing the new option + typing a name still creates nothing.
    expect(state.doc!.variables.some((variable) => variable.name === 'rtSecond')).toBe(false)
    expect(inserted).toEqual([])

    dialogElement<HTMLElement>('[data-testid="insert-efb-call"]').click()
    await nextTick()
    expect(state.doc!.variables.find((variable) => variable.name === 'rtSecond')).toMatchObject({
      typeName: 'R_TRIG',
      category: 'PRIVATE'
    })
    expect(inserted).toEqual([
      { label: 'R_TRIG', kind: 'efb', text: expectedInstanceCall('rtSecond', 'R_TRIG') }
    ])
  })

  it('creates a PRIVATE instance variable only on the explicit EFB insert', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="efb"]').click()
    await nextTick()
    insertButton('TON').click()
    await nextTick()

    expect(dialogElement('[data-testid="efb-no-instance"]').textContent).toContain('未声明 TON')
    const name = dialogElement<HTMLInputElement>('[data-testid="efb-new-instance"]')
    name.value = 'tonNew'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()

    // Typing a name does not create anything, and closing without inserting must not either.
    expect(state.doc!.variables.some((variable) => variable.name === 'tonNew')).toBe(false)
    expect(inserted).toEqual([])

    dialogElement<HTMLElement>('[data-testid="insert-efb-call"]').click()
    await nextTick()
    const created = state.doc!.variables.find((variable) => variable.name === 'tonNew')
    expect(created).toMatchObject({ typeName: 'TON', category: 'PRIVATE' })
    expect(inserted).toEqual([
      { label: 'TON', kind: 'efb', text: expectedInstanceCall('tonNew', 'TON') }
    ])
    expect(inserted[0].text.endsWith(';')).toBe(true)
    expect(state.dirty).toBe(true)
  })

  it('reports a missing instance name instead of creating a variable', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="efb"]').click()
    await nextTick()
    insertButton('TON').click()
    await nextTick()

    const before = state.doc!.variables.length
    dialogElement<HTMLElement>('[data-testid="insert-efb-call"]').click()
    await nextTick()
    expect(dialogElement('[data-testid="efb-error"]').textContent).toContain('请选择已声明实例')
    expect(state.doc!.variables).toHaveLength(before)
    expect(inserted).toEqual([])
  })

  it('inserts an ST program section as a sub function call', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="sub"]').click()
    await nextTick()
    expect(insertButton('ModbusTCP_Client').textContent).toBe('插入')
    insertButton('ModbusTCP_Client').click()
    expect(inserted).toEqual([{ label: 'ModbusTCP_Client', kind: 'sub', text: 'ModbusTCP_Client()' }])
  })

  it('builds a custom call from the name and optional parameter text', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="custom"]').click()
    await nextTick()

    const name = dialogElement<HTMLInputElement>('[data-testid="custom-call-name"]')
    name.value = 'fbMotor'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    const params = dialogElement<HTMLInputElement>('[data-testid="custom-call-params"]')
    params.value = 'xStart := xCmd'
    params.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    dialogElement<HTMLElement>('[data-testid="insert-custom-call"]').click()

    expect(inserted).toEqual([{ label: 'fbMotor', kind: 'custom', text: 'fbMotor(xStart := xCmd)' }])
  })

  it('rejects a custom call name that is empty or not an IEC identifier', async () => {
    const inserted = openDialog()
    await nextTick()
    dialogElement<HTMLElement>('[data-category="custom"]').click()
    await nextTick()

    dialogElement<HTMLElement>('[data-testid="insert-custom-call"]').click()
    await nextTick()
    expect(dialogElement('[data-testid="custom-call-error"]').textContent).toContain('不能为空')

    const name = dialogElement<HTMLInputElement>('[data-testid="custom-call-name"]')
    name.value = '1bad name'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    dialogElement<HTMLElement>('[data-testid="insert-custom-call"]').click()
    await nextTick()
    expect(dialogElement('[data-testid="custom-call-error"]').textContent).toContain('字母')
    expect(inserted).toEqual([])
  })
})
