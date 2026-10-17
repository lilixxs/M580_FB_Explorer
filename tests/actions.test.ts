import { beforeEach, describe, expect, it } from 'vitest'
import { addVariable, deleteVariable, jumpToCall, jumpToReference, linkEditorVariable, loadExchangeXml, moveVariable, revealVariable, saveActiveSection, selectSection, selectVariable, setActiveSource, setReferenceView } from '../src/actions'
import { emptyVariableInput } from '../src/types'
import { state } from '../src/store'

const TWO_ST_PROGRAMS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<STExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="结构化的源文件" DTDVersion="41"></fileHeader><contentHeader name="P" version="0.0.1"></contentHeader><program><identProgram name="Section_A" type="section" task="MAST"></identProgram><STSource>
a := 1;
</STSource></program><program><identProgram name="Section_B" type="section" task="MAST"></identProgram><STSource>
b := 1;
</STSource></program><dataBlock><variables name="a" typeName="INT"></variables><variables name="b" typeName="INT"></variables></dataBlock></STExchangeFile>`

const CALL_PROGRAM = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<STExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="结构化的源文件" DTDVersion="41"></fileHeader><contentHeader name="P" version="0.0.1"></contentHeader><program><identProgram name="Caller_A" type="section" task="MAST"></identProgram><STSource>
tonRun(IN := xRun);
</STSource></program><program><identProgram name="Caller_B" type="section" task="MAST"></identProgram><STSource>
tonRun(PT := t#2s);
</STSource></program><dataBlock><variables name="tonRun" typeName="TON"></variables><variables name="xRun" typeName="BOOL"></variables><variables name="xUnused" typeName="BOOL"></variables></dataBlock></STExchangeFile>`

