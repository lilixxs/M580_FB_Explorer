import { describe, expect, it } from 'vitest'
import catalogueJson from '../src/data/reference/standard-catalogue.json'
import standardJson from '../src/data/functionLibraries/standard.json'
import {
  ALL_LIBRARY_ENTRIES,
  BASE_FUNCTION_LIBRARY,
  FUNCTION_LIBRARIES,
  LIBRARY_GROUPS,
  buildCallBrowserItems,
  entryCategory,
  findLibraryEntry,
  parseFunctionLibrary,
  snippetToPlainText,
  type FunctionLibrary
} from '../src/core/functionLibrary'

/**
 * Official EcoStruxure Control Expert Standard Block Library (33002519.20, 09/2020).
 *
 * The catalogue under src/data/reference/ mirrors the official table of contents; the library under
 * src/data/functionLibraries/ carries the entries that were read in the PDF body. Both files are
 * data-only: no PDF is parsed at test time, so every claim below is checked against the recorded
 * page anchors.
 */
const catalogue = catalogueJson
const standard = standardJson
const PDF_FILE = '33002519_K01_000_20.pdf'

interface CatalogueChapter {
  number: number
  page: number
  title: string
  functionNames: string[]
  wildcard: boolean
}

const chapters: CatalogueChapter[] = catalogue.chapters
const EXPECTED_PART_IDS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII']
const EXPECTED_PART_TITLES = [
  'General information',
  'Arrays',
  'CLC_INT',
  'Comparison',
  'Date & Time',
  'Extract',
  'Logic',
  'Mathematics',
  'REF',
  'Statistical',
  'Strings',
  'Timer & Counter',
  'Type to type'
]

const APPENDIX_PAGE = catalogue.otherSections.find((section) => section.title.startsWith('Appendix A'))?.page ?? 501

/** Inclusive page range of a chapter: its own start page up to the page before the next chapter. */
function chapterRange(index: number): { from: number; to: number } {
  const next = chapters[index + 1]
  return { from: chapters[index].page, to: next ? next.page - 1 : APPENDIX_PAGE - 1 }
}

function chapterOfPage(page: number): CatalogueChapter | null {
  for (let index = 0; index < chapters.length; index += 1) {
    const range = chapterRange(index)
    if (page >= range.from && page <= range.to) return chapters[index]
  }
  return null
}

function pageNumber(source: string): number {
  const match = /#page=(\d+)$/.exec(source)
  return match ? Number.parseInt(match[1], 10) : Number.NaN
}

const parsedStandard: FunctionLibrary | null = parseFunctionLibrary(standard)

