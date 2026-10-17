/**
 * Single entry point for interface localization.
 *
 * The active composer is addressed through a narrow adapter so the rest of the page never depends
 * on `vue-i18n` generics. `t()` reads the composer locale on every call, which is what makes a
 * template that calls `t()` re-render after `setLocale`: the composer tracks its locale ref inside
 * the calling reactive effect.
 *
 * Nothing here touches the document model, the ST source or the export pipeline. Switching the
 * language changes the interface text, the stored preference and `<html lang>`, and nothing else.
 */
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'

export type LocaleCode = 'zh-CN' | 'en' | 'zh-TW' | 'ja' | 'ko'

/** Language switch entries. `label` is always the language's own endonym. */
export const SUPPORTED_LOCALES: ReadonlyArray<{ value: LocaleCode; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' }
]

export const DEFAULT_LOCALE: LocaleCode = 'zh-CN'

/** Storage key of the remembered language choice. */
export const LOCALE_STORAGE_KEY = 'm580-locale'

type Catalog = Record<string, unknown>

/**
 * Every JSON file in `src/locales` is a catalog of one area:
 *
 * - `<locale>.json` — the base catalog of that language. `zh-CN.json` carries the component area.
 * - `<area>.<locale>.json` — one extra area of that language, for example `app.zh-CN.json`
 *   (top bar, tree, help, new block) or `core.zh-CN.json` (parser, serializer, validation).
 *
 * The glob is resolved at build time and tolerates an absent file: a catalog that is not written
 * yet is simply not matched, so a missing translation never breaks the build.
 */
const catalogFiles = import.meta.glob('./locales/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Catalog
>

interface CatalogFile {
  /** Empty for the base catalog, otherwise the leading name before the locale. */
  area: string
  locale: LocaleCode
}

function parseCatalogFile(path: string): CatalogFile | null {
  const name = path.replace(/^\.\/locales\//, '').replace(/\.json$/, '')
  const separator = name.lastIndexOf('.')
  const locale = separator < 0 ? name : name.slice(separator + 1)
  const known = SUPPORTED_LOCALES.some((entry) => entry.value === locale)
  if (!known) return null
  return { area: separator < 0 ? '' : name.slice(0, separator), locale: locale as LocaleCode }
}

/**
 * Merge every catalog into one message tree.
 *
 * The base `<locale>.json` contributes its namespaces at the root. An area catalog
 * `<area>.<locale>.json` contributes its content under the area name, so `core.zh-CN.json`
 * answers `t('core.exportXdb.…')` and `app.zh-CN.json` answers `t('app.newBlock.title')`.
 *
 * The base catalog is applied first, then the area catalogs in path order, so an area may override
 * a base key. Areas do not share keys today; the order only makes the result deterministic.
 */
function buildMessages(): Record<string, Catalog> {
  const merged: Record<string, Catalog> = {}
  const files: Array<{ path: string; content: Catalog; parsed: CatalogFile }> = []
  for (const [path, content] of Object.entries(catalogFiles)) {
    const parsed = parseCatalogFile(path)
    if (parsed) files.push({ path, content, parsed })
  }
  files.sort((a, b) => {
    const baseA = a.parsed.area === '' ? 0 : 1
    const baseB = b.parsed.area === '' ? 0 : 1
    return baseA - baseB || a.path.localeCompare(b.path)
  })
  for (const file of files) {
    const current = merged[file.parsed.locale] ?? {}
    const area = file.parsed.area
    if (area === '') {
      merged[file.parsed.locale] = { ...current, ...file.content }
      continue
    }
    const existing = current[area]
    const nested = existing !== null && typeof existing === 'object' ? (existing as Catalog) : {}
    merged[file.parsed.locale] = { ...current, [area]: { ...nested, ...file.content } }
  }
  return merged
}

/** The composer surface this module depends on; keeps the vue-i18n generic types out of the page. */
interface ComposerAdapter {
  locale: { value: string }
  t: (key: string, named?: Record<string, unknown>) => unknown
  mergeLocaleMessage: (locale: string, message: Record<string, unknown>) => void
}

function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && SUPPORTED_LOCALES.some((entry) => entry.value === value)
}

function readStoredLocale(): LocaleCode {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_LOCALE
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    return isLocaleCode(raw) ? raw : DEFAULT_LOCALE
  } catch {
    // Storage can be blocked in a sandbox, in a private context or by browser policy.
    return DEFAULT_LOCALE
  }
}

function persistLocale(value: LocaleCode): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(LOCALE_STORAGE_KEY, value)
  } catch {
    // The page keeps working without storage; only the memory of the choice is lost.
  }
}

function applyDocumentLanguage(value: LocaleCode): void {
  try {
    if (typeof document !== 'undefined') document.documentElement.lang = value
  } catch {
    // A non browser host has no document element to label.
  }
}

/** Source of truth of the active language; the exported `locale` ref reads and writes it. */
const activeLocale = ref<LocaleCode>(readStoredLocale())

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: activeLocale.value,
  fallbackLocale: DEFAULT_LOCALE,
  // The catalogs are plain JSON trees whose leaves are resolved at runtime; Vue I18n types its
  // message leaves more narrowly than the loader can express, so the tree passes one narrow cast.
  messages: buildMessages() as unknown as Record<string, Record<string, never>>
})

const composer = i18n.global as unknown as ComposerAdapter

applyDocumentLanguage(activeLocale.value)

/** Active language. Assigning a value routes through the same path as `setLocale`. */
export const locale = computed<LocaleCode>({
  get: () => activeLocale.value,
  set: (value) => {
    setLocale(value)
  }
})

/**
 * Switch the interface language.
 *
 * An unsupported code is ignored, so a stale stored value or a foreign value can never blank the
 * interface. The document and the ST source are left untouched.
 */
export function setLocale(value: string): void {
  if (!isLocaleCode(value)) return
  activeLocale.value = value
  composer.locale.value = value
  persistLocale(value)
  applyDocumentLanguage(value)
}

/**
 * Translate a message key with named parameters.
 *
 * Safe outside a Vue application: the global composer is fully usable without `app.use`, so tests
 * can mount a single component without installing the plugin.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  const message = params === undefined ? composer.t(key) : composer.t(key, params)
  return typeof message === 'string' ? message : String(message)
}

/**
 * Add or extend the message catalog of a language at runtime.
 *
 * The bundled catalogs are already merged at load time; this is the escape hatch for a catalog
 * that is not part of `src/locales`.
 */
export function registerLocaleMessages(value: string, messages: Record<string, unknown>): void {
  if (!isLocaleCode(value)) return
  composer.mergeLocaleMessage(value, messages)
}
