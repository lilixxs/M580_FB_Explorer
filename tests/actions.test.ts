import { beforeEach, describe, expect, it } from 'vitest'
import { addVariable, deleteVariable, moveVariable, loadExchangeXml, saveActiveSection, selectSection, selectVariable, setActiveSource } from '../src/actions'
import { emptyVariableInput } from '../src/types'
import { state } from '../src/store'

const TWO_ST_PROGRAMS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<STExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="结构化的源文件" DTDVersion="41"></fileHeader><contentHeader name="P" version="0.0.1"></contentHeader><program><identProgram name="Section_A" type="section" task="MAST"></identProgram><STSource>
a := 1;
</STSource></program><program><identProgram name="Section_B" type="section" task="MAST"></identProgram><STSource>
b := 1;
</STSource></program><dataBlock><variables name="a" typeName="INT"></variables><variables name="b" typeName="INT"></variables></dataBlock></STExchangeFile>`

beforeEach(() => {
  state.doc = null
  state.calls = []
  state.dirty = false
  state.activeSectionId = ''
  state.selectedVariableId = ''
})

describe('editor save flow', () => {
  it('resets filters, hidden groups, stale navigation and dialogs on import', () => {
    loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')
    state.variableSearch = 'old'
    state.callSearch = 'old'
    state.collapsed = { GLOBAL: true }
    state.callsOnlyActiveSection = true
    state.variableEditor = { mode: 'add', variableId: '', category: 'IN' }
    state.jump = { sectionId: 'missing', line: 9, column: 3, nonce: 4 }
    loadExchangeXml(TWO_ST_PROGRAMS, 'Next.xst')
    expect(state.variableSearch).toBe('')
    expect(state.callSearch).toBe('')
    expect(state.collapsed).toEqual({})
    expect(state.callsOnlyActiveSection).toBe(false)
    expect(state.variableEditor).toBe(null)
    expect(state.jump).toBe(null)
  })

  it('reveals a selected pin even if its group was hidden by search or collapse', () => {
    loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')
    state.variableSearch = 'hidden'
    state.collapsed.GLOBAL = true
    const nonce = state.variableFocusNonce
    selectVariable(state.doc!.variables[0].id, true)
    expect(state.variableSearch).toBe('')
    expect(state.collapsed.GLOBAL).toBe(false)
    expect(state.variableFocusNonce).toBe(nonce + 1)
  })
  it('persists edits from every dirty ST section in one re-parse', () => {
    expect(loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')).toBe(true)
    const first = state.doc!.sections[0]
    const second = state.doc!.sections[1]

    selectSection(first.id)
    setActiveSource('a := 2;\n(* edited A *)')
    expect(state.dirty).toBe(true)

    selectSection(second.id)
    setActiveSource('b := 2;\n(* edited B *)')

    expect(saveActiveSection()).toBe(true)
    expect(state.dirty).toBe(true)
    expect(state.dirtySections).toEqual({})
    expect(state.doc!.sections[0].stSource).toBe('a := 2;\n(* edited A *)')
    expect(state.doc!.sections[1].stSource).toBe('b := 2;\n(* edited B *)')
    expect(state.doc!.variables.map((variable) => variable.name)).toEqual(['a', 'b'])
  })

  it('keeps the previous document when the re-parse fails', () => {
    expect(loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')).toBe(true)
    const before = state.doc!
    before.rawXml = '<STExchangeFile><program>'
    selectSection(before.sections[0].id)
    setActiveSource('a := 3;')
    expect(saveActiveSection()).toBe(false)
    expect(state.doc).toBe(before)
    expect(state.status?.type).toBe('error')
  })

  it('rejects edits on read-only non-ST sections', () => {
    const xml = TWO_ST_PROGRAMS.replace('<STSource>\nb := 1;\n</STSource>', '<FBD><network></network></FBD>')
    expect(loadExchangeXml(xml, 'Mixed.xst')).toBe(true)
    const nonSt = state.doc!.sections[1]
    selectSection(nonSt.id)
    setActiveSource('b := 9;')
    expect(state.dirty).toBe(false)
    expect(nonSt.language).toBe('XML')
  })

  it('does not discard variable edits when saving source', () => {
    loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')
    const id = state.doc!.variables[0].id
    deleteVariable(id)
    expect(addVariable({ ...emptyVariableInput('IN'), name: 'newPin' })).toBe(null)
    expect(addVariable({ ...emptyVariableInput('IN'), name: 'nextPin' })).toBe(null)
    moveVariable(state.doc!.variables.find(v => v.name === 'nextPin')!.id, -1)
    setActiveSource('b := 4;')
    expect(saveActiveSection()).toBe(true)
    expect(state.doc!.variables.map(v => v.name)).not.toContain('a')
    expect(state.doc!.variables.filter(v => v.category === 'IN').map(v => [v.name, v.positionPin]))
      .toEqual([['nextPin', 1], ['newPin', 2]])
  })
})
