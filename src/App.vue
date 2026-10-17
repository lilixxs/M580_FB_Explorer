<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { Button as TButton, Drawer as TDrawer, ConfigProvider as TConfigProvider } from 'tdesign-vue-next'
import { locale, setLocale, SUPPORTED_LOCALES, t } from './i18n'
import { componentLocale } from './tdesignLocale'
import SplitPane from './components/SplitPane.vue'
import TreePanel from './components/TreePanel.vue'
import VariablesPanel from './components/VariablesPanel.vue'
import CallsPanel from './components/CallsPanel.vue'
import CodeEditor from './components/CodeEditor.vue'
import PinDiagram from './components/PinDiagram.vue'
import VariableDialog from './components/VariableDialog.vue'
import NewBlockDialog from './components/NewBlockDialog.vue'
import { DEMO_FILES } from './data/demo'
import {
  createNewBlockDocument,
  exportXdbText,
  hasUnexportedChanges,
  loadDemoFile,
  loadExchangeXml,
  setStatus
} from './actions'
import { activeSection, state } from './store'
import { renderMarkdown } from './core/markdown'

const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const helpOpen = ref(false)
const newBlockOpen = ref(false)
const exportWarnings = ref<string[]>([])
const warningsOpen = ref(false)
const helpHtml = computed(() => renderMarkdown(state.helpMarkdown))

const section = computed(() => activeSection.value)
const docLabel = computed(() => {
  if (!state.doc) return t('app.noDocument')
  return t('app.documentLabel', { fileName: state.doc.fileName, sections: state.doc.sections.length, variables: state.doc.variables.length })
})

function openFilePicker(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await importFile(file)
}

async function importFile(file: File): Promise<void> {
  if (!confirmReplace()) return
  try {
    const text = await file.text()
    loadExchangeXml(text, file.name)
  } catch (error) {
    setStatus(t('app.readFailed', { error: (error as Error).message }), 'error')
  }
}

function loadDemo(index: number): void {
  if (!confirmReplace()) return
  loadDemoFile(index)
}

function confirmReplace(): boolean {
  if (!hasUnexportedChanges()) return true
  return window.confirm(t('app.confirmReplace'))
}

/**
 * README 语言导航链接在帮助抽屉内切换界面语言，不打开 Markdown 文件。
 * 该处理只改变语言：当前文档、ST 源码和「有修改」标记保持不变。
 */
function onHelpLinkClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const link = target.closest('[data-help-language]')
  if (!link) return
  event.preventDefault()
  setLocale(String(link.getAttribute('data-help-language') ?? ''))
}

/** Replace guard for the top bar 新建功能块 dialog: cancel keeps the current document untouched. */
function onNewBlockSubmit(payload: { name: string; comment: string }): void {
  if (!confirmReplace()) return
  if (createNewBlockDocument(payload.name, payload.comment) === null) newBlockOpen.value = false
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (hasUnexportedChanges()) { event.preventDefault(); event.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))

function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragActive.value = true
}