describe('official catalogue (33002519.20)', () => {
  it('lists chapters 1..162 without a gap or a duplicate', () => {
    const numbers = chapters.map((chapter) => chapter.number)
    expect(numbers).toHaveLength(162)
    expect(numbers).toEqual(Array.from({ length: 162 }, (_, index) => index + 1))
  })

  it('keeps the thirteen parts with the documented roman ids, titles and chapter split', () => {
    expect(catalogue.parts.map((part) => part.id)).toEqual(EXPECTED_PART_IDS)
    expect(catalogue.parts.map((part) => part.title)).toEqual(EXPECTED_PART_TITLES)
    expect(catalogue.partCount).toBe(EXPECTED_PART_IDS.length)
    expect(catalogue.parts.reduce((sum, part) => sum + part.chapters.length, 0)).toBe(162)
    // Every chapter belongs to exactly one part: the union of the parts is 1..162 with no repeat.
    const assigned = catalogue.parts.flatMap((part) => part.chapters)
    expect([...assigned].sort((a, b) => a - b)).toEqual(Array.from({ length: 162 }, (_, index) => index + 1))
    for (const part of catalogue.parts) {
      expect(part.chapterCount).toBe(part.chapters.length)
      expect(part.chapters.length).toBeGreaterThan(0)
      for (const number of part.chapters) {
        const chapter = chapters[number - 1]
        expect(chapter.number).toBe(number)
        expect(chapter.page).toBeGreaterThanOrEqual(part.page)
      }
    }
  })

  it('orders chapters by page and keeps every page inside the document', () => {
    for (let index = 0; index < chapters.length; index += 1) {
      const chapter = chapters[index]
      expect(chapter.page).toBeGreaterThanOrEqual(21)
      expect(chapter.page).toBeLessThanOrEqual(catalogue.pageCount)
      if (index > 0) expect(chapter.page).toBeGreaterThan(chapters[index - 1].page)
      expect(chapter.title.trim()).toBe(chapter.title)
      expect(chapter.title.length).toBeGreaterThan(0)
    }
  })

  it('records the official source, document id, edition, applicability and scope', () => {
    expect(catalogue.source).toContain('download.se.com')
    expect(catalogue.source).toContain(PDF_FILE)
    expect(catalogue.source).not.toContain('#page=')
    expect(catalogue.pageUrlPattern).toContain('#page={page}')
    expect(catalogue.documentId).toBe('33002519.20')
    expect(catalogue.documentReference).toBe('33002519K01000')
    expect(catalogue.edition).toBe('09/2020')
    expect(catalogue.applicability).toContain('15.0')
    expect(catalogue.applicability).toContain('V13.1')
    expect(catalogue.scope).toBe('目录完整，签名未全部核实')
  })

  it('keeps the two same-named MOVE array chapters as separate records', () => {
    const moveArrayChapters = chapters.filter((chapter) => chapter.title.startsWith('MOVE_***_***:'))
    expect(moveArrayChapters).toHaveLength(2)
    expect(new Set(moveArrayChapters.map((chapter) => chapter.page)).size).toBe(2)
    expect(new Set(moveArrayChapters.map((chapter) => chapter.number)).size).toBe(2)
    // The scalar MOVE of the Mathematics part stays a third, independent chapter.
    expect(chapters.filter((chapter) => chapter.title.startsWith('MOVE:')).length).toBe(1)
  })

  it('marks the wildcard chapters so they can stay out of the insert list', () => {
    const wildcardChapters = chapters.filter((chapter) => chapter.wildcard)
    expect(wildcardChapters.length).toBeGreaterThan(0)
    for (const chapter of wildcardChapters) {
      expect(chapter.functionNames.some((name) => name.includes('***'))).toBe(true)
    }
    for (const chapter of chapters.filter((entry) => !entry.wildcard)) {
      expect(chapter.functionNames.every((name) => !name.includes('***'))).toBe(true)
    }
  })

  it('anchors known chapters to the pages read in the PDF', () => {
    expect(chapters[0]).toMatchObject({ number: 1, page: 23, title: 'Block Types and their Applications' })
    expect(chapters[62]).toMatchObject({ number: 63, page: 233, functionNames: ['ABS'] })
    expect(chapters[161]).toMatchObject({ number: 162, page: 497, functionNames: ['***_TO_STRING'] })
    expect(catalogue.otherSections.some((section) => section.page === APPENDIX_PAGE)).toBe(true)
  })
})

