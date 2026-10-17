/**
 * External function/type library access.
 *
 * JSON files contain the legacy completion snapshot and separately sourced library entries.
 * Adding a function manifest in the data directory includes it in the next build.
 * These catalogues do not replace Control Expert's platform and version checks.
 */

import baseLibraryJson from '../data/functionLibraries/base.json'
import typeLibraryJson from '../data/functionLibraries/types.json'
import { t } from '../i18n'
import type { ProgramSection } from '../types'
import { validateTypeName } from './validation'

export type LibraryFunctionKind = 'ef' | 'efb' | 'function'

/** Category shown in the call browser left column. */
export type CallLibraryCategory = 'function' | 'efb' | 'sub' | 'custom'

/** Category filter shown in the call browser left column; `all` is the default. */
export type CallBrowserFilter = 'all' | CallLibraryCategory

export interface LibraryFunctionEntry {
  label: string
  kind: LibraryFunctionKind
  detail: string
  insertText: string
  /** Library name the entry came from. */
  library: string
  group?: string
  groupLabel?: string
  source?: string
  parameters?: string[]
  outputs?: string[]
}

export interface FunctionLibrary {
  name: string
  version: string
  note: string
  entries: LibraryFunctionEntry[]
}

export interface TypeLibrary {
  name: string
  version: string
  note: string
  /** Names accepted on both sides of `<TYPE>_TO_<TYPE>`. */
  conversionTypes: string[]
  /** Elementary types offered by the variable type picker. */
  variablePresets: string[]
  definitions: Array<{ name: string; verified: boolean; description: string; source: string }>
}

export interface CallBrowserItem {
  id: string
  label: string
  kind: LibraryFunctionKind | 'sub' | 'custom'
  category: CallLibraryCategory
  detail: string
  /** Plain text inserted into the ST source. */
  insertText: string
  source: string
  group?: string
  groupLabel?: string
  parameters?: string[]
  outputs?: string[]
}

export interface CallInsertPayload {
  label: string
  kind: LibraryFunctionKind | 'sub' | 'custom'
  text: string
}

export interface ArrayTypeParts {
  lower: number
  upper: number
  elementType: string
}

const LIBRARY_KINDS: LibraryFunctionKind[] = ['ef', 'efb', 'function']

export const LIBRARY_GROUPS: Array<{ id: string; label: string }> = [
  { id: 'arithmetic', label: '算术函数' },
  { id: 'numerical', label: '数值函数' },
  { id: 'comparison', label: '比较函数' },
  { id: 'selection', label: '选择函数' },
  { id: 'bit-string', label: '位串函数' },
  { id: 'string', label: '字符串函数' },
  { id: 'conversion', label: '类型转换' },
  { id: 'timer', label: '定时器' },
  { id: 'counter', label: '计数器' },
  { id: 'edge', label: '边沿检测' },
  { id: 'bistable', label: '双稳态' },
  { id: 'communication', label: '通信库' },
  { id: 'other', label: '其他库' }
]

function legacyEntryGroup(label: string): string {
  if (['ADDMX', 'READ_VAR', 'WRITE_VAR'].includes(label)) return 'communication'
  if (['TON', 'TOF', 'TP'].includes(label)) return 'timer'
  if (['CTU', 'CTD', 'CTUD'].includes(label)) return 'counter'
  if (['R_TRIG', 'F_TRIG'].includes(label)) return 'edge'
  if (['SR', 'RS'].includes(label)) return 'bistable'
  if (label.includes('_TO_')) return 'conversion'
  if (['LEN_INT', 'LEFT_INT', 'RIGHT_INT', 'CONCAT_STR'].includes(label)) return 'string'
  return 'other'
}

export function isLibraryFunctionKind(value: unknown): value is LibraryFunctionKind {
  return typeof value === 'string' && (LIBRARY_KINDS as string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key]
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key]
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) result.push(item.trim())
  }
  return result
}

/** Parse JSON text without throwing; malformed input returns null. */
export function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Build a library from untrusted data.
 *
 * Entries with a missing label, an unknown kind or empty insert text are dropped, so one bad
 * record never discards the whole library. Returns null when nothing usable remains.
 */
export function parseFunctionLibrary(raw: unknown): FunctionLibrary | null {
  if (!isRecord(raw)) return null
  const name = readString(raw, 'name') || '未命名函数库'
  const list = Array.isArray(raw.entries) ? raw.entries : []
  const entries: LibraryFunctionEntry[] = []
  for (const item of list) {
    if (!isRecord(item)) continue
    const label = readString(item, 'label')
    const detail = readString(item, 'detail')
    const insertText = readString(item, 'insertText')
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label) || !isLibraryFunctionKind(item.kind) || !insertText) continue
    const group = readString(item, 'group') || legacyEntryGroup(label.toUpperCase())
    entries.push({
      label, kind: item.kind, detail, insertText, library: name, group,
      groupLabel: LIBRARY_GROUPS.find((entry) => entry.id === group)?.label || group,
      source: readString(item, 'source'),
      parameters: Array.isArray(item.parameters) ? readStringArray(item, 'parameters') : undefined,
      outputs: Array.isArray(item.outputs) ? readStringArray(item, 'outputs') : undefined
    })
  }
  if (entries.length === 0) return null
  return {
    name,
    version: readString(raw, 'version') || '0',
    note: readString(raw, 'note'),
    entries
  }
}

