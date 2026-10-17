import { i18n, locale } from './i18n'

/** Translate bundled library descriptions without parsing them as message templates.
 * Exact matching leaves user identifiers, ST snippets and unknown text unchanged.
 */
export function localize(text: string): string {
  const messages = i18n.global.getLocaleMessage(locale.value) as {
    core?: { labels?: Record<string, string> }
  }
  return messages.core?.labels?.[text] ?? text
}
