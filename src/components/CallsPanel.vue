<script setup lang="ts">
import { ref, watch } from 'vue'
import { jumpToCall, jumpToDefinition, refreshCalls, setStatus } from '../actions'
import { callStats, callsBySection, state } from '../store'
import type { CallKind } from '../types'

const filterInput = ref(state.callSearch)
const refreshedAt = ref('')
function refresh(): void {
  refreshCalls()
  refreshedAt.value = new Date().toLocaleTimeString()
  setStatus('已解析全部 ST 程序段调用', 'success')
}

watch(
  () => state.callSearch,
  (value) => {
    if (value !== filterInput.value) filterInput.value = value
  }
)

function onFilterInput(value: string): void {
  state.callSearch = value
}

const KIND_LABEL: Record<CallKind, string> = {
  variable: '实例',
  section: '程序段',
  builtin: '内置',
  unknown: '未解析'
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title">调用</span>
      <span class="count">{{ state.calls.length }}</span>
      <span class="spacer"></span>
      <button class="mini-btn" :disabled="!state.doc" @click="refresh">刷新解析</button>
      <label class="count" title="仅显示当前程序段的调用">
        <input v-model="state.callsOnlyActiveSection" type="checkbox" aria-label="仅当前程序段" />
        当前段
      </label>
    </header>

    <div class="var-toolbar">
      <input
        v-model="filterInput"
        class="field-input"
        type="search"
        aria-label="过滤调用名"
        placeholder="过滤调用名"
        style="flex: 1 1 120px"
        @input="onFilterInput(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="call-stats">
      <span v-if="refreshedAt">{{ refreshedAt }}</span>
      <span title="功能块实例调用"><i class="dot kind-variable"></i>变量 {{ callStats.variable }}</span>
      <span title="程序段调用"><i class="dot kind-section"></i>程序段 {{ callStats.section }}</span>
      <span title="内置函数与通讯基本功能块"><i class="dot kind-builtin"></i>内置 {{ callStats.builtin }}</span>
      <span title="未解析目标"><i class="dot"></i>未解析 {{ callStats.unknown }}</span>
    </div>

    <div class="panel-body panel-body--flush">
      <div v-if="!state.doc" class="empty-hint">载入文件后在此查看调用。</div>
      <div v-else-if="callsBySection.length === 0" class="empty-hint">没有匹配的调用。</div>

      <template v-for="group in callsBySection" :key="group.sectionId">
        <div class="var-group-head">
          <span class="grow">{{ group.sectionName }}</span>
          <span class="count">{{ group.items.length }}</span>
        </div>
        <div
          v-for="call in group.items"
          :key="call.id"
          class="call-row"
          role="button"
          tabindex="0"
          :title="`${call.displayName} → ${call.targetName || '未解析'}\n${call.snippet}`"
          @click="jumpToCall(call)"
          @keydown.enter="jumpToCall(call)"
        >
          <span class="badge" :class="`kind-${call.kind}`">{{ KIND_LABEL[call.kind] }}</span>
          <span class="call-name mono">{{ call.displayName }}</span>
          <span class="line">L{{ call.line }}:{{ call.column }}</span>
          <button
            class="mini-btn"
            :disabled="call.kind !== 'variable' && call.kind !== 'section'"
            @click.stop="jumpToDefinition(call)"
          >
            定义
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
