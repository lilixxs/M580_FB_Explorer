import { describe, expect, it } from 'vitest'
import { DEMO_XST } from '../src/data/demo'
import { parseExchange } from '../src/core/parseExchange'
import { countProgramNodes, setSectionSource } from '../src/core/serialize'

describe('setSectionSource', () => {
  it('writes the ST body back and keeps other nodes untouched', () => {
    const doc = parseExchange(DEMO_XST, 'Demo_Main.xst')
    const newSource = 'iStep := 42;\n(* replaced *)'
    const updated = setSectionSource(DEMO_XST, 0, newSource)

    const reparsed = parseExchange(updated, 'Demo_Main.xst')
    expect(reparsed.sections).toHaveLength(2)
    expect(reparsed.sections[0].stSource).toBe(newSource)
    expect(reparsed.sections[1].language).toBe('XML')
    expect(reparsed.sections[1].xmlSource).toContain('<FBD>')
    expect(reparsed.variables).toHaveLength(doc.variables.length)
    expect(reparsed.variables.map((variable) => variable.name)).toEqual(
      doc.variables.map((variable) => variable.name)
    )
  })

  it('creates an STSource node when a non-ST program gains one and rejects unknown indexes', () => {
    const updated = setSectionSource(DEMO_XST, 1, 'x := 1;')
    const reparsed = parseExchange(updated, 'Demo_Main.xst')
    expect(reparsed.sections[1].language).toBe('ST')
    expect(reparsed.sections[1].stSource).toBe('x := 1;')
    expect(countProgramNodes(DEMO_XST)).toBe(2)
    expect(() => setSectionSource(DEMO_XST, 9, 'x := 1;')).toThrow(/找不到序号/)
  })
})
