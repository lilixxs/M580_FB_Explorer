import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineConfig({
  base: './',
  plugins: [vue(), {
    name: 'bundle-help-documents',
    configureServer(server) {
      // 开发环境与生产构建共用 docs/images 中的截图真源。
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!/^\/images\/(?:zh-CN|en|zh-TW|ja|ko)\/[a-z-]+\.png$/.test(pathname)) return next()
        const image = resolve('docs', pathname.slice(1))
        if (!existsSync(image)) return next()
        response.setHeader('Content-Type', 'image/png')
        response.end(readFileSync(image))
      })
    },
    generateBundle() {
      for (const language of ['zh-CN', 'en', 'zh-TW', 'ja', 'ko']) {
        const source = readFileSync(resolve(`requirements/localization/help/${language}.md`), 'utf8')
        if (!source.trim()) throw new Error(`Missing help content: ${language}`)
        this.emitFile({ type: 'asset', fileName: `HELP.${language}.md`, source })
        if (language === 'zh-CN') this.emitFile({ type: 'asset', fileName: 'HELP.md', source })
        const images = resolve(`docs/images/${language}`)
        if (existsSync(images)) {
          for (const file of readdirSync(images).filter((name) => name.endsWith('.png'))) {
            this.emitFile({ type: 'asset', fileName: `images/${language}/${file}`, source: readFileSync(resolve(images, file)) })
          }
        }
      }
      this.emitFile({ type: 'asset', fileName: 'README.md', source: readFileSync(resolve('README.en.md'), 'utf8') })
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
