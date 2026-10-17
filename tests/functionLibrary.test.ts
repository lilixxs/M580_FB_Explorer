import { describe, expect, it } from 'vitest'
import {
  ALL_LIBRARY_ENTRIES,
  BASE_FUNCTION_LIBRARY,
  BASE_TYPE_LIBRARY,
  CALL_BROWSER_CATEGORIES,
  CONVERSION_TYPE_NAMES,
  ELEMENTARY_VARIABLE_TYPES,
  FUNCTION_LIBRARIES,
  LIBRARY_GROUPS,
  buildArrayType,
  buildArrayTypeChecked,
  buildCallBrowserItems,
  entryCategory,
  findLibraryEntry,
  mergeLibraries,
  parseArrayType,
  parseFunctionLibrary,
  parseTypeLibrary,
  safeParseJson,
  snippetToPlainText,
  type FunctionLibrary
} from '../src/core/functionLibrary'
import { ST_FUNCTION_COMPLETIONS } from '../src/core/st'

const EXPECTED_CONVERSION_TYPES = [
  'BOOL',
  'BYTE',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'WORD',
  'DWORD',
  'REAL',
  'LREAL',
  'TIME',
  'DATE',
  'TOD',
  'TIME_OF_DAY',
  'DT',
  'DATE_AND_TIME',
  'STRING',
  'CHAR',
  'WCHAR',
  'ANY'
]

const REQUIRED_VARIABLE_TYPES = [
  'BOOL',
  'BYTE',
  'SINT',
  'USINT',
  'INT',
  'UINT',
  'DINT',
  'UDINT',
  'LINT',
  'ULINT',
  'WORD',
  'DWORD',
  'REAL',
  'LREAL',
  'TIME',
  'DATE',
  'TOD',
  'DT',
  'STRING',
  'CHAR',
  'WCHAR'
]

