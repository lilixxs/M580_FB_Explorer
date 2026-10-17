import { describe, expect, it } from 'vitest'
import { DEMO_XDB, DEMO_XST } from '../src/data/demo'
import { ExportValidationError, buildXdb } from '../src/core/exportXdb'
import { parseExchange } from '../src/core/parseExchange'
import type { ParsedDocument, VariableDef } from '../src/types'
import { parseXml } from '../src/core/xml'

const FIXED_DATE = new Date(2026, 0, 2, 3, 4, 5)

function parse(xml: string) {
  return parseXml(xml)
}

describe('buildXdb', () => {
  it('writes a Unity Pro compatible FBExchangeFile', () => {
    const doc = parseExchange(DEMO_XDB, 'LGF_DemoMotor.xdb')
    const result = buildXdb(doc, { now: FIXED_DATE })
    expect(result.fileName).toBe('LGF_DemoMotor.xdb')

    const xml = result.xml
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(xml).not.toMatch(/\/>/)

    const tree = parse(xml)
    const root = tree.documentElement
    expect(root.tagName).toBe('FBExchangeFile')
    const header = root.getElementsByTagName('fileHeader')[0]
    expect(header.getAttribute('company')).toBe('Schneider Automation')
    expect(header.getAttribute('product')).toBe('Unity Pro XL V13.1 - 180823C')
    expect(header.getAttribute('content')).toBe('功能块源文件')
    expect(header.getAttribute('DTDVersion')).toBe('41')
    expect(header.getAttribute('dateTime')).toBe('date_and_time#2026-01-02-03:04:05')

    const fbSource = root.getElementsByTagName('FBSource')[0]
    expect(fbSource.getAttribute('nameOfFBType')).toBe('LGF_DemoMotor')
    expect(fbSource.getAttribute('dateTime')).toBe('dt#2026-01-02-03:04:05')

    const inputPins = Array.from(
      root.getElementsByTagName('inputParameters')[0].getElementsByTagName('variables')
    ).map((element) => element.getElementsByTagName('attribute')[0].getAttribute('value'))
    expect(inputPins).toEqual(['1', '2', '3'])

    const outputPins = Array.from(
      root.getElementsByTagName('outputParameters')[0].getElementsByTagName('variables')
    ).map((element) => element.getElementsByTagName('attribute')[0].getAttribute('value'))
    expect(outputPins).toEqual(['1', '2'])

    const publicVars = root.getElementsByTagName('publicLocalVariables')[0]
    const iState = Array.from(publicVars.getElementsByTagName('variables')).find(
      (element) => element.getAttribute('name') === 'iState'
    )
    expect(iState?.getElementsByTagName('variableInit')[0].getAttribute('value')).toBe('0')

    const tonRun = Array.from(
      root.getElementsByTagName('privateLocalVariables')[0].getElementsByTagName('variables')
    ).find((element) => element.getAttribute('name') === 'tonRun')
    expect(tonRun?.getElementsByTagName('variableInit')).toHaveLength(0)
    expect(tonRun?.getElementsByTagName('comment')).toHaveLength(1)

    const stSource = root.getElementsByTagName('STSource')[0].textContent ?? ''
    expect(stSource).toContain('rtStart(CLK := xStart);')
    expect(stSource).not.toMatch(/\bVAR\b/)
    expect(stSource).toContain('\n')
  })

  it('aligns odd 32 bit %MW addresses and reports a warning', () => {
    const doc = parseExchange(DEMO_XST, 'Demo_Main.xst')
    const oddVariable = doc.variables.find((variable) => variable.name === 'iSpeedSet')
    expect(oddVariable).toBeDefined()
    oddVariable!.topologicalAddress = '%MW101'

    const result = buildXdb(doc, { now: FIXED_DATE })
    expect(result.warnings.length).toBeGreaterThan(0)

    const tree = parse(result.xml)
    const speedSet = Array.from(tree.getElementsByTagName('variables')).find(
      (element) => element.getAttribute('name') === 'iSpeedSet'
    )
    expect(speedSet?.getAttribute('topologicalAddress')).toBe('%MW102')
    expect(speedSet?.getAttribute('typeName')).toBe('DINT')
  })

  it('strips VAR declaration blocks from ST sources', () => {
    const doc = parseExchange(DEMO_XDB, 'LGF_DemoMotor.xdb')
    doc.sections[0].stSource = `VAR\n    iTmp : INT;\nEND_VAR\n\niTmp := 1;`
    const result = buildXdb(doc, { now: FIXED_DATE })
    expect(result.warnings.some((warning) => warning.includes('VAR 声明区'))).toBe(true)
    const tree = parse(result.xml)
    const stSource = tree.getElementsByTagName('STSource')[0].textContent ?? ''
    expect(stSource).toContain('iTmp := 1;')
    expect(stSource).not.toMatch(/END_VAR/)
  })

  it('keeps non-ST program XML and merges globals into private variables', () => {
    const doc = parseExchange(DEMO_XST, 'Demo_Main.xst')
    const result = buildXdb(doc, { now: FIXED_DATE })
    expect(result.warnings.some((warning) => warning.includes('并入 privateLocalVariables'))).toBe(true)

    const tree = parse(result.xml)
    const programs = Array.from(tree.getElementsByTagName('FBProgram'))
    expect(programs.map((program) => program.getAttribute('name'))).toEqual(['Demo_Main', 'Demo_Interlocks'])
    expect(programs[1].getElementsByTagName('FBD')).toHaveLength(1)
    expect(programs[1].getElementsByTagName('identProgram')).toHaveLength(0)

    const privateVars = Array.from(tree.getElementsByTagName('privateLocalVariables')[0].getElementsByTagName('variables'))
    expect(privateVars.map((element) => element.getAttribute('name'))).toContain('fbMotor')
    expect(privateVars.map((element) => element.getAttribute('name'))).toContain('iSpeedRef')
    const speed = privateVars.find((element) => element.getAttribute('name') === 'iSpeedRef')
    expect(speed?.getElementsByTagName('variableInit')[0]?.getAttribute('value')).toBe('1500')
  })

  it('rejects invalid names and duplicate variables', () => {
    const doc = parseExchange(DEMO_XDB, 'LGF_DemoMotor.xdb')
    const bad = doc.variables[0]
    bad.name = 'x-Start'
    expect(() => buildXdb(doc, { now: FIXED_DATE })).toThrow(ExportValidationError)

    const doc2 = parseExchange(DEMO_XDB, 'LGF_DemoMotor.xdb')
    const duplicate: VariableDef = { ...doc2.variables[0], id: 'dup', category: 'PRIVATE' }
    doc2.variables.push(duplicate)
    expect(() => buildXdb(doc2, { now: FIXED_DATE })).toThrow(/重复/)
  })

  it('omits empty addresses and comments', () => {
    const doc: ParsedDocument = {
      kind: 'xdb',
      fileName: 'unit.xdb',
      rootTag: 'FBExchangeFile',
      projectName: 'P',
      fileVersion: '0.0.1',
      fbName: 'Unit_FB',
      fbVersion: '1.30',
      comment: '',
      sections: [
        {
          id: 'sec-1',
          index: 0,
          name: 'Unit_FB',
          programType: 'FBProgram',
          task: '',
          language: 'ST',
          stSource: 'x := 1;',
          xmlSource: '',
          isFBProgram: true
        }
      ],
      variables: [
        {
          id: 'var-1',
          name: 'x',
          typeName: 'BOOL',
          category: 'IN',
          topologicalAddress: '',
          defaultValue: '',
          comment: '',
          initValue: '',
          positionPin: null
        }
      ],
      warnings: [],
      rawXml: ''
    }
    const result = buildXdb(doc, { now: FIXED_DATE })
    const tree = parse(result.xml)
    const variable = tree.getElementsByTagName('variables')[0]
    expect(variable.hasAttribute('topologicalAddress')).toBe(false)
    expect(variable.getElementsByTagName('comment')).toHaveLength(0)
    expect(tree.getElementsByTagName('FBSource')[0].getElementsByTagName('comment')).toHaveLength(0)
  })

  it('produces a structural FBProgram when the source file has no section', () => {
    const doc = parseExchange(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VariablesExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" content="变量源文件" DTDVersion="41"></fileHeader><contentHeader name="P" version="0.0.1"></contentHeader><dataBlock><variables name="Speed" typeName="INT" topologicalAddress="%MW100"></variables></dataBlock></VariablesExchangeFile>`,
      'vars.xsy'
    )
    const result = buildXdb(doc, { now: FIXED_DATE })
    expect(result.warnings.some((warning) => warning.includes('不含程序段'))).toBe(true)
    expect(result.warnings.some((warning) => warning.includes('并入 privateLocalVariables'))).toBe(true)
    const tree = parse(result.xml)
    const programs = tree.getElementsByTagName('FBProgram')
    expect(programs).toHaveLength(1)
    expect(programs[0].getElementsByTagName('STSource')).toHaveLength(1)
    expect(tree.getElementsByTagName('privateLocalVariables')[0].getElementsByTagName('variables')).toHaveLength(1)
  })
})
