/** Structured Text helpers: masking, formatting, call extraction, search and snippets. */
import { t } from '../i18n'
import { findLibraryEntry, CONVERSION_TYPE_NAMES as LIBRARY_CONVERSION_TYPE_NAMES } from './functionLibrary'

export const ST_KEYWORDS: string[] = [
  'IF',
  'THEN',
  'ELSIF',
  'ELSE',
  'END_IF',
  'CASE',
  'OF',
  'END_CASE',
  'FOR',
  'TO',
  'BY',
  'DO',
  'END_FOR',
  'WHILE',
  'END_WHILE',
  'REPEAT',
  'UNTIL',
  'END_REPEAT',
  'RETURN',
  'EXIT',
  'CONTINUE',
  'AND',
  'OR',
  'XOR',
  'NOT',
  'MOD',
  'TRUE',
  'FALSE',
  'VAR',
  'VAR_INPUT',
  'VAR_OUTPUT',
  'VAR_IN_OUT',
  'VAR_GLOBAL',
  'VAR_TEMP',
  'VAR_EXTERNAL',
  'VAR_CONFIG',
  'END_VAR',
  'ARRAY',
  'STRUCT',
  'END_STRUCT',
  'TYPE',
  'END_TYPE',
  'FUNCTION',
  'END_FUNCTION',
  'FUNCTION_BLOCK',
  'END_FUNCTION_BLOCK',
  'PROGRAM',
  'END_PROGRAM',
  'RETAIN',
  'NON_RETAIN',
  'CONSTANT',
  'AT'
]

export const ST_KEYWORD_SET = new Set(ST_KEYWORDS)

export type StFunctionKind = 'ef' | 'efb' | 'function'

export interface StFunctionCompletion {
  /** Name inserted by the completion provider, also used as the visible label. */
  label: string
  /** Elementary function, elementary function block type, or conversion function. */
  kind: StFunctionKind
  /** Signature or usage note shown in the suggestion widget. */
  detail: string
  /** Snippet text. Placeholders use the Monaco snippet syntax. */
  insertText: string
}

/**
 * Names offered by the editor completion provider.
 *
 * Signatures follow the Schneider Control Expert ST library and the call style used by
 * `src/ModbusTCP_Client.st` (named arguments, `GEST` bound to a dedicated INT array).
 * Function block entries insert the type name only: an ST program must declare an instance
 * before it can call `tonRun(IN := ..., PT := ...)`.
 */
