import { describe, expect, it } from 'vitest'
import {
  buildSnippet,
  extractRawCalls,
  formatSt,
  isBuiltinFunction,
  maskCommentsAndStrings,
  replaceAllSource,
  searchSource,
  ST_FUNCTION_COMPLETIONS,
  stripVarBlocks
} from '../src/core/st'

describe('maskCommentsAndStrings', () => {
  it('blanks comments and strings while keeping offsets and line breaks', () => {
    const source = "x := 1; (* IF ghost *)\ny := 'IF ghost';\n"
    const masked = maskCommentsAndStrings(source)
    expect(masked).toHaveLength(source.length)
    expect(masked.split('\n')).toHaveLength(source.split('\n').length)
    expect(masked).not.toContain('ghost')
    expect(masked).toContain('x := 1;')
    expect(masked).toContain('y := ')
  })

  it('handles nested comments and dollar escapes inside strings', () => {
    const source = "(* a (* b *) c *)\ns := 'it''s'; t := 'a$'b';"
    const masked = maskCommentsAndStrings(source)
    expect(masked).not.toContain('b')
    expect(masked).not.toContain('it')
  })

  it('masks double quoted strings and their dollar escapes', () => {
    const source = 's := "a$"(* b"; f := 1;'
    const masked = maskCommentsAndStrings(source)
    expect(masked).toHaveLength(source.length)
    expect(masked).not.toContain('b')
    expect(masked).toContain('f := 1;')
  })

  it('keeps the empty string from swallowing the rest of the line', () => {
    const masked = maskCommentsAndStrings("s := ''; x := 1;")
    expect(masked).toContain('x := 1;')
    expect(masked.slice(5, 7)).toBe('  ')
  })

  it('preserves CRLF offsets', () => {
    const source = "a := 1;\r\nb := 'x';\r\n"
    const masked = maskCommentsAndStrings(source)
    expect(masked).toHaveLength(source.length)
    expect(masked.split('\r\n')).toHaveLength(source.split('\r\n').length)
    expect(masked).toContain("b := ")
  })
})

describe('formatSt', () => {
  it('uppercases keywords and indents blocks with four spaces', () => {
    const source = [
      'if x then',
      'i := 1;',
      'elsif y then',
      '(* IF inside comment must stay *)',
      'i := 2;',
      'else',
      'for j := 0 to 9 do',
      'i := i + j;',
      'end_for;',
      'end_if;'
    ].join('\n')
    const formatted = formatSt(source)
    expect(formatted).toBe(
      [
        'IF x THEN',
        '    i := 1;',
        'ELSIF y THEN',
        '    (* IF inside comment must stay *)',
        '    i := 2;',
        'ELSE',
        '    FOR j := 0 TO 9 DO',
        '        i := i + j;',
        '    END_FOR;',
        'END_IF;'
      ].join('\n')
    )
  })

  it('keeps single line constructs balanced and lowercases time prefixes', () => {
    const formatted = formatSt('IF a THEN b := 1; END_IF;\nc := T#100ms;\nwhile x do\nx := 0;\nend_while;')
    expect(formatted).toBe(
      ['IF a THEN b := 1; END_IF;', 'c := t#100ms;', 'WHILE x DO', '    x := 0;', 'END_WHILE;'].join('\n')
    )
  })

  it('lowercases every duration and date literal prefix', () => {
    const source = [
      'a := T#1h30m;',
      'b := TIME#2s;',
      'c := TOD#09:00:00;',
      'd := TIME_OF_DAY#09:00:00;',
      'e := DT#2026-10-17-09:00:00;',
      'f := DATE_AND_TIME#2026-10-17-09:00:00;',
      'g := D#2026-10-17;',
      'h := DATE#2026-10-17;'
    ].join('\n')
    const formatted = formatSt(source)
    expect(formatted).toBe(
      [
        'a := t#1h30m;',
        'b := time#2s;',
        'c := tod#09:00:00;',
        'd := time_of_day#09:00:00;',
        'e := dt#2026-10-17-09:00:00;',
        'f := date_and_time#2026-10-17-09:00:00;',
        'g := d#2026-10-17;',
        'h := date#2026-10-17;'
      ].join('\n')
    )
  })

  it('copies multi line comment bodies byte for byte', () => {
    const source = ['IF x THEN', '    (* 第一行', '  第二行   保留  ', '*)', '    y := 1;', 'END_IF;'].join('\n')
    expect(formatSt(source)).toBe(
      ['IF x THEN', '    (* 第一行', '  第二行   保留  ', '*)', '    y := 1;', 'END_IF;'].join('\n')
    )
  })

  it('never rewrites string contents or multi character operators', () => {
    const source = ["  if x then  ", "    s := 'IF a THEN  x  ';", '    b:=a<>c;', '    t:=f();', '  end_if;'].join(
      '\n'
    )
    expect(formatSt(source)).toBe(
      ['IF x THEN', "    s := 'IF a THEN  x  ';", '    b:=a<>c;', '    t:=f();', 'END_IF;'].join('\n')
    )
  })

  it('indents REPEAT blocks and is idempotent', () => {
    const once = formatSt('repeat\nx := x + 1;\nuntil x > 9\nend_repeat;')
    expect(once).toBe(['REPEAT', '    x := x + 1;', 'UNTIL x > 9', 'END_REPEAT;'].join('\n'))
    expect(formatSt(once)).toBe(once)
  })

  it('normalizes CRLF input to LF', () => {
    expect(formatSt('if x then\r\ny := 1;\r\nend_if;')).toBe(['IF x THEN', '    y := 1;', 'END_IF;'].join('\n'))
  })
})

