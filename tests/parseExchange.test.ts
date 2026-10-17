import { describe, expect, it } from 'vitest'
import { DEMO_XDB, DEMO_XST } from '../src/data/demo'
import { parseExchange } from '../src/core/parseExchange'
import { parseXml } from '../src/core/xml'

const XSY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VariablesExchangeFile><fileHeader company="Schneider Automation" product="Unity Pro XL V13.1 - 180823C" dateTime="date_and_time#2026-10-17-09:00:00" content="变量源文件" DTDVersion="41"></fileHeader><contentHeader name="M580_FB_Explorer" version="0.0.9"></contentHeader><dataBlock><variables name="Speed" typeName="INT" topologicalAddress="%MW100"><comment>速度</comment></variables><variables name="Run" typeName="BOOL" topologicalAddress="%M0" defaultValue="0"></variables></dataBlock></VariablesExchangeFile>`

describe('parseExchange', () => {
  it('parses a .xdb FBExchangeFile into categorised variables and ST sections', () => {
    const doc = parseExchange(DEMO_XDB, 'LGF_DemoMotor.xdb')
    expect(doc.kind).toBe('xdb')
    expect(doc.rootTag).toBe('FBExchangeFile')
    expect(doc.fbName).toBe('LGF_DemoMotor')
    expect(doc.fbVersion).toBe('1.30')
    expect(doc.projectName).toBe('M580_FB_Explorer')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0].language).toBe('ST')
    expect(doc.sections[0].stSource).toContain('rtStart(CLK := xStart);')
    expect(doc.sections[0].stSource.startsWith('(*')).toBe(true)

    const byCategory = (category: string) => doc.variables.filter((variable) => variable.category === category)
    expect(byCategory('IN').map((v) => v.name)).toEqual(['xStart', 'xStop', 'iSpeedRef'])
    expect(byCategory('OUT').map((v) => v.name)).toEqual(['xRun', 'iCode'])
    expect(byCategory('PUBLIC').map((v) => v.name)).toEqual(['iState', 'iSpeedAct'])
    expect(byCategory('PRIVATE').map((v) => v.name)).toEqual(['tonRun', 'rtStart', 'iSpeedLimit'])

    const xStart = doc.variables.find((variable) => variable.name === 'xStart')
    expect(xStart?.positionPin).toBe(1)
    expect(xStart?.comment).toBe('启动命令，上升沿有效')

    const iSpeedLimit = doc.variables.find((variable) => variable.name === 'iSpeedLimit')
    expect(iSpeedLimit?.initValue).toBe('1500')
    expect(iSpeedLimit?.positionPin).toBeNull()
  })

  it('parses a .xst with an ST section, a non-ST section and global variables', () => {
    const doc = parseExchange(DEMO_XST, 'Demo_Main.xst')
    expect(doc.kind).toBe('xst')
    expect(doc.sections).toHaveLength(2)
    expect(doc.sections[0].name).toBe('Demo_Main')
    expect(doc.sections[0].language).toBe('ST')
    expect(doc.sections[0].task).toBe('MAST')
    expect(doc.sections[1].name).toBe('Demo_Interlocks')
    expect(doc.sections[1].language).toBe('XML')
    expect(doc.sections[1].xmlSource).toContain('<FBD>')
    expect(doc.sections[1].xmlSource).toContain('identProgram')

    expect(doc.variables).toHaveLength(13)
    expect(doc.variables.every((variable) => variable.category === 'GLOBAL')).toBe(true)
    const speed = doc.variables.find((variable) => variable.name === 'iSpeedRef')
    expect(speed?.defaultValue).toBe('1500')
    expect(speed?.topologicalAddress).toBe('%MW100')

    // Demo data ships even aligned 32 bit addresses now, so the odd address warning is
    // checked with an explicit fixture instead of depending on demo values.
    const oddDoc = parseExchange(DEMO_XST.replace('%MW102', '%MW101'), 'Odd.xst')
    expect(oddDoc.warnings.some((warning) => warning.includes('iSpeedSet'))).toBe(true)
  })

  it('parses a .xsy variable only file', () => {
    const doc = parseExchange(XSY, 'vars.xsy')
    expect(doc.kind).toBe('xsy')
    expect(doc.sections).toHaveLength(0)
    expect(doc.warnings.some((warning) => warning.includes('未找到可编辑的程序段'))).toBe(true)
    expect(doc.variables.map((variable) => variable.name)).toEqual(['Speed', 'Run'])
    expect(doc.variables[1].defaultValue).toBe('0')
  })

  it('rejects malformed XML and unknown roots', () => {
    expect(() => parseExchange('<FBExchangeFile><FBSource>', 'broken.xdb')).toThrow(/XML 解析失败/)
    expect(() => parseExchange('<Unknown/>', 'other.xml')).toThrow(/不支持的根节点/)
    expect(() => parseXml('<a><b></a>')).toThrow()
  })
})
