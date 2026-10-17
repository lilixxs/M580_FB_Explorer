<script setup lang="ts">
import { computed, ref } from 'vue'
import { selectSection } from '../actions'
import { activeSection, state } from '../store'

const warningsOpen = ref(false)
defineEmits<{ 'import-file': []; 'export-file': [] }>()

const doc = computed(() => state.doc)
const kindLabel = computed(() => {
  switch (doc.value?.kind) {
    case 'xdb':
      return '功能块 .xdb'
    case 'xst':
      return '程序 .xst'
    case 'xsy':
      return '变量 .xsy'
    default:
      return '未载入'
  }
})
const activeId = computed(() => activeSection.value?.id ?? '')
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title">功能块与程序段</span>
      <span class="spacer"></span>
      <button class="mini-btn" aria-label="左栏导入文件" @click="$emit('import-file')">导入</button>
      <button class="mini-btn" aria-label="左栏导出文件" :disabled="!doc" @click="$emit('export-file')">导出</button>
      <span class="count">{{ doc ? doc.sections.length : 0 }} 程序段</span>
    </header>

    <div class="panel-body">
      <div v-if="!doc" class="empty-hint">
        尚未载入交换文件。<br />
        点击顶部「导入文件」选择 .xdb / .xst / .xsy，或点击「示例」载入演示文件。
      </div>

      <template v-else>
        <div class="tree-card">
          <div class="row"><span class="label">文件</span><span class="value">{{ doc.fileName }}</span></div>
          <div class="row"><span class="label">类型</span><span class="value">{{ kindLabel }}</span></div>
          <div class="row"><span class="label">项目</span><span class="value">{{ doc.projectName || '—' }}</span></div>
          <div class="row"><span class="label">功能块</span><input class="field-input mono" aria-label="功能块名称" :value="doc.fbName" :placeholder="doc.sections[0]?.name || 'Exported_FB'" @input="doc.fbName = ($event.target as HTMLInputElement).value; state.dirty = true" /></div>
          <div class="row"><span class="label">版本</span><span class="value">{{ doc.fbVersion || doc.fileVersion || '—' }}</span></div>
          <div class="row"><span class="label">变量</span><span class="value">{{ doc.variables.length }}</span></div>
          <div class="row"><span class="label">注释</span><input class="field-input" aria-label="功能块注释" :value="doc.comment" @input="doc.comment = ($event.target as HTMLInputElement).value; state.dirty = true" /></div>
        </div>

        <div v-if="doc.warnings.length > 0" class="tree-card">
          <div class="row">
            <span class="label">解析警告（{{ doc.warnings.length }}）</span>
            <button class="mini-btn" @click="warningsOpen = !warningsOpen">
              {{ warningsOpen ? '收起' : '展开' }}
            </button>
          </div>
          <ul v-if="warningsOpen" class="warn-list">
            <li v-for="(warning, index) in doc.warnings" :key="index">{{ warning }}</li>
          </ul>
        </div>

        <div class="panel-title" style="padding: 6px 2px">程序段</div>
        <div class="section-list">
          <button
            v-for="section in doc.sections"
            :key="section.id"
            class="section-row"
            :class="{ 'section-row--active': section.id === activeId }"
            :title="section.name"
            @click="selectSection(section.id)"
          >
            <span class="badge" :class="{ 'badge--st': section.language === 'ST' }">
              {{ section.language === 'ST' ? 'ST' : 'XML' }}
            </span>
            <span class="name">{{ section.name }}</span>
            <span v-if="state.dirtySections[section.id]" class="dirty-dot" title="该程序段有未保存修改">●</span>
            <span v-if="section.task" class="badge">{{ section.task }}</span>
          </button>
          <div v-if="doc.sections.length === 0" class="empty-hint">该文件不包含程序段。</div>
        </div>
      </template>
    </div>
  </section>
</template>