describe('stripVarBlocks', () => {
  it('removes declaration blocks but keeps statements', () => {
    const result = stripVarBlocks('VAR_INPUT\n  x : BOOL;\nEND_VAR\n\nx := TRUE;\nVAR\ni : INT;\nEND_VAR')
    expect(result.removed).toBe(2)
    expect(result.source).toContain('x := TRUE;')
    expect(result.source).not.toContain('BOOL')
    expect(result.source).not.toContain('END_VAR')
  })

  it('ignores VAR words inside comments', () => {
    const result = stripVarBlocks('(* VAR fake END_VAR *)\nx := 1;')
    expect(result.removed).toBe(0)
    expect(result.source).toContain('x := 1;')
  })
})

describe('extractRawCalls', () => {
  it('recognizes official operator function forms without counting infix operators', () => {
    const calls = extractRawCalls('x := AND(a, b); y := a AND (b); z := MOD(a, b); q := NOT(x); IF (q) THEN END_IF;')
    expect(calls.map(call => call.name)).toEqual(['AND', 'MOD', 'NOT'])
    expect(extractRawCalls('x := a AND (matrix[i,j] > 0);')).toEqual([])
  })
  it('finds calls outside comments and strings and skips keywords', () => {
    const source = [
      '(* ghostCall( *)',
      "s := 'text(' ;",
      'fbClient(x := 1);',
      'iState := INT_TO_STRING(3);',
      'IF (x) THEN',
      'tonRun(IN := xRun, PT := t#2s);',
      'stAddr := ADDMX(IN := sTargetAddr);',
      'END_IF;'
    ].join('\n')
    const calls = extractRawCalls(source)
    expect(calls.map((call) => call.name)).toEqual([
      'fbClient',
      'INT_TO_STRING',
      'tonRun',
      'ADDMX'
    ])
    expect(calls[0].line).toBe(3)
    expect(calls[0].column).toBe(1)
    expect(calls[3].line).toBe(7)
  })

  it('captures instance method style calls with an owner', () => {
    const calls = extractRawCalls('obj.Method(1);\ninst(2);')
    expect(calls[0]).toMatchObject({ owner: 'obj', name: 'Method', line: 1 })
    expect(calls[1]).toMatchObject({ owner: '', name: 'inst', line: 2 })
  })

  it('reports nested calls independently', () => {
    const calls = extractRawCalls('f(g(x), h(i));')
    expect(calls.map((call) => call.name)).toEqual(['f', 'g', 'h'])
    expect(calls[1]).toMatchObject({ owner: '', line: 1, column: 3 })
  })

  it('never joins a CRLF line break into one call', () => {
    const calls = extractRawCalls('obj\r\n.Method(1);')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: 'Method', owner: '', line: 2, column: 2 })
  })

  it('counts CRLF line and column positions', () => {
    const calls = extractRawCalls('a := 1;\r\nbuf := READ_VAR(ADR := stAddr);\r\n')
    expect(calls[0]).toMatchObject({ name: 'READ_VAR', line: 2, column: 8 })
  })

  it('ignores pseudo calls in escaped and doubled-quote strings', () => {
    const source = [
      '(* f( *)',
      "s := 'a$'(b'; g(1);",
      'u := "h(2)"; k(3);',
      "v := 'a''(b'; m(4);"
    ].join('\r\n')
    expect(extractRawCalls(source).map((call) => call.name)).toEqual(['g', 'k', 'm'])
  })

  it('classifies library functions without assuming unknown names', () => {
    expect(isBuiltinFunction('ADDMX')).toBe(true)
    expect(isBuiltinFunction('READ_VAR')).toBe(true)
    expect(isBuiltinFunction('ton')).toBe(true)
    expect(isBuiltinFunction('INT_TO_STRING')).toBe(true)
    expect(isBuiltinFunction('string_to_int')).toBe(true)
    expect(isBuiltinFunction('FOO_TO_BAR')).toBe(false)
    expect(isBuiltinFunction('OBJ_TOOL')).toBe(false)
  })
})