describe('base function library JSON', () => {
  it('is a faithful snapshot of ST_FUNCTION_COMPLETIONS', () => {
    expect(BASE_FUNCTION_LIBRARY.entries).toHaveLength(ST_FUNCTION_COMPLETIONS.length)
    expect(BASE_FUNCTION_LIBRARY.entries).toHaveLength(21)
    expect(
      BASE_FUNCTION_LIBRARY.entries.map((entry) => ({
        label: entry.label,
        kind: entry.kind,
        detail: entry.detail,
        insertText: entry.insertText
      }))
    ).toEqual(ST_FUNCTION_COMPLETIONS)
  })

  it('keeps 3 EFs, 8 functions and 10 EFBs and documents itself as a snapshot', () => {
    const counts = { ef: 0, efb: 0, function: 0 }
    for (const entry of BASE_FUNCTION_LIBRARY.entries) counts[entry.kind] += 1
    expect(counts).toEqual({ ef: 3, efb: 10, function: 8 })
    expect(BASE_FUNCTION_LIBRARY.name).toContain('基础')
    expect(BASE_FUNCTION_LIBRARY.version).toBe('base-1.0.0')
    expect(BASE_FUNCTION_LIBRARY.note).toContain('快照')
    expect(BASE_FUNCTION_LIBRARY.note).toContain('不包含')
  })

  it('exposes every entry through the merged catalogue with library provenance', () => {
    expect(ALL_LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(21)
    for (const entry of BASE_FUNCTION_LIBRARY.entries) {
      expect(findLibraryEntry(entry.label)?.library).toBe(BASE_FUNCTION_LIBRARY.name)
    }
    expect(FUNCTION_LIBRARIES).toContain(BASE_FUNCTION_LIBRARY)
    expect(new Set(ALL_LIBRARY_ENTRIES.map((entry) => entry.label.toUpperCase())).size).toBe(ALL_LIBRARY_ENTRIES.length)
    expect(ALL_LIBRARY_ENTRIES.every((entry) => LIBRARY_GROUPS.some((group) => group.id === entry.group))).toBe(true)
  })
})

describe('base type library JSON', () => {
  it('carries the 24 conversion type names used for <TYPE>_TO_<TYPE>', () => {
    expect(BASE_TYPE_LIBRARY.conversionTypes).toEqual(EXPECTED_CONVERSION_TYPES)
    for (const name of EXPECTED_CONVERSION_TYPES) expect(CONVERSION_TYPE_NAMES.has(name)).toBe(true)
    expect(CONVERSION_TYPE_NAMES.size).toBe(24)
  })

  it('offers the required quick pick variable types', () => {
    for (const name of REQUIRED_VARIABLE_TYPES) expect(ELEMENTARY_VARIABLE_TYPES).toContain(name)
    expect(ELEMENTARY_VARIABLE_TYPES).toHaveLength(22)
    expect(BASE_TYPE_LIBRARY.definitions.find((item) => item.name === 'BOOL')?.description).toContain('1字节')
    expect(BASE_TYPE_LIBRARY.definitions.find((item) => item.name === 'DINT')?.verified).toBe(true)
    expect(BASE_TYPE_LIBRARY.definitions.find((item) => item.name === 'LREAL')?.verified).not.toBe(true)
  })
})

describe('safe parsing', () => {
  it('normalizes type presets and removes duplicate or invalid names', () => {
    expect(parseTypeLibrary({ conversionTypes: [' int ', 'INT', 'bad name'], variablePresets: ['bool', 'BOOL', 1] })).toMatchObject({
      conversionTypes: ['INT'], variablePresets: ['BOOL']
    })
    expect(parseTypeLibrary({ conversionTypes: ['bad name'], variablePresets: [] })).toBeNull()
  })
  it('returns null instead of throwing on malformed JSON', () => {
    expect(safeParseJson('{ not json')).toBeNull()
    expect(safeParseJson('[1,2,3]')).toEqual([1, 2, 3])
    expect(parseFunctionLibrary(null)).toBeNull()
    expect(parseFunctionLibrary({})).toBeNull()
    expect(parseFunctionLibrary({ name: 'x', entries: [] })).toBeNull()
    expect(parseTypeLibrary('nope')).toBeNull()
    expect(parseTypeLibrary({ conversionTypes: [], variablePresets: [] })).toBeNull()
  })

  it('drops invalid entries but keeps valid ones', () => {
    const parsed = parseFunctionLibrary({
      name: '自定义库',
      version: '9',
      entries: [
        { label: '', kind: 'ef', insertText: 'A()' },
        { label: 'A', kind: 'nope', insertText: 'A()' },
        { label: 'B', kind: 'ef', insertText: '' },
        { label: 'C', kind: 'ef', detail: 'ok', insertText: 'C()' }
      ]
    })
    expect(parsed?.name).toBe('自定义库')
    expect(parsed?.entries.map((entry) => entry.label)).toEqual(['C'])
    expect(parsed?.entries[0].library).toBe('自定义库')
  })
})

describe('catalogue helpers', () => {
  it('passes EFB input and output pin definitions from JSON into browser items', () => {
    expect(findLibraryEntry('SR')?.parameters).toEqual(['S1', 'R'])
    expect(findLibraryEntry('RS')?.outputs).toEqual(['Q1'])
    expect(findLibraryEntry('CTU_DINT')?.parameters).toEqual(['CU', 'R', 'PV'])
    const ton = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, [], 'efb').find(item => item.label === 'TON')!
    expect(ton.parameters).toEqual(['IN', 'PT'])
    expect(ton.outputs).toEqual(['Q', 'ET'])
  })
  it('merges libraries keeping the first entry for a repeated label', () => {
    const first: FunctionLibrary = {
      name: '一张库',
      version: '1',
      note: '',
      entries: [{ label: 'FOO', kind: 'ef', detail: 'first', insertText: 'FOO()', library: '一张库' }]
    }
    const second: FunctionLibrary = {
      name: '二张库',
      version: '1',
      note: '',
      entries: [
        { label: 'foo', kind: 'function', detail: 'second', insertText: 'foo()', library: '二张库' },
        { label: 'BAR', kind: 'efb', detail: 'bar', insertText: 'BAR', library: '二张库' }
      ]
    }
    const merged = mergeLibraries([first, second])
    expect(merged.map((entry) => entry.label)).toEqual(['FOO', 'BAR'])
    expect(merged[0].detail).toBe('first')
  })

  it('finds entries by name case-insensitively', () => {
    expect(findLibraryEntry('read_var')?.label).toBe('READ_VAR')
    expect(findLibraryEntry('  ton ')?.kind).toBe('efb')
    expect(findLibraryEntry('MISSING')).toBeNull()
    expect(findLibraryEntry('')).toBeNull()
  })

  it('maps ef and function to the function category and efb to its own', () => {
    expect(entryCategory(findLibraryEntry('ADDMX')!)).toBe('function')
    expect(entryCategory(findLibraryEntry('LEN_INT')!)).toBe('function')
    expect(entryCategory(findLibraryEntry('TON')!)).toBe('efb')
  })

  it('exposes the five call browser categories in order', () => {
    expect(CALL_BROWSER_CATEGORIES.map((category) => category.id)).toEqual([
      'all',
      'function',
      'efb',
      'sub',
      'custom'
    ])
  })
})