/** Build a type library from untrusted data; returns null when no type name survives. */
export function parseTypeLibrary(raw: unknown): TypeLibrary | null {
  if (!isRecord(raw)) return null
  const cleanTypes = (key: string): string[] => Array.from(new Set(readStringArray(raw, key)
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)).map((name) => name.toUpperCase())))
  const conversionTypes = cleanTypes('conversionTypes')
  const variablePresets = cleanTypes('variablePresets')
  if (conversionTypes.length === 0 && variablePresets.length === 0) return null
  return {
    name: readString(raw, 'name') || '未命名类型库',
    version: readString(raw, 'version') || '0',
    note: readString(raw, 'note'),
    conversionTypes,
    variablePresets,
    definitions: Array.isArray(raw.definitions) ? raw.definitions.filter(isRecord).map((item) => ({
      name: readString(item, 'name'), verified: item.verified === true,
      description: readString(item, 'description'), source: readString(item, 'source')
    })).filter((item) => item.name && item.description) : []
  }
}

const EMPTY_FUNCTION_LIBRARY: FunctionLibrary = {
  name: '基础函数库',
  version: '0',
  note: '',
  entries: []
}

const EMPTY_TYPE_LIBRARY: TypeLibrary = {
  name: '基础类型库',
  version: '0',
  note: '',
  conversionTypes: [],
  variablePresets: [],
  definitions: []
}

export const BASE_FUNCTION_LIBRARY: FunctionLibrary =
  parseFunctionLibrary(baseLibraryJson) ?? EMPTY_FUNCTION_LIBRARY

export const BASE_TYPE_LIBRARY: TypeLibrary = parseTypeLibrary(typeLibraryJson) ?? EMPTY_TYPE_LIBRARY

/** Elementary types offered by the variable type picker. */
export const ELEMENTARY_VARIABLE_TYPES: string[] = BASE_TYPE_LIBRARY.variablePresets

/** Names accepted on both sides of `<TYPE>_TO_<TYPE>`; used for builtin call classification. */
export const CONVERSION_TYPE_NAMES: ReadonlySet<string> = new Set(BASE_TYPE_LIBRARY.conversionTypes)

/** Merge libraries in order; the first entry wins for a repeated label. */
export function mergeLibraries(libraries: FunctionLibrary[]): LibraryFunctionEntry[] {
  const merged: LibraryFunctionEntry[] = []
  const seen = new Set<string>()
  for (const library of libraries) {
    for (const entry of library.entries) {
      const key = entry.label.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ ...entry, library: library.name })
    }
  }
  return merged
}

const bundledManifests = import.meta.glob('../data/functionLibraries/*.json', { eager: true, import: 'default' })

/** The legacy snapshot keeps precedence so adding a library cannot silently change old calls. */
export const FUNCTION_LIBRARIES: FunctionLibrary[] = [BASE_FUNCTION_LIBRARY]
for (const [path, raw] of Object.entries(bundledManifests).sort(([a], [b]) => a.localeCompare(b))) {
  if (path.endsWith('/base.json') || path.endsWith('/types.json')) continue
  const parsed = parseFunctionLibrary(raw)
  if (!parsed) throw new Error(t('core.functionLibrary.noValidEntries', { path }))
  if (isRecord(raw) && Array.isArray(raw.entries) && parsed.entries.length !== raw.entries.length) {
    throw new Error(t('core.functionLibrary.invalidEntries', { path }))
  }
  FUNCTION_LIBRARIES.push(parsed)
}

export const ALL_LIBRARY_ENTRIES: LibraryFunctionEntry[] = mergeLibraries(FUNCTION_LIBRARIES)

/** Case-insensitive lookup by function or FB type name. */
export function findLibraryEntry(
  name: string,
  entries: LibraryFunctionEntry[] = ALL_LIBRARY_ENTRIES
): LibraryFunctionEntry | null {
  const key = name.trim().toUpperCase()
  if (!key) return null
  return entries.find((entry) => entry.label.toUpperCase() === key) ?? null
}

/** `ef` and `function` share the `函数` category; `efb` has its own. */
export function entryCategory(entry: LibraryFunctionEntry): CallLibraryCategory {
  return entry.kind === 'efb' ? 'efb' : 'function'
}