export const ST_FUNCTION_COMPLETIONS: StFunctionCompletion[] = [
  {
    label: 'ADDMX',
    kind: 'ef',
    detail: 'ADDMX(IN : STRING) : ADDMX_TYPE  解析链路地址',
    insertText: 'ADDMX(IN := ${1:sLinkAddress})'
  },
  {
    label: 'READ_VAR',
    kind: 'ef',
    detail: 'READ_VAR(ADR, OBJ, NUM, NB, GEST, RECP =>)  读 %MW',
    insertText:
      "READ_VAR(ADR := ${1:stAddr}, OBJ := ${2:'%MW'}, NUM := ${3:0}, NB := ${4:1}, GEST := ${5:aiGest}, RECP => ${6:aiRecv})"
  },
  {
    label: 'WRITE_VAR',
    kind: 'ef',
    detail: 'WRITE_VAR(ADR, OBJ, NUM, NB, EMIS, GEST)  写 %MW',
    insertText:
      "WRITE_VAR(ADR := ${1:stAddr}, OBJ := ${2:'%MW'}, NUM := ${3:0}, NB := ${4:1}, EMIS := ${5:aiEmis}, GEST := ${6:aiGest})"
  },
  {
    label: 'LEN_INT',
    kind: 'function',
    detail: 'LEN_INT(IN : STRING) : INT  字符串长度',
    insertText: 'LEN_INT(IN := ${1:sText})'
  },
  {
    label: 'LEFT_INT',
    kind: 'function',
    detail: 'LEFT_INT(IN : STRING, N : INT) : STRING  取左侧 N 个字符',
    insertText: 'LEFT_INT(IN := ${1:sText}, N := ${2:1})'
  },
  {
    label: 'RIGHT_INT',
    kind: 'function',
    detail: 'RIGHT_INT(IN : STRING, N : INT) : STRING  取右侧 N 个字符',
    insertText: 'RIGHT_INT(IN := ${1:sText}, N := ${2:1})'
  },
  {
    label: 'CONCAT_STR',
    kind: 'function',
    detail: 'CONCAT_STR(IN1 : STRING, IN2 : STRING) : STRING  拼接两个字符串',
    insertText: 'CONCAT_STR(IN1 := ${1:sLeft}, IN2 := ${2:sRight})'
  },
  {
    label: 'INT_TO_STRING',
    kind: 'function',
    detail: 'INT_TO_STRING(IN : INT) : STRING  整数转字符串',
    insertText: 'INT_TO_STRING(${1:iValue})'
  },
  {
    label: 'INT_TO_REAL',
    kind: 'function',
    detail: 'INT_TO_REAL(IN : INT) : REAL',
    insertText: 'INT_TO_REAL(${1:iValue})'
  },
  {
    label: 'REAL_TO_INT',
    kind: 'function',
    detail: 'REAL_TO_INT(IN : REAL) : INT',
    insertText: 'REAL_TO_INT(${1:rValue})'
  },
  {
    label: 'STRING_TO_INT',
    kind: 'function',
    detail: 'STRING_TO_INT(IN : STRING) : INT',
    insertText: 'STRING_TO_INT(IN := ${1:sText})'
  },
  {
    label: 'TON',
    kind: 'efb',
    detail: 'EFB 类型：先声明实例，再按 实例(IN := ..., PT := t#2s) 调用',
    insertText: 'TON'
  },
  {
    label: 'TOF',
    kind: 'efb',
    detail: 'EFB 类型：先声明实例，再按 实例(IN := ..., PT := t#2s) 调用',
    insertText: 'TOF'
  },
  {
    label: 'TP',
    kind: 'efb',
    detail: 'EFB 类型：先声明实例，再按 实例(IN := ..., PT := t#2s) 调用',
    insertText: 'TP'
  },
  {
    label: 'R_TRIG',
    kind: 'efb',
    detail: 'EFB 类型：先声明实例，再按 实例(CLK := ...) 调用',
    insertText: 'R_TRIG'
  },
  {
    label: 'F_TRIG',
    kind: 'efb',
    detail: 'EFB 类型：先声明实例，再按 实例(CLK := ...) 调用',
    insertText: 'F_TRIG'
  },
  {
    label: 'SR',
    kind: 'efb',
    detail: 'EFB 类型：置位优先双稳态，实例(S1 := ..., R := ...)',
    insertText: 'SR'
  },
  {
    label: 'RS',
    kind: 'efb',
    detail: 'EFB 类型：复位优先双稳态，实例(S := ..., R1 := ...)',
    insertText: 'RS'
  },
  {
    label: 'CTU',
    kind: 'efb',
    detail: 'EFB 类型：加计数器，实例(CU := ..., R := ..., PV := ...)',
    insertText: 'CTU'
  },
  {
    label: 'CTD',
    kind: 'efb',
    detail: 'EFB 类型：减计数器，实例(CD := ..., LD := ..., PV := ...)',
    insertText: 'CTD'
  },
  {
    label: 'CTUD',
    kind: 'efb',
    detail: 'EFB 类型：加减计数器，实例(CU := ..., CD := ..., R := ..., LD := ..., PV := ...)',
    insertText: 'CTUD'
  }
]

