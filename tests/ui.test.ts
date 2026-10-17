import { createApp, nextTick, type App, type Component } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SplitPane from '../src/components/SplitPane.vue'
import VariablesPanel from '../src/components/VariablesPanel.vue'
import CallsPanel from '../src/components/CallsPanel.vue'
import PinDiagram from '../src/components/PinDiagram.vue'
import { loadExchangeXml, addVariable, deleteVariable } from '../src/actions'
import { state } from '../src/store'
import { emptyVariableInput } from '../src/types'

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
    expect(host.querySelector('.var-meta')!.textContent).toContain('ARRAY[0..4] OF INT & amp')
    expect(host.querySelector('.var-meta mark')!.textContent).toBe('amp')
  })
})
