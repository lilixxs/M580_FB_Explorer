import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import VariableDialog from '../src/components/VariableDialog.vue'
import { loadExchangeXml, openVariableEditor } from '../src/actions'
import { state } from '../src/store'
import { ELEMENTARY_VARIABLE_TYPES } from '../src/core/functionLibrary'

/**
 * TDesign dialogs use a transition and teleport to `document.body`. jsdom has neither a
 * ResizeObserver nor a layout engine, so the observer is stubbed and every query goes through
 * `document.body` after two ticks.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

let app: App | undefined
let host: HTMLDivElement

function mount(): void {
  host = document.createElement('div')
  document.body.appendChild(host)
  app = createApp(VariableDialog)
  app.mount(host)
}

async function tick(): Promise<void> {
  await nextTick()
  await nextTick()
}

function bodyElement<T extends Element = Element>(selector: string): T {
  const element = document.body.querySelector<T>(selector)
  if (!element) throw new Error(`未找到元素 ${selector}`)
  return element
}

function typePicker(): HTMLElement {
  return bodyElement<HTMLElement>('[data-testid="type-picker"]')
}

function typeValue(): string {
  return (bodyElement<HTMLInputElement>('#var-type')).value
}

function setField(selector: string, value: string): void {
  const input = bodyElement<HTMLInputElement>(selector)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function click(selector: string): void {
  bodyElement<HTMLElement>(selector).click()
}

function setSelect(selector: string, value: string): void {
  const select = bodyElement<HTMLSelectElement>(selector)
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function clickButton(label: string): void {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === label
  )
  if (!button) throw new Error(`未找到按钮 ${label}`)
  button.click()
}

beforeEach(() => {
  const scope = globalThis as { ResizeObserver?: unknown }
  if (!scope.ResizeObserver) scope.ResizeObserver = ResizeObserverStub
  loadExchangeXml(
    readFileSync(resolve(process.cwd(), 'fixtures/ModbusTCP_Client.xdb'), 'utf8'),
    'ModbusTCP_Client.xdb'
  )
})

afterEach(() => {
  app?.unmount()
  host?.remove()
  document.body.innerHTML = ''
})

describe('variable type picker', () => {
  it('resets array drafts when opening a different variable editor', async () => {
    mount()
    openVariableEditor('add', 'PRIVATE')
    await tick()
    click('[data-testid="open-type-picker"]')
    await tick()
    click('[data-testid="type-mode-array"]')
    await tick()
    setField('#array-upper', '500')
    openVariableEditor('add', 'IN')
    await tick()
    click('[data-testid="open-type-picker"]')
    await tick()
    click('[data-testid="type-mode-array"]')
    await tick()
    expect(bodyElement<HTMLInputElement>('#array-upper').value).toBe('9')
  })

  it('rejects invalid custom type syntax without blaming the variable name', async () => {
    mount()
    openVariableEditor('add', 'PRIVATE')
    await tick()
    setField('#var-name', 'bad name')
    click('[data-testid="open-type-picker"]')
    await tick()
    setField('#type-custom', 'bad type')
    click('[data-testid="apply-custom-type"]')
    await tick()
    expect(typePicker().textContent).toContain('数据类型格式非法')
    setField('#type-custom', 'MotorStatus')
    click('[data-testid="apply-custom-type"]')
    await tick()
    expect(typeValue()).toBe('MotorStatus')
  })

  it('accepts custom types inside the picker without leaking cancelled changes', async () => {
    mount()
    openVariableEditor('add', 'PRIVATE')
    await tick()
    click('[data-testid="open-type-picker"]')
    await tick()
    setField('#type-custom', 'MotorStatus')
    click('[data-testid="type-picker-close"]')
    await tick()
    expect(typeValue()).toBe('BOOL')
    click('[data-testid="open-type-picker"]')
    await tick()
    setField('#type-custom', 'MotorStatus')
    click('[data-testid="apply-custom-type"]')
    await tick()
    expect(typeValue()).toBe('MotorStatus')
  })

  it('clears stale custom array elements when a preset is selected', async () => {
    mount()
    openVariableEditor('add', 'PRIVATE')
    await tick()
    setField('#var-type', 'ARRAY[1..3] OF MotorStatus')
    click('[data-testid="open-type-picker"]')
    await tick()
    expect(bodyElement<HTMLInputElement>('#array-element-custom').value).toBe('MotorStatus')
    setSelect('#array-element', 'BOOL')
    await tick()
    click('[data-testid="apply-array"]')
    await tick()
    expect(typeValue()).toBe('ARRAY[1..3] OF BOOL')
  })

  it('quick picks an elementary type and saves it', async () => {
    mount()
    openVariableEditor('add', 'GLOBAL')
    await tick()

    click('[data-testid="open-type-picker"]')
    await tick()
    expect(typePicker()).toBeTruthy()
    expect(typePicker().querySelectorAll('.type-chip').length).toBeGreaterThanOrEqual(20)

    click('[data-type="INT"]')
    await tick()
    expect(typeValue()).toBe('INT')
    expect(document.body.querySelector('[data-testid="type-picker"]')).toBeNull()

    setField('#var-name', 'iQuickPick')
    clickButton('保存')
    await tick()

    const added = state.doc!.variables.find((variable) => variable.name === 'iQuickPick')
    expect(added?.typeName).toBe('INT')
  })

  it('builds an ARRAY type from bounds and an element type', async () => {
    mount()
    openVariableEditor('add', 'GLOBAL')
    await tick()

    click('[data-testid="open-type-picker"]')
    await tick()
    click('[data-testid="type-mode-array"]')
    await tick()

    expect(bodyElement<HTMLInputElement>('[data-testid="array-lower"]').value).toBe('0')
    expect(bodyElement<HTMLInputElement>('[data-testid="array-upper"]').value).toBe('9')
    setSelect('[data-testid="array-element"]', 'INT')
    setField('[data-testid="array-upper"]', '9')
    click('[data-testid="apply-array"]')
    await tick()
    expect(typeValue()).toBe('ARRAY[0..9] OF INT')

    setField('#var-name', 'aiQuickPick')
    clickButton('保存')
    await tick()
    expect(state.doc!.variables.find((variable) => variable.name === 'aiQuickPick')?.typeName).toBe(
      'ARRAY[0..9] OF INT'
    )
  })

  it('accepts a custom element type and rejects inverted bounds', async () => {
    mount()
    openVariableEditor('add', 'GLOBAL')
    await tick()

    click('[data-testid="open-type-picker"]')
    await tick()
    click('[data-testid="type-mode-array"]')
    await tick()

    setField('[data-testid="array-element-custom"]', 'My_Type')
    setField('[data-testid="array-lower"]', '0')
    setField('[data-testid="array-upper"]', '4')
    await tick()
    click('[data-testid="apply-array"]')
    await tick()
    expect(typeValue()).toBe('ARRAY[0..4] OF My_Type')

    click('[data-testid="open-type-picker"]')
    await tick()
    setField('[data-testid="array-lower"]', '9')
    setField('[data-testid="array-upper"]', '0')
    await tick()
    const error = bodyElement('[data-testid="array-error"]')
    expect(error.textContent).toContain('下界不能大于上界')
    expect(bodyElement<HTMLButtonElement>('[data-testid="apply-array"]').disabled).toBe(true)
    click('[data-testid="apply-array"]')
    await tick()
    expect(typeValue()).toBe('ARRAY[0..4] OF My_Type')
    expect(typePicker()).toBeTruthy()
  })

  it('backfills the picker when editing an existing ARRAY variable', async () => {
    const arrayVariable = state.doc!.variables.find((variable) => variable.name === 'xWDataBuf')!
    expect(arrayVariable.typeName).toBe('ARRAY[0..119] OF INT')

    mount()
    openVariableEditor('edit', arrayVariable.category, arrayVariable.id)
    await tick()
    expect(typeValue()).toBe('ARRAY[0..119] OF INT')

    click('[data-testid="open-type-picker"]')
    await tick()
    expect(bodyElement<HTMLInputElement>('[data-testid="array-lower"]').value).toBe('0')
    expect(bodyElement<HTMLInputElement>('[data-testid="array-upper"]').value).toBe('119')
    expect(bodyElement<HTMLSelectElement>('[data-testid="array-element"]').value).toBe('INT')

    click('[data-testid="type-mode-basic"]')
    await tick()
    expect(typePicker().querySelectorAll('.type-chip')).toHaveLength(ELEMENTARY_VARIABLE_TYPES.length)
    click('[data-type="DINT"]')
    await tick()
    expect(typeValue()).toBe('DINT')
  })

  it('keeps the free text custom type when the picker is not used', async () => {
    mount()
    openVariableEditor('add', 'GLOBAL')
    await tick()

    setField('#var-type', 'MY_STRUCT_TYPE')
    setField('#var-name', 'stCustom')
    clickButton('保存')
    await tick()
    expect(state.doc!.variables.find((variable) => variable.name === 'stCustom')?.typeName).toBe(
      'MY_STRUCT_TYPE'
    )
  })
})