const BUILTIN_FUNCTIONS = new Set([
  'ABS',
  'MIN',
  'MAX',
  'LIMIT',
  'SQRT',
  'EXP',
  'LN',
  'LOG',
  'SIN',
  'COS',
  'TAN',
  'ASIN',
  'ACOS',
  'ATAN',
  'ROUND',
  'TRUNC',
  'INC',
  'DEC',
  'SHL',
  'SHR',
  'ROL',
  'ROR',
  'SWAP',
  'LEN_INT',
  'LEN_STR',
  'CONCAT_STR',
  'LEFT_INT',
  'RIGHT_INT',
  'FIND_INT',
  'MID_INT',
  'LENGTH_ARINT',
  'SIZEOF',
  'EXTRACT',
  'ADR',
  'ADR0',
  'ADDMX',
  'READ_VAR',
  'WRITE_VAR',
  'GET_CURRENT_TIME',
  'WRTC_DT',
  'IS_PAR_CON',
  'TON',
  'TOF',
  'TP',
  'R_TRIG',
  'F_TRIG',
  'SR',
  'RS',
  'CTU',
  'CTD',
  'CTUD'
])

/** Elementary type names accepted on both sides of a `<TYPE>_TO_<TYPE>` conversion name. */
const CONVERSION_TYPE_NAMES = LIBRARY_CONVERSION_TYPE_NAMES

export interface StSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

export interface StSearchMatch {
  start: number
  end: number
  line: number
  column: number
  preview: string
}

export interface RawCall {
  name: string
  owner: string
  index: number
  line: number
  column: number
}

export type SnippetKind = 'IF' | 'FOR' | 'WHILE'

export function blankNonNewlines(text: string): string {
  return text.replace(/[^\n\r]/g, ' ')
}

/** Return the index just past a block comment starting at `start`, honouring nesting. */
function scanBlockComment(source: string, start: number): number {
  let depth = 1
  let index = start + 2
  while (index < source.length) {
    if (source[index] === '(' && source[index + 1] === '*') {
      depth += 1
      index += 2
      continue
    }
    if (source[index] === '*' && source[index + 1] === ')') {
      depth -= 1
      index += 2
      if (depth === 0) return index
      continue
    }
    index += 1
  }
  return source.length
}

/**
 * Return the index just past the string literal starting at `start`.
 *
 * Unity Pro escapes a character with `$` (`$'`, `$$`, `$L`, `$N`, `$T`), and a doubled
 * delimiter also represents an escaped quote. `''` right after the opening quote is the
 * empty string, so it must close instead of swallowing the rest of the line.
 */
function scanString(source: string, start: number, quote: string): number {
  let index = start + 1
  while (index < source.length) {
    const char = source[index]
    if (char === '$') {
      index += 2
      continue
    }
    if (char === quote) {
      if (source[index + 1] === quote && index > start + 1) {
        index += 2
        continue
      }
      return index + 1
    }
    index += 1
  }
  return source.length
}

/** Replace comments and string bodies with spaces, keeping offsets and line breaks intact. */
export function maskCommentsAndStrings(source: string): string {
  let out = ''
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '(' && source[index + 1] === '*') {
      const end = scanBlockComment(source, index)
      out += blankNonNewlines(source.slice(index, end))
      index = end
      continue
    }
    if (char === "'" || char === '"') {
      const end = scanString(source, index, char)
      out += blankNonNewlines(source.slice(index, end))
      index = end
      continue
    }
    out += char
    index += 1
  }
  return out
}

function codeSegments(source: string): Array<{ text: string; isCode: boolean }> {
  const segments: Array<{ text: string; isCode: boolean }> = []
  let index = 0
  let buffer = ''
  while (index < source.length) {
    const char = source[index]
    if (char === '(' && source[index + 1] === '*') {
      if (buffer) segments.push({ text: buffer, isCode: true })
      buffer = ''
      const end = scanBlockComment(source, index)
      segments.push({ text: source.slice(index, end), isCode: false })
      index = end
      continue
    }
    if (char === "'" || char === '"') {
      if (buffer) segments.push({ text: buffer, isCode: true })
      buffer = ''
      const end = scanString(source, index, char)
      segments.push({ text: source.slice(index, end), isCode: false })
      index = end
      continue
    }
    buffer += char
    index += 1
  }
  if (buffer) segments.push({ text: buffer, isCode: true })
  return segments
}

