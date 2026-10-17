import { beforeEach, describe, expect, it } from 'vitest'
import { loadExchangeXml } from '../src/actions'
import { createMcpBridge } from '../src/core/mcp'
import { createMcpHandlers, getMcpState } from '../src/mcpHandlers'
import { state } from '../src/store'

const MIXED_XST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<STExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="结构化的源文件" DTDVersion="41"></fileHeader><contentHeader name="M580_MBS_Test" version="0.0.1"></contentHeader><program><identProgram name="Main_ST" type="section" task="MAST"></identProgram><STSource>
a := 1;
fbPulse();
</STSource></program><program><identProgram name="Main_FBD" type="section" task="MAST"></identProgram><FBD><network></network></FBD></program><dataBlock><variables name="a" typeName="INT"></variables><variables name="b" typeName="BOOL"></variables></dataBlock></STExchangeFile>`

function createBridge() {
  return createMcpBridge(createMcpHandlers(), getMcpState)
}

function load(): void {
  expect(loadExchangeXml(MIXED_XST, 'Mixed.xst')).toBe(true)
}

describe('m580_fb_* bridge tools', () => {
  beforeEach(() => {
    state.doc = null
    state.activeSectionId = ''
    state.selectedVariableId = ''
    state.calls = []
    state.dirty = false
    state.dirtySections = {}
    state.status = null
    state.jump = null
  })

  it('m580_fb_get_metadata reads the loaded document summary', async () => {
    const bridge = createBridge()
    await expect(bridge.callTool('m580_fb_get_metadata')).resolves.toEqual({
      ok: true,
      result: { loaded: false, doc: null }
    })

    load()
    const response = await bridge.callTool('m580_fb_get_metadata')
    expect(response).toMatchObject({
      ok: true,
      result: {
        loaded: true,
        doc: {
          kind: 'xst',
          projectName: 'M580_MBS_Test',
          sectionCount: 2,
          variableCount: 2
        }
      }
    })
  })

  it('m580_fb_list_variables filters by category and search text', async () => {
    load()
    const bridge = createBridge()

    const all = await bridge.callTool('m580_fb_list_variables')
    expect(all.ok).toBe(true)
    expect((all.result as Array<{ name: string; category: string }>).map((item) => item.name)).toEqual([
      'a',
      'b'
    ])

    const byCategory = await bridge.callTool('m580_fb_list_variables', { category: 'GLOBAL' })
    expect((byCategory.result as Array<{ name: string }>).map((item) => item.name)).toEqual(['a', 'b'])

    const bySearch = await bridge.callTool('m580_fb_list_variables', { search: 'bool' })
    expect((bySearch.result as Array<{ name: string }>).map((item) => item.name)).toEqual(['b'])

    const badCategory = await bridge.callTool('m580_fb_list_variables', { category: 'INPUT' })
    expect(badCategory).toEqual({
      ok: false,
      error: '参数 category 的取值必须是 IN|OUT|IN_OUT|PUBLIC|PRIVATE|GLOBAL'
    })
  })

  it('m580_fb_upsert_variable creates and updates variables', async () => {
    load()
    const bridge = createBridge()

    const added = await bridge.callTool('m580_fb_upsert_variable', {
      name: 'cTag',
      typeName: 'REAL',
      category: 'PRIVATE',
      comment: '新增变量'
    })
    expect(added).toMatchObject({
      ok: true,
      result: { name: 'cTag', category: 'PRIVATE' }
    })
    const created = state.doc!.variables.find((item) => item.name === 'cTag')!
    expect(created).toBeDefined()
    expect(created.comment).toBe('新增变量')

    const updated = await bridge.callTool('m580_fb_upsert_variable', {
      id: created.id,
      name: 'cTag2',
      typeName: 'DINT',
      category: 'PRIVATE',
      comment: '改名'
    })
    expect(updated).toMatchObject({
      ok: true,
      result: { id: created.id, name: 'cTag2' }
    })
    expect(state.doc!.variables.find((item) => item.id === created.id)?.name).toBe('cTag2')
    expect(state.doc!.variables.find((item) => item.id === created.id)?.comment).toBe('改名')
  })

  it('m580_fb_upsert_variable rejects illegal parameters and duplicates', async () => {
    load()
    const bridge = createBridge()

    const missingType = await bridge.callTool('m580_fb_upsert_variable', {
      name: 'dTag',
      category: 'GLOBAL'
    })
    expect(missingType).toEqual({ ok: false, error: '缺少必需参数：typeName' })

    const badCategory = await bridge.callTool('m580_fb_upsert_variable', {
      name: 'dTag',
      typeName: 'INT',
      category: 'INPUT' as unknown as 'IN'
    })
    expect(badCategory.ok).toBe(false)
    expect(badCategory.error).toContain('取值必须是')

    const duplicate = await bridge.callTool('m580_fb_upsert_variable', {
      name: 'a',
      typeName: 'INT',
      category: 'GLOBAL'
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toContain('重复')

    const unknownId = await bridge.callTool('m580_fb_upsert_variable', {
      id: 'var-404',
      name: 'dTag',
      typeName: 'INT',
      category: 'GLOBAL'
    })
    expect(unknownId.ok).toBe(false)
    expect(unknownId.error).toContain('变量不存在')
    expect(state.doc!.variables.map((item) => item.name)).toEqual(['a', 'b'])
  })

  it('m580_fb_delete_variable deletes once and reports unknown ids', async () => {
    load()
    const bridge = createBridge()
    const target = state.doc!.variables.find((item) => item.name === 'a')!

    const deleted = await bridge.callTool('m580_fb_delete_variable', { id: target.id })
    expect(deleted).toEqual({ ok: true, result: { deleted: target.id } })
    expect(state.doc!.variables.map((item) => item.name)).toEqual(['b'])

    const again = await bridge.callTool('m580_fb_delete_variable', { id: target.id })
    expect(again.ok).toBe(false)
    expect(again.error).toContain('不存在')

    const missing = await bridge.callTool('m580_fb_delete_variable')
    expect(missing).toEqual({ ok: false, error: '缺少必需参数：id' })
  })

  it('m580_fb_get_source returns ST source and read-only XML source', async () => {
    load()
    const bridge = createBridge()
    const stSection = state.doc!.sections[0]
    const xmlSection = state.doc!.sections[1]

    const st = await bridge.callTool('m580_fb_get_source', { sectionId: stSection.id })
    expect(st).toMatchObject({
      ok: true,
      result: { sectionId: stSection.id, language: 'ST', readOnly: false }
    })
    expect((st.result as { source: string }).source).toContain('fbPulse();')

    const active = await bridge.callTool('m580_fb_get_source')
    expect(active).toMatchObject({ ok: true, result: { sectionId: stSection.id } })

    const xml = await bridge.callTool('m580_fb_get_source', { sectionId: xmlSection.id })
    expect(xml).toMatchObject({ ok: true, result: { language: 'XML', readOnly: true } })
    expect((xml.result as { source: string }).source).toContain('<FBD>')

    const missing = await bridge.callTool('m580_fb_get_source', { sectionId: 'sec-404' })
    expect(missing).toEqual({ ok: false, error: '程序段 sec-404 不存在' })
  })

  it('m580_fb_set_source writes ST source and refreshes calls', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]
    expect(state.calls.map((call) => call.name)).toEqual(['fbPulse'])

    const response = await bridge.callTool('m580_fb_set_source', {
      sectionId: section.id,
      source: 'xNewCall();'
    })
    expect(response).toMatchObject({
      ok: true,
      result: { sectionId: section.id, length: 11, dirty: true, callCount: 1 }
    })
    expect(state.doc!.sections[0].stSource).toBe('xNewCall();')
    expect(state.calls.map((call) => call.name)).toEqual(['xNewCall'])
  })

  it('m580_fb_set_source rejects non-ST sections, unknown sections and invalid input', async () => {
    load()
    const bridge = createBridge()
    const stSection = state.doc!.sections[0]
    const xmlSection = state.doc!.sections[1]
    const xmlBefore = xmlSection.xmlSource

    const nonSt = await bridge.callTool('m580_fb_set_source', {
      sectionId: xmlSection.id,
      source: 'b := 2;'
    })
    expect(nonSt).toEqual({ ok: false, error: '非 ST 程序段为只读，不能写入 ST 源码' })
    expect(state.doc!.sections[1].xmlSource).toBe(xmlBefore)

    const unknown = await bridge.callTool('m580_fb_set_source', {
      sectionId: 'sec-404',
      source: 'b := 2;'
    })
    expect(unknown).toEqual({ ok: false, error: '程序段 sec-404 不存在' })

    const missing = await bridge.callTool('m580_fb_set_source', { sectionId: stSection.id })
    expect(missing).toEqual({ ok: false, error: '缺少必需参数：source' })

    const wrongType = await bridge.callTool('m580_fb_set_source', {
      sectionId: stSection.id,
      source: 42 as unknown as string
    })
    expect(wrongType).toEqual({ ok: false, error: '参数 source 必须是字符串' })
    expect(state.doc!.sections[0].stSource).toContain('fbPulse();')
    expect(state.dirty).toBe(false)
  })

  it('m580_fb_insert_snippet inserts an IF template and refreshes calls', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]

    const ifResponse = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      line: 1,
      column: 1,
      kind: 'IF'
    })
    expect(ifResponse).toMatchObject({
      ok: true,
      result: { sectionId: section.id, line: 1, column: 1, callCount: 1 }
    })
    expect(state.doc!.sections[0].stSource).toBe(
      'IF xCondition THEN\n    \nEND_IF;\na := 1;\nfbPulse();'
    )
    expect(state.calls.map((call) => call.name)).toEqual(['fbPulse'])
  })

  it('m580_fb_insert_snippet inserts a FOR template at the requested line', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]

    const forResponse = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      line: 2,
      column: 1,
      kind: 'FOR'
    })
    expect(forResponse.ok).toBe(true)
    expect(state.doc!.sections[0].stSource).toBe(
      'a := 1;\nFOR iIndex := 0 TO 9 DO\n    \nEND_FOR;\nfbPulse();'
    )
    expect(state.calls.map((call) => call.name)).toEqual(['fbPulse'])
  })

  it('m580_fb_insert_snippet inserts literal source at the requested position', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]

    const inline = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      line: 1,
      column: 8,
      source: ' (* tail *)'
    })
    expect(inline.ok).toBe(true)
    expect(state.doc!.sections[0].stSource).toBe('a := 1; (* tail *)\nfbPulse();')

    const newCall = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      line: 2,
      column: 1,
      source: 'fbExtra();\n'
    })
    expect(newCall).toMatchObject({ ok: true, result: { line: 2, column: 1, callCount: 2 } })
    expect(state.doc!.sections[0].stSource).toBe(
      'a := 1; (* tail *)\nfbExtra();\nfbPulse();'
    )
    expect(state.calls.map((call) => call.name)).toEqual(['fbExtra', 'fbPulse'])
  })

  it('m580_fb_insert_snippet rejects illegal parameters and leaves the source untouched', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]
    const xmlSection = state.doc!.sections[1]
    const before = section.stSource

    const both = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      source: 'x();',
      kind: 'IF'
    })
    expect(both).toEqual({ ok: false, error: 'source 与 kind 只能提供一个' })

    const neither = await bridge.callTool('m580_fb_insert_snippet', { sectionId: section.id })
    expect(neither).toEqual({ ok: false, error: '需要提供 source 或 kind 参数' })

    const badKind = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      kind: 'CASE' as unknown as 'IF'
    })
    expect(badKind.ok).toBe(false)
    expect(badKind.error).toContain('取值必须是 IF|FOR|WHILE')

    const badLine = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      line: 9,
      kind: 'IF'
    })
    expect(badLine).toEqual({ ok: false, error: '行号 9 超出范围 1..2' })

    const badColumn = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      column: 99,
      kind: 'IF'
    })
    expect(badColumn).toEqual({ ok: false, error: '列号 99 超出范围 1..8' })

    const emptySource = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: section.id,
      source: ''
    })
    expect(emptySource).toEqual({ ok: false, error: 'source 不能为空' })

    const nonSt = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: xmlSection.id,
      kind: 'IF'
    })
    expect(nonSt).toEqual({ ok: false, error: '非 ST 程序段为只读，不能插入代码' })

    const unknown = await bridge.callTool('m580_fb_insert_snippet', {
      sectionId: 'sec-404',
      kind: 'IF'
    })
    expect(unknown).toEqual({ ok: false, error: '程序段 sec-404 不存在' })

    expect(state.doc!.sections[0].stSource).toBe(before)
    expect(state.dirty).toBe(false)
  })

  it('m580_fb_analyze_calls parses calls scoped to a section', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]

    const scoped = await bridge.callTool('m580_fb_analyze_calls', { sectionId: section.id })
    expect(scoped.ok).toBe(true)
    expect(
      (scoped.result as Array<{ displayName: string; sectionId: string }>).map(
        (call) => call.displayName
      )
    ).toEqual(['fbPulse'])

    const all = await bridge.callTool('m580_fb_analyze_calls')
    expect((all.result as unknown[]).length).toBe(1)

    const unknown = await bridge.callTool('m580_fb_analyze_calls', { sectionId: 'sec-404' })
    expect(unknown).toEqual({ ok: false, error: '程序段 sec-404 不存在' })
  })

  it('keeps the legacy bridge tools working alongside the aliases', async () => {
    load()
    const bridge = createBridge()
    const section = state.doc!.sections[0]

    await expect(bridge.callTool('m580_get_state')).resolves.toMatchObject({ ok: true })
    const legacySource = await bridge.callTool('m580_get_section', { sectionId: section.id })
    expect(legacySource.ok).toBe(true)

    const write = await bridge.callTool('m580_set_section_source', {
      sectionId: section.id,
      source: 'legacyCall();'
    })
    expect(write.ok).toBe(true)
    expect(state.doc!.sections[0].stSource).toBe('legacyCall();')
    expect(state.calls.map((call) => call.name)).toEqual(['fbPulse'])
  })
})