function onDragLeave(event: DragEvent): void {
  if (event.relatedTarget && (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return
  dragActive.value = false
}

async function onDrop(event: DragEvent): Promise<void> {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) await importFile(file)
}

function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function onExport(): void {
  const result = exportXdbText()
  if (!result) return
  downloadText(result.fileName, result.xml)
  exportWarnings.value = result.warnings
  warningsOpen.value = result.warnings.length > 0
  state.dirty = false
  state.dirtySections = {}
}

</script>

<template>
  <TConfigProvider :global-config="componentLocale">
  <div class="app" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <header class="app-header">
      <div class="app-brand">
        <span class="title">M580_FB_Explorer</span>
        <span class="subtitle">{{ t('app.subtitle') }}</span>
      </div>

      <div class="doc-meta" :title="docLabel">
        <span>{{ docLabel }}</span>
        <span v-if="state.dirty" style="color: var(--m580-warning)">{{ t('app.dirty') }}</span>
      </div>

      <span class="spacer"></span>

      <div class="header-actions">
        <select class="field-input language-select" data-testid="language-select" :aria-label="t('app.language')" :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)">
          <option v-for="language in SUPPORTED_LOCALES" :key="language.value" :value="language.value">{{ language.label }}</option>
        </select>
        <input
          ref="fileInput"
          type="file"
          accept=".xdb,.xst,.xsy,.xml,text/xml,application/xml"
          style="display: none"
          @change="onFileChange"
        />
        <TButton size="small" theme="primary" data-testid="new-block" @click="newBlockOpen = true">{{ t('app.newBlock.title') }}</TButton>
        <TButton size="small" data-testid="import-file" @click="openFilePicker">{{ t('app.import') }}</TButton>

        <TButton
          v-for="(demo, index) in DEMO_FILES"
          :key="demo.fileName"
          size="small"
          variant="outline"
          :title="t('app.loadDemo', { fileName: demo.fileName })"
          :data-testid="`demo-${index}`"
          @click="loadDemo(index)"
        >
          {{ t(['app.demoBlock', 'app.demoSection', 'app.demoVariables'][index]) }}
        </TButton>

        <TButton size="small" :disabled="!state.doc" data-testid="export-file" @click="onExport">{{ t('app.export') }}</TButton>
        <TButton size="small" variant="outline" data-testid="open-help" @click="helpOpen = true">{{ t('app.help') }}</TButton>
      </div>
    </header>

    <div class="workspace">
      <SplitPane direction="horizontal" :default-size="34" :min-size="22" :max-size="60" storage-key="main-v2">
        <template #a>
          <SplitPane direction="vertical" :default-size="29" :min-size="16" :max-size="60" storage-key="left-top-v2">
            <template #a>
              <TreePanel />
            </template>
            <template #b>
              <SplitPane direction="vertical" :default-size="47" :min-size="20" :max-size="80" storage-key="left-bottom-v2">
                <template #a>
                  <CallsPanel />
                </template>
                <template #b>
                  <PinDiagram />
                </template>
              </SplitPane>
            </template>
          </SplitPane>
        </template>

        <template #b>
          <SplitPane direction="vertical" :default-size="33.333" :min-size="16" :max-size="70" storage-key="right-v2">
            <template #a>
              <VariablesPanel />
            </template>
            <template #b>
              <CodeEditor v-if="section" :key="`${state.doc?.fileName}:${section.id}:${section.language}`" :section="section" />
              <section v-else class="panel">
                <div class="empty-hint">{{ t('app.emptyEditor') }}</div>
              </section>
            </template>
          </SplitPane>
        </template>
      </SplitPane>
    </div>

    <footer class="status-bar">
      <span
        v-if="state.status"
        class="status-text"
        :data-type="state.status.type"
      >
        {{ state.status.text }}
      </span>
      <span v-else>{{ t('app.ready') }}</span>
      <span class="spacer" style="flex: 1 1 auto"></span>
      <span v-if="state.doc">{{ t('app.sectionCalls', { sections: state.doc.sections.length, calls: state.calls.length }) }}</span>
      <span v-if="state.doc?.warnings.length">{{ t('app.warningCount', { count: state.doc.warnings.length }) }}</span>
    </footer>

    <VariableDialog />
    <NewBlockDialog v-model:visible="newBlockOpen" @submit="onNewBlockSubmit" />
    <TDrawer v-model:visible="helpOpen" :header="t('app.helpTitle')" size="min(760px, 96vw)" :footer="false">
      <div class="markdown" v-html="helpHtml" @click="onHelpLinkClick"></div>
    </TDrawer>
    <TDrawer v-model:visible="warningsOpen" :header="t('app.exportTitle')" size="min(620px, 96vw)" :footer="false">
      <p>{{ t('app.exportNote') }}</p>
      <ul><li v-for="(warning, index) in exportWarnings" :key="index">{{ warning }}</li></ul>
    </TDrawer>
    <div v-if="dragActive" class="drop-overlay">{{ t('app.drop') }}</div>
  </div>
  </TConfigProvider>
</template>