const KEYWORD_PATTERN = new RegExp(
  `\\b(${[...ST_KEYWORDS].sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi'
)

/**
 * Time, duration and date literals keep a lower case prefix. The alternation is ordered
 * longest first so `TIME_OF_DAY#` wins over `TIME#` and `T#`.
 */
const TIME_PREFIX_PATTERN = /\b(TIME_OF_DAY|DATE_AND_TIME|TIME|TOD|DATE|DT|T|D)#/g

export function uppercaseKeywords(source: string): string {
  return codeSegments(source)
    .map((segment) => {
      if (!segment.isCode) return segment.text
      return segment.text
        .replace(KEYWORD_PATTERN, (match) => match.toUpperCase())
        .replace(TIME_PREFIX_PATTERN, (match) => match.toLowerCase())
    })
    .join('')
}

function countMatches(text: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let count = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    count += 1
    if (match.index === re.lastIndex) re.lastIndex += 1
  }
  return count
}

const OPENER_KEYWORDS = new Set(['IF', 'FOR', 'WHILE', 'CASE', 'REPEAT'])
const PRE_DEDENT_KEYWORDS = new Set([
  'END_IF',
  'END_FOR',
  'END_WHILE',
  'END_CASE',
  'END_REPEAT',
  'ELSE',
  'ELSIF',
  'UNTIL'
])

/** Per line flag: `true` when the line begins inside a block comment opened earlier. */
function commentInteriorLines(source: string): boolean[] {
  const flags: boolean[] = [false]
  let depth = 0
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '(' && source[index + 1] === '*') {
      depth += 1
      index += 2
      continue
    }
    if (depth > 0 && char === '*' && source[index + 1] === ')') {
      depth -= 1
      index += 2
      continue
    }
    if (depth === 0 && (char === "'" || char === '"')) {
      const end = scanString(source, index, char)
      for (let cursor = index; cursor < end; cursor += 1) {
        if (source[cursor] === '\n') flags.push(false)
      }
      index = end
      continue
    }
    if (char === '\n') {
      flags.push(depth > 0)
      index += 1
      continue
    }
    index += 1
  }
  return flags
}

/**
 * Conservative ST formatter.
 *
 * It only re-indents lines, uppercases known keywords outside comments and strings, and
 * lowercases the prefix of time/date literals. Text inside strings and comments is copied
 * byte for byte: a line that starts inside a block comment keeps its original indentation,
 * trailing spaces and case. Multi-character operators are never split or re-spaced.
 */
export function formatSt(source: string): string {
  const normalized = source.replace(/\r\n?/g, '\n')
  const cased = uppercaseKeywords(normalized)
  const lines = cased.split('\n')
  const insideComment = commentInteriorLines(cased)
  const output: string[] = []
  let indent = 0
  let previousBlank = false

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index]
    if (insideComment[index] === true) {
      output.push(rawLine)
      previousBlank = false
      continue
    }
    const line = rawLine.replace(/[ \t]+$/, '')
    const trimmed = line.trim()
    if (!trimmed) {
      if (!previousBlank && output.length > 0) output.push('')
      previousBlank = true
      continue
    }
    previousBlank = false
    const masked = maskCommentsAndStrings(trimmed)
    const firstToken = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(masked)?.[1]?.toUpperCase() ?? ''
    const isPreDedent = PRE_DEDENT_KEYWORDS.has(firstToken)
    if (isPreDedent && indent > 0) indent -= 1

    output.push(`${'    '.repeat(indent)}${trimmed}`)

    const remainder = masked.replace(/^\s*[A-Za-z_][A-Za-z0-9_]*/, '')
    let delta = 0
    if (OPENER_KEYWORDS.has(firstToken)) delta += 1
    delta += countMatches(remainder, /\b(IF|FOR|WHILE|CASE|REPEAT)\b/g)
    delta -= countMatches(remainder, /\bEND_(IF|FOR|WHILE|CASE|REPEAT)\b/g)
    if (firstToken === 'ELSE' || firstToken === 'ELSIF') delta += 1
    indent = Math.max(0, indent + delta)
  }

  while (output.length > 0 && output[output.length - 1] === '') output.pop()
  while (output.length > 0 && output[0] === '') output.shift()
  return output.join('\n')
}