describe('snippet and array helpers', () => {
  it('turns a Monaco snippet into plain ST text', () => {
    const entry = findLibraryEntry('READ_VAR')!
    const text = snippetToPlainText(entry.insertText)
    expect(text).toBe(
      "READ_VAR(ADR := stAddr, OBJ := '%MW', NUM := 0, NB := 1, GEST := aiGest, RECP => aiRecv)"
    )
    expect(text).not.toContain('$')
    expect(snippetToPlainText('TON')).toBe('TON')
  })

  it('round-trips ARRAY types', () => {
    expect(buildArrayType('INT', 0, 9)).toBe('ARRAY[0..9] OF INT')
    expect(buildArrayType('BOOL', '-1', '5')).toBe('ARRAY[-1..5] OF BOOL')
    expect(parseArrayType('ARRAY[0..9] OF INT')).toEqual({ lower: 0, upper: 9, elementType: 'INT' })
    expect(parseArrayType('array[10..20] of myType')).toEqual({
      lower: 10,
      upper: 20,
      elementType: 'myType'
    })
    expect(parseArrayType('INT')).toBeNull()
    expect(parseArrayType('ARRAY[0..9] INT')).toBeNull()
  })

  it('reports clear errors for invalid array input', () => {
    expect(buildArrayTypeChecked('INT', '', '0', '9')).toEqual({ ok: true, typeName: 'ARRAY[0..9] OF INT' })
    expect(buildArrayTypeChecked('INT', '', '9', '0')).toEqual({ ok: false, error: '数组下界不能大于上界' })
    expect(buildArrayTypeChecked('INT', '', 'a', '9')).toEqual({ ok: false, error: '数组上下界必须是整数' })
    expect(buildArrayTypeChecked('', '', '0', '9')).toEqual({ ok: false, error: '元素类型不能为空' })
    expect(buildArrayTypeChecked('INT', 'bad name', '0', '9').ok).toBe(false)
    expect(buildArrayTypeChecked('INT', 'My_Type', '0', '4')).toEqual({
      ok: true,
      typeName: 'ARRAY[0..4] OF My_Type'
    })
    expect(buildArrayTypeChecked('INT', 'STRING[32]', '-2', '5')).toEqual({ ok: true, typeName: 'ARRAY[-2..5] OF STRING[32]' })
    expect(buildArrayTypeChecked('INT', 'ARRAY[0..2] OF INT', '0', '1')).toEqual({ ok: true, typeName: 'ARRAY[0..1] OF ARRAY[0..2] OF INT' })
    expect(buildArrayTypeChecked('INT', '', '0', '999999999999999999999').ok).toBe(false)
  })
})

describe('call browser items', () => {
  const sections = [
    { id: 'sec-1', name: 'Main', language: 'ST' as const },
    { id: 'sec-2', name: 'Interlocks', language: 'XML' as const }
  ]

  it('lists library entries for the function and efb filters', () => {
    const functions = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'function')
    expect(functions.every((item) => item.category === 'function')).toBe(true)
    expect(functions.some((item) => item.label === 'ADDMX')).toBe(true)
    expect(functions.some((item) => item.label === 'TON')).toBe(false)

    const efbs = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'efb')
    expect(efbs.map((item) => item.label)).toContain('TON')
    expect(efbs.every((item) => item.category === 'efb')).toBe(true)
  })

  it('lists ST program sections as sub functions and skips XML sections', () => {
    const subs = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'sub')
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ label: 'Main', insertText: 'Main()', category: 'sub', kind: 'sub' })

    const all = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'all')
    expect(all).toHaveLength(ALL_LIBRARY_ENTRIES.length + 1)
    expect(all.filter((item) => item.category === 'custom')).toHaveLength(0)
  })

  it('filters by a free text query', () => {
    const hits = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'all', 'read')
    expect(hits.map((item) => item.label)).toEqual(['READ_VAR'])
    expect(buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections, 'all', 'zzz')).toHaveLength(0)
  })
})
