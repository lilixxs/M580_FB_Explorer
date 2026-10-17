<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { Button as TButton, Drawer as TDrawer } from 'tdesign-vue-next'
import SplitPane from './components/SplitPane.vue'
import TreePanel from './components/TreePanel.vue'
import VariablesPanel from './components/VariablesPanel.vue'
import CallsPanel from './components/CallsPanel.vue'
import CodeEditor from './components/CodeEditor.vue'
import PinDiagram from './components/PinDiagram.vue'
import VariableDialog from './components/VariableDialog.vue'
import { DEMO_FILES } from './data/demo'
import { exportXdbText, loadDemoFile, loadExchangeXml, setStatus } from './actions'
import { activeSection, state } from './store'
import { renderMarkdown } from './core/markdown'

const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
const helpOpen = ref(false)
const exportWarnings = ref<string[]>([])
const warningsOpen = ref(false)
const helpHtml = computed(() => renderMarkdown(state.helpMarkdown))

const section = computed(() => activeSection.value)
const docLabel = computed(() => {
  if (!state.doc) return '未载入文件'
  return `${state.doc.fileName} · ${state.doc.sections.length} 段 · ${state.doc.variables.length} 变量`
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
    setStatus(`读取文件失败：${(error as Error).message}`, 'error')
  }
}

function loadDemo(index: number): void {
  if (!confirmReplace()) return
  loadDemoFile(index)
}

function confirmReplace(): boolean {
  return !state.dirty || window.confirm('当前修改尚未导出。是否放弃修改并载入其他文件？')
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (state.dirty) { event.preventDefault(); event.returnValue = '' }
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
  <div class="app" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <header class="app-header">
      <div class="app-brand">
        <span class="title">M580_FB_Explorer</span>
        <span class="subtitle">Control Expert 交换文件查看与编辑</span>
      </div>

      <div class="doc-meta" :title="docLabel">
        <span>{{ docLabel }}</span>
        <span v-if="state.dirty" style="color: var(--m580-warning)">有修改</span>
      </div>

      <span class="spacer"></span>

      <div class="header-actions">
        <input
          ref="fileInput"
          type="file"
          accept=".xdb,.xst,.xsy,.xml,text/xml,application/xml"
          style="display: none"
          @change="onFileChange"
        />
        <TButton size="small" theme="primary" @click="openFilePicker">导入文件</TButton>

        <TButton
          v-for="(demo, index) in DEMO_FILES"
          :key="demo.fileName"
          size="small"
          variant="outline"
          :title="`载入 ${demo.fileName}`"
          @click="loadDemo(index)"
        >
          {{ demo.label }}
        </TButton>

        <TButton size="small" :disabled="!state.doc" @click="onExport">导出 .xdb</TButton>
        <TButton size="small" variant="outline" @click="helpOpen = true">帮助</TButton>
      </div>
    </header>

    <div class="workspace">
      <SplitPane direction="horizontal" :default-size="34" :min-size="22" :max-size="60" storage-key="main-v2">
        <template #a>
          <SplitPane direction="vertical" :default-size="29" :min-size="16" :max-size="60" storage-key="left-top-v2">
            <template #a>
              <TreePanel @import-file="openFilePicker" @export-file="onExport" />
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
                <div class="empty-hint">载入 .xdb / .xst 文件后在此编辑 ST 源码。</div>
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
      <span v-else>就绪。拖拽文件到窗口即可导入。快捷键 Ctrl+S 保存并重新解析。</span>
      <span class="spacer" style="flex: 1 1 auto"></span>
      <span v-if="state.doc">程序段 {{ state.doc.sections.length }} · 调用 {{ state.calls.length }}</span>
      <span v-if="state.doc?.warnings.length">解析警告 {{ state.doc.warnings.length }}</span>
    </footer>

    <VariableDialog />
    <TDrawer v-model:visible="helpOpen" header="使用帮助" size="min(760px, 96vw)" :footer="false">
      <div class="markdown" v-html="helpHtml"></div>
    </TDrawer>
    <TDrawer v-model:visible="warningsOpen" header="导出说明" size="min(620px, 96vw)" :footer="false">
      <p>文件已生成。请核对以下转换或兼容性说明。</p>
      <ul><li v-for="(warning, index) in exportWarnings" :key="index">{{ warning }}</li></ul>
    </TDrawer>
    <div v-if="dragActive" class="drop-overlay">松开鼠标导入 .xdb / .xst / .xsy</div>
  </div>
</template>