export const LIBRARY_CATEGORY_LABELS: Record<CallLibraryCategory, string> = {
  function: '函数',
  efb: '功能块',
  sub: '子函数',
  custom: '自定义调用'
}

export const CALL_BROWSER_CATEGORIES: Array<{ id: CallBrowserFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'function', label: '函数' },
  { id: 'efb', label: '功能块' },
  { id: 'sub', label: '子函数' },
  { id: 'custom', label: '自定义调用' }
]

/** Turn a Monaco snippet literal into plain ST text for `executeEdits`/textarea insertion. */
export function snippetToPlainText(insertText: string): string {
  return insertText
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '')
}

const ARRAY_TYPE_RE = /^\s*ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s+(.+?)\s*$/i

/** Parse `ARRAY[lower..upper] OF type`; returns null for anything else. */
export function parseArrayType(typeName: string): ArrayTypeParts | null {
  const match = ARRAY_TYPE_RE.exec(typeName)
  if (!match) return null
  return {
    lower: Number.parseInt(match[1], 10),
    upper: Number.parseInt(match[2], 10),
    elementType: match[3]
  }
}

export function buildArrayType(elementType: string, lower: number | string, upper: number | string): string {
  return `ARRAY[${String(lower).trim()}..${String(upper).trim()}] OF ${elementType.trim()}`
}

export function isElementaryVariableType(typeName: string): boolean {
  return ELEMENTARY_VARIABLE_TYPES.includes(typeName.trim().toUpperCase())
}

/** Build an `ARRAY[..] OF ..` type name, or return an error message for the picker. */
export function buildArrayTypeChecked(
  elementType: string,
  customElementType: string,
  lower: string,
  upper: string
): { ok: true; typeName: string } | { ok: false; error: string } {
  const element = (customElementType.trim() || elementType.trim()).trim()
  if (!element) return { ok: false, error: t('core.functionLibrary.arrayElementEmpty') }
  if (validateTypeName(element)) {
    return { ok: false, error: t('core.functionLibrary.arrayElementInvalid') }
  }
  const lowerText = lower.trim()
  const upperText = upper.trim()
  if (!/^-?\d+$/.test(lowerText) || !/^-?\d+$/.test(upperText)) {
    return { ok: false, error: t('core.functionLibrary.arrayBoundsNotInteger') }
  }
  const lowerValue = Number.parseInt(lowerText, 10)
  const upperValue = Number.parseInt(upperText, 10)
  if (!Number.isSafeInteger(lowerValue) || !Number.isSafeInteger(upperValue)) {
    return { ok: false, error: t('core.functionLibrary.arrayBoundsRange') }
  }
  if (lowerValue > upperValue) return { ok: false, error: t('core.functionLibrary.arrayBoundsOrder') }
  return { ok: true, typeName: buildArrayType(element, lowerValue, upperValue) }
}

/** Sub-functions come from the ST program sections of the current document. */
export function buildSubFunctionItems(
  sections: Array<Pick<ProgramSection, 'id' | 'name' | 'language'>>
): CallBrowserItem[] {
  return sections
    .filter((section) => section.language === 'ST')
    .map((section) => ({
      id: `sub-${section.id}`,
      label: section.name,
      kind: 'sub' as const,
      category: 'sub' as const,
      detail: t('core.functionLibrary.subFunctionDetail', { name: section.name }),
      insertText: `${section.name}()`,
      source: t('core.functionLibrary.sectionSource')
    }))
}

/**
 * Build the entries shown in the call browser right column.
 *
 * Library entries cover `all`/`function`/`efb`; ST program sections cover `sub`. The custom
 * category is rendered as a form by the dialog and produces no list items here.
 */
export function buildCallBrowserItems(
  entries: LibraryFunctionEntry[],
  sections: Array<Pick<ProgramSection, 'id' | 'name' | 'language'>>,
  filter: CallBrowserFilter,
  query = ''
): CallBrowserItem[] {
  const items: CallBrowserItem[] = []
  if (filter === 'all' || filter === 'function' || filter === 'efb') {
    for (const entry of entries) {
      const category = entryCategory(entry)
      if (filter !== 'all' && filter !== category) continue
      items.push({
        id: `lib-${entry.label}`,
        label: entry.label,
        kind: entry.kind,
        category,
        detail: entry.detail,
        insertText: snippetToPlainText(entry.insertText),
        source: entry.library,
        group: entry.group,
        groupLabel: entry.groupLabel,
        parameters: entry.parameters,
        outputs: entry.outputs
      })
    }
  }
  if (filter === 'all' || filter === 'sub') items.push(...buildSubFunctionItems(sections))

  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) =>
    `${item.label} ${item.detail} ${item.source}`.toLowerCase().includes(needle)
  )
}
