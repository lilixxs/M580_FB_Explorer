import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { HELP_MARKDOWN, README_MARKDOWN } from './src/data/helpContent.ts'

export default defineConfig({
  base: './',
  plugins: [vue(), {
    name: 'bundle-help-documents',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'HELP.md', source: HELP_MARKDOWN })
      this.emitFile({ type: 'asset', fileName: 'README.md', source: README_MARKDOWN })
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
