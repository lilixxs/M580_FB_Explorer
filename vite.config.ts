import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** README file of each interface language; the language name is not repeated in a second copy. */
const README_FILES: Readonly<Record<string, string>> = {
  'zh-CN': 'README.md',
  en: 'README.en.md',
  'zh-TW': 'README.zh-TW.md',
  ja: 'README.ja.md',
  ko: 'README.ko.md'
}

/** Screenshot request served in development and published in the build. */
const screenshotRequest = /^\/docs\/images\/(?:zh-CN|en|zh-TW|ja|ko)\/[a-z0-9-]+\.png$/

/** Repository documents published beside the application so their README links keep working. */
const repositoryDocuments = ['CONTRIBUTING.md', 'CONTRIBUTING.en.md', 'docs/requirements.md']

export default defineConfig({
  base: './',
  plugins: [vue(), {
    name: 'bundle-help-documents',
    configureServer(server) {
      // 开发环境与生产构建共用 docs/images 中的截图真源。
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!screenshotRequest.test(pathname)) return next()
        const image = resolve(pathname.slice(1))
        if (!existsSync(image)) return next()
        response.setHeader('Content-Type', 'image/png')
        response.end(readFileSync(image))
      })
    },
    generateBundle() {
      for (const [language, fileName] of Object.entries(README_FILES)) {
        const source = readFileSync(resolve(fileName), 'utf8')
        if (!source.trim()) throw new Error(`Missing help content: ${fileName}`)
        // README 按原名发布，帮助正文不再有第二份副本。
        this.emitFile({ type: 'asset', fileName, source })
        const images = resolve('docs/images', language)
        if (existsSync(images)) {
          for (const file of readdirSync(images).filter((name) => name.endsWith('.png'))) {
            this.emitFile({ type: 'asset', fileName: `docs/images/${language}/${file}`, source: readFileSync(resolve(images, file)) })
          }
        }
      }
      for (const document of repositoryDocuments) {
        if (existsSync(document)) this.emitFile({ type: 'asset', fileName: document, source: readFileSync(resolve(document)) })
      }
    }
  }],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 6000
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true
  }
})