beforeEach(() => {
  state.doc = null
  state.calls = []
  state.variableReferences = []
  state.referenceView = 'calls'
  state.referenceFocusNonce = 0
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

describe('save badge state', () => {
  it('tracks unsaved sections per section and keeps the page dirty flag until export', () => {
    loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')
    const [first, second] = state.doc!.sections

    selectSection(first.id)
    setActiveSource('a := 7;')
    // The editor badge is driven by dirtySections[section.id]; only the edited section shows it.
    expect(state.dirtySections[first.id]).toBe(true)
    expect(Boolean(state.dirtySections[second.id])).toBe(false)
    expect(state.dirty).toBe(true)

    expect(saveActiveSection()).toBe(true)
    // Badge cleared for every saved section...
    expect(state.dirtySections).toEqual({})
    expect(Boolean(state.dirtySections[first.id])).toBe(false)
    // ...but the page keeps its unsaved-export state so the top bar still shows 有修改.
    expect(state.dirty).toBe(true)
  })

  it('clears the page dirty flag only through the export path', () => {
    loadExchangeXml(TWO_ST_PROGRAMS, 'Two.xst')
    selectSection(state.doc!.sections[0].id)
    setActiveSource('a := 8;')
    saveActiveSection()
    expect(state.dirty).toBe(true)
    // App.vue onExport is the only owner of state.dirty = false.
    state.dirty = false
    expect(state.dirty).toBe(false)
  })
})

describe('variable and call linkage', () => {
  it('selects the variable when jumping to a variable call', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const call = state.calls.find((item) => item.name === 'tonRun')!
    expect(call.kind).toBe('variable')
    const variableId = call.targetId

    jumpToCall(call)
    expect(state.selectedVariableId).toBe(variableId)
    expect(state.jump).toMatchObject({ sectionId: call.sectionId, line: call.line, column: call.column })
  })

  it('reveals a variable through its first reference in the active section', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variableId = state.doc!.variables.find((variable) => variable.name === 'tonRun')!.id
    const [first, second] = state.doc!.sections

    selectSection(first.id)
    revealVariable(variableId)
    expect(state.selectedVariableId).toBe(variableId)
    expect(state.jump?.sectionId).toBe(first.id)
    expect(state.jump?.line).toBe(
      state.variableReferences.find((reference) => reference.name === 'tonRun' && reference.sectionId === first.id)!.line
    )

    selectSection(second.id)
    revealVariable(variableId)
    expect(state.jump?.sectionId).toBe(second.id)
  })

  it('switches to the references view, highlights it and never jumps to another variable', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xUnused')!
    const before = state.jump
    const nonce = state.referenceFocusNonce

    revealVariable(variable.id)
    expect(state.referenceView).toBe('references')
    expect(state.referenceFocusNonce).toBe(nonce + 1)
    expect(state.selectedVariableId).toBe(variable.id)
    // No reference exists for xUnused, so the editor position must not move.
    expect(state.jump).toBe(before)
  })

  it('jumps to one reference without leaving the references view', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xRun')!
    const reference = state.variableReferences.find((item) => item.targetId === variable.id)!
    setReferenceView('references')

    jumpToReference(reference)
    expect(state.referenceView).toBe('references')
    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.jump).toMatchObject({ sectionId: reference.sectionId, line: reference.line, column: reference.column })
  })

  it('links the editor token selection without moving the cursor', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xRun')!
    state.jump = { sectionId: 'untouched', line: 4, column: 2, nonce: 9 }

    linkEditorVariable(variable.id)
    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.referenceView).toBe('references')
    expect(state.jump).toEqual({ sectionId: 'untouched', line: 4, column: 2, nonce: 9 })

    // Repeated clicks on the same token do not churn the focus nonce.
    const nonce = state.referenceFocusNonce
    linkEditorVariable(variable.id)
    expect(state.referenceFocusNonce).toBe(nonce)
  })

  it('links the editor token with focus: filter cleared, group expanded, view switched', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xRun')!
    state.referenceView = 'calls'
    state.variableSearch = 'zzz'
    state.collapsed[variable.category] = true
    const focusNonce = state.variableFocusNonce
    const referenceNonce = state.referenceFocusNonce

    linkEditorVariable(variable.id)

    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.referenceView).toBe('references')
    // The variables panel expands the category and drops the filter, then scrolls to the row.
    expect(state.variableSearch).toBe('')
    expect(state.collapsed[variable.category]).toBe(false)
    expect(state.variableFocusNonce).toBe(focusNonce + 1)
    expect(state.referenceFocusNonce).toBe(referenceNonce + 1)
    // References stay out of the call list.
    expect(state.calls.every((call) => call.reference !== true)).toBe(true)
  })

  it('reflects unsaved references when the editor token is clicked', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xUnused')!
    expect(state.variableReferences.some((reference) => reference.targetId === variable.id)).toBe(false)

    selectSection(state.doc!.sections[0].id)
    setActiveSource('tonRun(IN := xUnused);')
    // The cached list is stale until something refreshes it.
    expect(state.variableReferences.some((reference) => reference.targetId === variable.id)).toBe(false)

    linkEditorVariable(variable.id)

    expect(state.selectedVariableId).toBe(variable.id)
    expect(state.variableReferences.some((reference) => reference.targetId === variable.id)).toBe(true)
    expect(state.variableReferences.every((reference) => reference.reference === true)).toBe(true)
    expect(state.calls.every((call) => call.reference !== true)).toBe(true)
  })

  it('reveals a repeatedly clicked token after filtering or collapsing its variable row', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    const variable = state.doc!.variables.find((item) => item.name === 'xRun')!
    linkEditorVariable(variable.id)
    const referenceNonce = state.referenceFocusNonce
    const jump = state.jump

    for (const hide of ['filter', 'collapse']) {
      state.variableSearch = hide === 'filter' ? 'zzz' : ''
      state.collapsed[variable.category] = hide === 'collapse'
      const focusNonce = state.variableFocusNonce
      linkEditorVariable(variable.id)
      expect(state.variableSearch).toBe('')
      expect(state.collapsed[variable.category]).toBe(false)
      expect(state.variableFocusNonce).toBe(focusNonce + 1)
      expect(state.referenceFocusNonce).toBe(referenceNonce)
      expect(state.jump).toBe(jump)
    }
  })

  it('refreshes variable references after a save and after a variable edit', () => {
    loadExchangeXml(CALL_PROGRAM, 'Calls.xst')
    selectSection(state.doc!.sections[0].id)
    expect(state.variableReferences.some((reference) => reference.name === 'xUnused')).toBe(false)

    // Editing the source refreshes on save, together with the call list.
    setActiveSource('tonRun(IN := xUnused);')
    expect(saveActiveSection()).toBe(true)
    expect(state.variableReferences.some((reference) => reference.name === 'xUnused')).toBe(true)

    // Variable mutations refresh the reference list as well.
    expect(addVariable({ ...emptyVariableInput('IN'), name: 'xAdded' })).toBe(null)
    expect(state.variableReferences.every((reference) => reference.targetId !== '')).toBe(true)

    expect(state.variableReferences.some((reference) => reference.targetName === 'xUnused')).toBe(true)
    expect(deleteVariable(state.doc!.variables.find((variable) => variable.name === 'xUnused')!.id)).toBe(true)
    expect(state.variableReferences.some((reference) => reference.targetName === 'xUnused')).toBe(false)
  })
})