describe('official function entries', () => {
  it('is a data-only reference file that the call loader never picks up', () => {
    expect(Array.isArray((catalogue as Record<string, unknown>).entries)).toBe(false)
    const referenceManifests = Object.keys(import.meta.glob('../src/data/reference/*.json'))
    expect(referenceManifests).toContain('../src/data/reference/standard-catalogue.json')
    const libraryManifests = Object.keys(import.meta.glob('../src/data/functionLibraries/*.json'))
    expect(libraryManifests.some((path) => path.includes('standard-catalogue'))).toBe(false)
  })

  it('survives the strict library loader without dropping an entry', () => {
    expect(standard.entries.length).toBeGreaterThanOrEqual(30)
    expect(standard.entries.length).toBeLessThanOrEqual(70)
    expect(parsedStandard).not.toBeNull()
    expect(parsedStandard?.entries).toHaveLength(standard.entries.length)
    expect(parsedStandard?.name).toBe(standard.name)
    expect(parsedStandard?.version).toBe(standard.version)
    expect(parsedStandard?.note).toBe(standard.note)
  })

  it('is wired into the bundled libraries, lookup and call browser categories', () => {
    expect(FUNCTION_LIBRARIES.some((library) => library.name === standard.name)).toBe(true)
    expect(FUNCTION_LIBRARIES.some((library) => library.name === catalogue.title)).toBe(false)
    const probes = ['ABS', 'SHL', 'EQ', 'DELETE_INT', 'SQRT_REAL', 'CTU_DINT']
    for (const label of probes) {
      const entry = findLibraryEntry(label)
      expect(entry, label).not.toBeNull()
      expect(entry?.library).toBe(standard.name)
    }
    const functions = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, [], 'function')
    expect(functions.some((item) => item.label === 'ABS' && item.category === 'function')).toBe(true)
    expect(functions.some((item) => item.label === 'SHL' && item.category === 'function')).toBe(true)
    expect(functions.some((item) => item.label === 'CTU_DINT')).toBe(false)
    const efbs = buildCallBrowserItems(ALL_LIBRARY_ENTRIES, [], 'efb')
    expect(efbs.some((item) => item.label === 'CTU_DINT' && item.category === 'efb')).toBe(true)
    expect(entryCategory(findLibraryEntry('CTU_DINT')!)).toBe('efb')
  })

  it('keeps unique labels, known groups and every template usable', () => {
    const labels = standard.entries.map((entry) => entry.label)
    expect(new Set(labels.map((label) => label.toUpperCase())).size).toBe(labels.length)
    const groupIds = LIBRARY_GROUPS.map((group) => group.id)
    for (const entry of standard.entries) {
      expect(entry.label).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
      expect(groupIds).toContain(entry.group)
      expect(entry.insertText.length).toBeGreaterThan(0)
      expect(entry.detail.length).toBeGreaterThan(0)
      expect(entry.insertText).not.toContain('***')
      expect(entry.label).not.toContain('***')
      expect(parsedStandard?.entries.find((parsed) => parsed.label === entry.label)?.group).toBe(entry.group)
      expect(parsedStandard?.entries.find((parsed) => parsed.label === entry.label)?.groupLabel).toBe(
        LIBRARY_GROUPS.find((group) => group.id === entry.group)?.label
      )
    }
  })

  it('never repeats the base snapshot or the communication elementary functions', () => {
    const baseLabels = new Set(BASE_FUNCTION_LIBRARY.entries.map((entry) => entry.label.toUpperCase()))
    for (const entry of standard.entries) {
      expect(baseLabels.has(entry.label.toUpperCase())).toBe(false)
      expect(['ADDMX', 'READ_VAR', 'WRITE_VAR']).not.toContain(entry.label)
      expect(findLibraryEntry(entry.label)?.library).toBe(standard.name)
    }
  })

  it('cites the official PDF page and chapter behind every template', () => {
    expect(catalogue.documentId).toBe('33002519.20')
    expect(standard.version.startsWith(catalogue.documentId)).toBe(true)
    expect(standard.note).toContain('15.0')
    expect(standard.note).toContain('V13.1')
    expect(standard.note).toContain('***')
    for (const entry of standard.entries) {
      expect(entry.source).toContain(PDF_FILE)
      const page = pageNumber(entry.source)
      expect(Number.isFinite(page)).toBe(true)
      expect(page).toBeGreaterThanOrEqual(21)
      expect(page).toBeLessThanOrEqual(catalogue.pageCount)
      const chapterInDetail = /33002519\.20 第(\d+)章/.exec(entry.detail)
      expect(chapterInDetail, entry.label).not.toBeNull()
      const rangeInDetail = /PDF 第(\d+)-(\d+)页/.exec(entry.detail)
      expect(rangeInDetail, entry.label).not.toBeNull()
      // The chapter number and page range written in the entry must agree with the catalogue.
      const chapter = chapterOfPage(page)
      expect(chapter, entry.label).not.toBeNull()
      expect(Number.parseInt(chapterInDetail![1], 10)).toBe(chapter?.number)
      expect(page).toBeGreaterThanOrEqual(Number.parseInt(rangeInDetail![1], 10))
      expect(page).toBeLessThanOrEqual(Number.parseInt(rangeInDetail![2], 10))
    }
  })

  it('inserts expressions with positional placeholders and no result assignment', () => {
    for (const entry of standard.entries.filter((item) => item.kind !== 'efb')) {
      expect(entry.insertText).toMatch(/^[A-Za-z_][A-Za-z0-9_]*\(/)
      expect(entry.insertText.endsWith(')')).toBe(true)
      expect(entry.insertText).toContain('${1')
      expect(entry.insertText).not.toContain(':=')
      expect(entry.insertText).not.toContain('=>')
      expect(snippetToPlainText(entry.insertText)).not.toContain('$')
    }
  })

  it('inserts a function block entry as its type name only', () => {
    const efbs = standard.entries.filter((entry) => entry.kind === 'efb')
    expect(efbs.length).toBeGreaterThanOrEqual(3)
    for (const entry of efbs) {
      expect(entry.insertText).toBe(entry.label)
      expect(entry.detail).toContain('EFB 类型')
      expect(entry.detail).toContain('实例')
      expect(entry.detail).toContain(':=')
      expect(entry.detail).toContain('=>')
      expect(entry.group).toBe('counter')
    }
  })

  it('carries the signatures read in the PDF body', () => {
    const signatures: Record<string, string> = {
      ABS: 'ABS(value)',
      ADD: 'ADD(value1, value2)',
      DIV: 'DIV(dividend, divisor)',
      MOD: 'MOD(dividend, divisor)',
      DIVMOD: 'DIVMOD(dividend, divisor, quotient, modulo)',
      INC: 'INC(value)',
      DEG_TO_RAD: 'DEG_TO_RAD(angleInDegree)',
      ROL: 'ROL(inputPattern, number)',
      SHL: 'SHL(inputPattern, number)',
      AND: 'AND(value_1, value_2)',
      SET: 'SET(bit)',
      RE: 'RE(startButton)',
      EQ: 'EQ(value1, value2)',
      NE: 'NE(value1, value2)',
      LIMIT: 'LIMIT(lowerLimit, input, upperLimit)',
      SEL: 'SEL(selection, input0, input1)',
      MUX: 'MUX(selection, input0, input1)',
      SIN_REAL: 'SIN_REAL(angle)',
      SQRT_REAL: 'SQRT_REAL(value)',
      EXPT_REAL_REAL: 'EXPT_REAL_REAL(value1, exponent)',
      DIVTIME: 'DIVTIME(timeVariable, divisor)',
      ADD_TOD_TIME: 'ADD_TOD_TIME(sourceValue, timeToAdd)',
      SUB_DT_TIME: 'SUB_DT_TIME(sourceValue, timeToSub)',
      DELETE_INT: 'DELETE_INT(string1, lengthStr, position)',
      REPLACE_INT: 'REPLACE_INT(string1, string2, lengthStr, position)',
      BCD_TO_INT: 'BCD_TO_INT(bcdInt)',
      TIME_TO_STRING: 'TIME_TO_STRING(time1)'
    }
    const labels = Object.keys(signatures)
    expect(labels.length).toBeGreaterThanOrEqual(25)
    for (const label of labels) {
      const entry = standard.entries.find((item) => item.label === label)
      expect(entry, label).toBeDefined()
      expect(snippetToPlainText(entry!.insertText), label).toBe(signatures[label])
      expect(entry!.detail).toContain('33002519')
    }
  })

  it('stays free of types that were not read in the PDF', () => {
    for (const entry of standard.entries) {
      expect(entry.insertText).not.toContain('REF')
      expect(entry.insertText).not.toContain('ARRAY')
      expect(entry.label).not.toBe('REF')
      expect(entry.label).not.toBe('EXTRACT')
      expect(entry.label).not.toBe('LIMIT_IND')
      expect(entry.label).not.toBe('SATURATION')
      expect(entry.label).not.toBe('AVE')
    }
  })
})