export interface StripVarResult {
  source: string
  removed: number
}

/** Remove VAR .. END_VAR declaration blocks; Control Expert STSource must not contain them. */
export function stripVarBlocks(source: string): StripVarResult {
  const masked = maskCommentsAndStrings(source)
  const pattern = /\bVAR(?:_[A-Z_]+)?\b[\s\S]*?\bEND_VAR\b/gi
  const ranges: Array<[number, number]> = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(masked)) !== null) {
    ranges.push([match.index, match.index + match[0].length])
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1
  }
  if (ranges.length === 0) return { source, removed: 0 }

  let result = ''
  let cursor = 0
  for (const [start, end] of ranges) {
    result += source.slice(cursor, start)
    cursor = end
  }
  result += source.slice(cursor)
  result = result.replace(/^\s*\n/, '').replace(/\n\s*$/, '')
  return { source: result, removed: ranges.length }
}

/** Line and column of `index`, counting LF, CRLF and lone CR line breaks. */
export function positionAt(source: string, index: number): { line: number; column: number } {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < index && i < source.length; i += 1) {
    const char = source[i]
    if (char === '\n' || (char === '\r' && source[i + 1] !== '\n')) {
      line += 1
      lastBreak = i
    }
  }
  return { line, column: index - lastBreak }
}

export function isKeyword(name: string): boolean {
  return ST_KEYWORD_SET.has(name.toUpperCase())
}

/**
 * True only for names that are certainly library functions.
 *
 * The `<TYPE>_TO_<TYPE>` shape is accepted only when both sides are known elementary type
 * names, so a user function such as `FOO_TO_BAR` stays an unknown call instead of being
 * reported as a system function.
 */
export function isBuiltinFunction(name: string): boolean {
  const upper = name.toUpperCase()
  if (BUILTIN_FUNCTIONS.has(upper) || findLibraryEntry(upper)) return true
  const conversion = /^([A-Z][A-Z0-9_]*)_TO_([A-Z][A-Z0-9_]*)$/.exec(upper)
  if (!conversion) return false
  return CONVERSION_TYPE_NAMES.has(conversion[1]) && CONVERSION_TYPE_NAMES.has(conversion[2])
}

/**
 * Find every `name(` or `owner.name(` occurrence outside comments and strings.
 *
 * Horizontal whitespace only is allowed around the dot and the parenthesis, so CRLF line
 * breaks never join two lines into one call. Nested calls are reported independently.
 */
export function extractRawCalls(source: string): RawCall[] {
  const masked = maskCommentsAndStrings(source)
  const pattern =
    /(?:(?<owner>[A-Za-z_][A-Za-z0-9_]*)[ \t]*\.[ \t]*)?(?<name>[A-Za-z_][A-Za-z0-9_]*)[ \t]*\(/g
  const calls: RawCall[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(masked)) !== null) {
    const name = match.groups?.name ?? ''
    const owner = match.groups?.owner ?? ''
    if (!name) continue
    if (owner && isKeyword(owner)) continue
    if (!owner && isKeyword(name)) {
      const upper = name.toUpperCase()
      // Operators also have library call forms. A top-level comma distinguishes AND(a,b)
      // from the infix expression a AND (b); NOT has a unary call form.
      let comma = false
      let depth = 1
      let bracket = 0
      if (['AND', 'OR', 'XOR', 'MOD'].includes(upper)) {
        for (let i = pattern.lastIndex; i < masked.length && depth > 0; i += 1) {
          const char = masked[i]
          if (char === '(') depth += 1
          else if (char === ')') depth -= 1
          else if (char === '[') bracket += 1
          else if (char === ']') bracket -= 1
          else if (char === ',' && depth === 1 && bracket === 0) { comma = true; break }
        }
      }
      if (!findLibraryEntry(upper) || !(comma || upper === 'NOT')) continue
    }
    const position = positionAt(source, match.index)
    calls.push({
      name,
      owner,
      index: match.index,
      line: position.line,
      column: position.column
    })
  }
  return calls
}

