/**
 * Plain variable reference extraction.
 *
 * A *reference* is one source position where a declared variable is used: read, written, array
 * subscript, struct/index owner, or the instance/callee name of a call. It is deliberately
 * separate from `state.calls`, which keeps the historical "call site" semantics for MCP.
 *
 * Excluded on purpose:
 * - comments and string literals (masked before scanning),
 * - `VAR .. END_VAR` declaration regions (the declaration itself is not a use),
 * - member names after `.` (`tonRun.Q`: `Q` is a field, `tonRun` is the owner reference),
 * - named binding formal parameters inside a call (`tonRun(IN := ...)`: `IN` is not a variable),
 * - typed/based literal prefixes (`t#2s`, `2#0000_0000`) and numeric literals.
 */

import { isKeyword, maskCommentsAndStrings, positionAt } from './st'
import type { VariableAccess } from '../types'

export interface ExtractedVariableReference {
  name: string
  line: number
  column: number
  /** Offset of the identifier start in the scanned source. */
  offset: number
  access: VariableAccess
  /** Trimmed source line, for tooltips and tests. */
  snippet: string
}

interface Token {
  kind: 'ident' | 'other'
  value: string
  start: number
  end: number
}

const IDENT_START_RE = /[A-Za-z_]/
const IDENT_PART_RE = /[A-Za-z0-9_]/

/** Numbers, `%MW` addresses and based literals never start with an identifier character. */
function isLiteralStart(char: string): boolean {
  return char === '%' || (char >= '0' && char <= '9')
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    if (IDENT_START_RE.test(char)) {
      let end = index + 1
      while (end < source.length && IDENT_PART_RE.test(source[end])) end += 1
      tokens.push({ kind: 'ident', value: source.slice(index, end), start: index, end })
      index = end
      continue
    }
    if (isLiteralStart(char)) {
      // Swallow the whole literal so `_` inside `2#0000_0000` never starts an identifier.
      let end = index + 1
      while (end < source.length && /[0-9A-Za-z_.#:%]/.test(source[end])) end += 1
      tokens.push({ kind: 'other', value: source.slice(index, end), start: index, end })
      index = end
      continue
    }
    if ((char === ':' && source[index + 1] === '=') || (char === '=' && source[index + 1] === '>')) {
      tokens.push({ kind: 'other', value: source.slice(index, index + 2), start: index, end: index + 2 })
      index += 2
      continue
    }
    tokens.push({ kind: 'other', value: char, start: index, end: index + 1 })
    index += 1
  }
  return tokens
}

/** Blank out every `VAR .. END_VAR` declaration region, keeping offsets and line breaks. */
function maskDeclarationBlocks(source: string): string {
  return source.replace(/\bVAR(?:_[A-Z_]+)?\b[\s\S]*?\bEND_VAR\b/gi, (region) =>
    region.replace(/[^\n\r]/g, ' ')
  )
}

/**
 * Token index just past a chain of `[...]` subscripts and `.member` accesses.
 *
 * This is what lets `aiGest[0].0 := 1` classify `aiGest` as a write while `aiGest[0].0` in a
 * condition classifies it as a read.
 */
function nextAfterAccessors(tokens: Token[], index: number): Token | null {
  let cursor = index + 1
  while (cursor < tokens.length) {
    const token = tokens[cursor]
    if (token.value === '[') {
      let depth = 1
      cursor += 1
      while (cursor < tokens.length && depth > 0) {
        const inner = tokens[cursor]
        if (inner.value === '[') depth += 1
        else if (inner.value === ']') depth -= 1
        cursor += 1
      }
      continue
    }
    if (token.value === '.' && cursor + 1 < tokens.length) {
      cursor += 2
      continue
    }
    break
  }
  return cursor < tokens.length ? tokens[cursor] : null
}

/**
 * Extract every use of a declared variable from one ST source.
 *
 * `variableNames` holds upper case variable names; matching is case-insensitive like the rest of
 * the ST helpers.
 */
export function extractVariableReferences(
  source: string,
  variableNames: ReadonlySet<string>
): ExtractedVariableReference[] {
  if (!source || variableNames.size === 0) return []
  const masked = maskDeclarationBlocks(maskCommentsAndStrings(source))
  const tokens = tokenize(masked)
  const lines = source.split(/\r\n|\r|\n/)
  const references: ExtractedVariableReference[] = []
  const parenStack: Array<'call' | 'group'> = []

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const previous = index > 0 ? tokens[index - 1] : null

    if (token.kind === 'other') {
      if (token.value === '(') {
        const callLike =
          previous !== null && (previous.kind === 'ident' || previous.value === ')' || previous.value === ']')
        parenStack.push(callLike ? 'call' : 'group')
      } else if (token.value === ')') {
        parenStack.pop()
      }
      continue
    }

    if (isKeyword(token.value)) continue
    if (!variableNames.has(token.value.toUpperCase())) continue
    // `tonRun.Q` / `aiGest[0].0` must not report the member name as a local variable.
    if (previous !== null && previous.value === '.') continue

    const next = nextAfterAccessors(tokens, index)
    // `t#2s`, `TIME#1s`, `INT#5` are typed literals, not variable reads.
    if (next !== null && next.value === '#') continue

    const insideCall = parenStack.length > 0 && parenStack[parenStack.length - 1] === 'call'
    // A named call argument (`IN := x`, `Q => y`) is a formal parameter name, not a use.
    if (insideCall && next !== null && (next.value === ':=' || next.value === '=>')) continue

    let access: VariableAccess = 'read'
    if (next !== null && next.value === '(') access = 'call'
    else if (next !== null && next.value === ':=') access = 'write'
    else if (previous !== null && previous.value === '=>') access = 'write'

    const position = positionAt(source, token.start)
    references.push({
      name: token.value,
      line: position.line,
      column: position.column,
      offset: token.start,
      access,
      snippet: (lines[position.line - 1] ?? '').trim()
    })
  }

  return references
}

/** Reference starting exactly at `line`/`column`, if any. */
export function findVariableReferenceAt(
  source: string,
  variableNames: ReadonlySet<string>,
  line: number,
  column: number
): ExtractedVariableReference | null {
  return (
    extractVariableReferences(source, variableNames).find(
      (reference) => reference.line === line && reference.column === column
    ) ?? null
  )
}