describe('function completion catalog', () => {
  const labels = ST_FUNCTION_COMPLETIONS.map((item) => item.label)

  it('covers the required elementary functions, EFs and EFBs', () => {
    for (const name of [
      'ADDMX',
      'READ_VAR',
      'WRITE_VAR',
      'LEN_INT',
      'LEFT_INT',
      'RIGHT_INT',
      'CONCAT_STR',
      'INT_TO_STRING',
      'TON',
      'R_TRIG'
    ]) {
      expect(labels).toContain(name)
    }
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('inserts named argument snippets for EFs and bare type names for EFBs', () => {
    const readVar = ST_FUNCTION_COMPLETIONS.find((item) => item.label === 'READ_VAR')
    expect(readVar).toBeDefined()
    expect(readVar?.detail).toContain('READ_VAR')
    expect(readVar?.insertText).toContain('GEST :=')
    expect(readVar?.insertText).toContain('RECP =>')

    const ton = ST_FUNCTION_COMPLETIONS.find((item) => item.label === 'TON')
    expect(ton?.kind).toBe('efb')
    expect(ton?.insertText).toBe('TON')
  })
})

describe('searchSource and replaceAllSource', () => {
  const source = "NAME := 1;\nname := 2;\nother := 'name';"

  it('searches case sensitively and by whole word', () => {
    expect(searchSource(source, 'name').matches).toHaveLength(3)
    expect(searchSource(source, 'NAME', { caseSensitive: true, wholeWord: true }).matches).toHaveLength(1)
    expect(searchSource(source, 'nam', { wholeWord: true }).matches).toHaveLength(0)
  })

  it('reports invalid regular expressions instead of throwing', () => {
    expect(searchSource(source, '(', { useRegex: true }).error).toContain('正则表达式无效')
  })

  it('replaces all literal and regex occurrences', () => {
    const literal = replaceAllSource(source, 'name', 'value', { caseSensitive: true })
    expect(literal.count).toBe(2)
    expect(literal.text).toContain('NAME := 1;')
    expect(literal.text).toContain('value := 2;')

    const regex = replaceAllSource('x1 := 1; x2 := 2;', 'x(\\d)', 'y$1', { useRegex: true })
    expect(regex.count).toBe(2)
    expect(regex.text).toBe('y1 := 1; y2 := 2;')
  })

  it('reports line and column for matches', () => {
    const result = searchSource(source, 'other')
    expect(result.matches[0]).toMatchObject({ line: 3, column: 1 })
  })

  it('strips the CR from match previews', () => {
    const result = searchSource('a := 1;\r\nb := 2;\r\n', 'b')
    expect(result.matches[0].preview).toBe('b := 2;')
  })
})

describe('buildSnippet', () => {
  it('builds IF/FOR/WHILE blocks with a caret placeholder', () => {
    const ifSnippet = buildSnippet('IF', '    ')
    expect(ifSnippet.text).toBe(['IF xCondition THEN', '        ', '    END_IF;'].join('\n'))
    expect(ifSnippet.text.slice(ifSnippet.cursorOffset, ifSnippet.cursorOffset + 10)).toBe('xCondition')

    expect(buildSnippet('FOR', '').text).toContain('FOR iIndex := 0 TO 9 DO')
    expect(buildSnippet('WHILE', '').text).toContain('WHILE xCondition DO')
  })
})
