/**
 * Help sources are the repository README files, one per interface language.
 *
 * `README.md` is the Simplified Chinese document that GitHub shows by default; the other four
 * files carry the same structure in their own language. The interface renders the README of the
 * active language, so the README files are the only manual help source. Keep no separate help copy.
 */
import type { LocaleCode } from '../i18n'

/** README file that carries the help text of each interface language. */
export const HELP_README_FILES: Readonly<Record<LocaleCode, string>> = {
  'zh-CN': 'README.md',
  en: 'README.en.md',
  'zh-TW': 'README.zh-TW.md',
  ja: 'README.ja.md',
  ko: 'README.ko.md'
}

/**
 * Every README in the repository root, keyed by its path.
 *
 * The glob is resolved at build time. A README that is not written yet is simply not matched, so
 * the fallback in `getHelpMarkdown` decides what the page shows instead of failing to load.
 */
const readmeDocuments = import.meta.glob('../../README*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>

/** Document content keyed by file name, because the glob keys carry a relative directory. */
const documentsByFileName: ReadonlyMap<string, string> = new Map(
  Object.entries(readmeDocuments).map(([path, content]) => [
    path.slice(path.lastIndexOf('/') + 1),
    content
  ])
)

/**
 * Help text of one language.
 *
 * An unknown language or a README that is missing falls back to Simplified Chinese. A missing
 * default help stops the build or the load instead of publishing an empty help drawer.
 */
export function getHelpMarkdown(language: string): string {
  const fileName = HELP_README_FILES[language as LocaleCode]
  const localized = fileName === undefined ? undefined : documentsByFileName.get(fileName)
  if (localized?.trim()) return localized
  const fallback = documentsByFileName.get(HELP_README_FILES['zh-CN'])
  if (!fallback?.trim()) throw new Error('Missing default help document: README.md')
  return fallback
}

/** Compatibility exports for tooling and the existing help tests. */
export const HELP_MARKDOWN = getHelpMarkdown('zh-CN')
export const README_MARKDOWN = getHelpMarkdown('en')