function buildSearchRegex(query: string, options: StSearchOptions): RegExp {
  const flags = options.caseSensitive ? 'g' : 'gi'
  if (options.useRegex) return new RegExp(query, flags)
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (options.wholeWord) {
    return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, flags)
  }
  return new RegExp(escaped, flags)
}

export function searchSource(
  source: string,
  query: string,
  options: StSearchOptions = {}
): { matches: StSearchMatch[]; error: string } {
  if (!query) return { matches: [], error: '' }
  let regex: RegExp
  try {
    regex = buildSearchRegex(query, options)
  } catch (error) {
    return { matches: [], error: t('core.st.invalidRegex', { message: (error as Error).message }) }
  }
  const matches: StSearchMatch[] = []
  const lines = source.split('\n')
  let match: RegExpExecArray | null
  while ((match = regex.exec(source)) !== null) {
    if (match.index === regex.lastIndex) regex.lastIndex += 1
    const position = positionAt(source, match.index)
    const lineText = (lines[position.line - 1] ?? '').replace(/\r$/, '')
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      line: position.line,
      column: position.column,
      preview: lineText.trim().slice(0, 160)
    })
    if (matches.length >= 5000) break
  }
  return { matches, error: '' }
}

export function replaceAllSource(
  source: string,
  query: string,
  replacement: string,
  options: StSearchOptions = {}
): { text: string; count: number; error: string } {
  if (!query) return { text: source, count: 0, error: '' }
  let regex: RegExp
  try {
    regex = buildSearchRegex(query, options)
  } catch (error) {
    return { text: source, count: 0, error: t('core.st.invalidRegex', { message: (error as Error).message }) }
  }
  let count = 0
  const text = source.replace(regex, (substring: string, ...args: unknown[]) => {
    count += 1
    if (!options.useRegex) return replacement
    const groups = args.slice(0, -2) as Array<string | undefined>
    return replacement.replace(/\$(\d{1,2})/g, (whole, index: string) => {
      const value = groups[Number.parseInt(index, 10) - 1]
      return value === undefined ? whole : value
    })
  })
  return { text, count, error: '' }
}

export function buildSnippet(kind: SnippetKind, indentText: string): { text: string; cursorOffset: number } {
  const inner = `${indentText}    `
  const blocks: Record<SnippetKind, { lines: string[]; placeholder: string }> = {
    IF: { lines: ['IF xCondition THEN', '', 'END_IF;'], placeholder: 'xCondition' },
    FOR: { lines: ['FOR iIndex := 0 TO 9 DO', '', 'END_FOR;'], placeholder: 'iIndex' },
    WHILE: { lines: ['WHILE xCondition DO', '', 'END_WHILE;'], placeholder: 'xCondition' }
  }
  const block = blocks[kind]
  const text = [block.lines[0], inner, ...block.lines.slice(2).map((line) => `${indentText}${line}`)].join('\n')
  return { text, cursorOffset: text.indexOf(block.placeholder) }
}

export const ST_COMPLETION_SNIPPETS: Array<{ label: string; detail: string; insertText: string }> = [
  { label: 'IF', detail: '条件分支', insertText: 'IF ${1:xCondition} THEN\n\t$0\nEND_IF;' },
  { label: 'FOR', detail: '计数循环', insertText: 'FOR ${1:iIndex} := 0 TO ${2:9} DO\n\t$0\nEND_FOR;' },
  { label: 'WHILE', detail: '条件循环', insertText: 'WHILE ${1:xCondition} DO\n\t$0\nEND_WHILE;' },
  { label: 'CASE', detail: '分支选择', insertText: 'CASE ${1:iSelector} OF\n\t$2:\n\t\t$0\nEND_CASE;' }
]
