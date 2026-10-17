import { computed } from 'vue'
import zhCN from 'tdesign-vue-next/es/locale/zh_CN'
import enUS from 'tdesign-vue-next/es/locale/en_US'
import zhTW from 'tdesign-vue-next/es/locale/zh_TW'
import jaJP from 'tdesign-vue-next/es/locale/ja_JP'
import koKR from 'tdesign-vue-next/es/locale/ko_KR'
import { locale } from './i18n'

const configurations = { 'zh-CN': zhCN, en: enUS, 'zh-TW': zhTW, ja: jaJP, ko: koKR }
export const componentLocale = computed(() => {
  const current = configurations[locale.value as keyof typeof configurations] ?? zhCN
  // These are the localized TDesign surfaces used by the application.
  return { dialog: { ...current.dialog }, drawer: { ...current.drawer } }
})
