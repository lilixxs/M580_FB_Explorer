/** Help sources live outside the components, one Markdown file per language. */
import readme from '../../README.en.md?raw'
const documents = import.meta.glob('../../requirements/localization/help/*.md', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>

export function getHelpMarkdown(language: string): string {
  const localized = documents[`../../requirements/localization/help/${language}.md`]
  if (localized?.trim()) return localized
  const fallback = documents['../../requirements/localization/help/zh-CN.md']
  // 默认帮助缺失时停止构建或加载，避免发布空白帮助。
  if (!fallback?.trim()) throw new Error('Missing default help document: zh-CN.md')
  return fallback
}

/** Compatibility exports for tooling and the existing help tests. */
export const HELP_MARKDOWN = getHelpMarkdown('zh-CN')
export const README_MARKDOWN = readme
