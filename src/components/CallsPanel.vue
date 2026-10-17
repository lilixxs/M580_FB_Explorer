<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { jumpToCall, jumpToDefinition, jumpToReference, refreshCalls, setReferenceView, setStatus } from '../actions'
import { callStats, callsBySection, referenceStats, referencesBySection, selectedVariableReferences, state } from '../store'
import type { CallKind, VariableAccess } from '../types'

const filterInput = ref(state.callSearch)
const refreshedAt = ref('')
const bodyRef = ref<HTMLElement | null>(null)

function refresh(): void {
  refreshCalls()
  refreshedAt.value = new Date().toLocaleTimeString()
  setStatus('已解析全部 ST 程序段调用与变量引用', 'success')
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

const isReferences = computed(() => state.referenceView === 'references')

const KIND_LABEL: Record<CallKind, string> = {
  variable: '变量',
  section: '程序段',
  builtin: '内置',
  unknown: '未解析'
}

const ACCESS_LABEL: Record<VariableAccess, string> = {
  read: '读',
  write: '写',
  call: '调用'
}

function accessLabel(access: VariableAccess | undefined): string {
  return ACCESS_LABEL[access ?? 'read']
}

const selectedVariableName = computed(
  () => state.doc?.variables.find((variable) => variable.id === state.selectedVariableId)?.name ?? ''
)

const selectedReferenceCount = computed(() => selectedVariableReferences.value.length)

/**
 * A selected pin/variable without any reference must say so, even while other references remain
 * in the list; the editor position stays where it is.
 */
const noReferenceNotice = computed(() => {
  if (!selectedVariableName.value || selectedReferenceCount.value > 0) return ''
  return `变量 ${selectedVariableName.value} 在 ST 源码中没有任何引用。`
})

const referencesEmptyHint = computed(() =>
  state.callSearch.trim() ? '没有匹配的变量引用。' : '没有变量引用。'
)

// Scroll the highlighted reference into view whenever a variable row or pin drives the selection.
watch(
  () => state.referenceFocusNonce,
  async () => {
    await nextTick()
    if (state.referenceView !== 'references') return
    bodyRef.value?.querySelector<HTMLElement>('.call-row--active')?.scrollIntoView?.({ block: 'center' })
  }
)
</script>

<template>
  <section class="panel" data-testid="calls-panel">
    <header class="panel-head">
      <span class="panel-title">{{ isReferences ? '变量引用' : '调用' }}</span>
      <span class="count">{{ isReferences ? state.variableReferences.length : state.calls.length }}</span>
      <span class="spacer"></span>
      <div class="view-toggle" role="tablist" aria-label="调用列表视图">
        <button
          type="button"
          class="mini-btn"
          role="tab"
          data-testid="view-calls"
          :class="{ 'mini-btn--active': !isReferences }"
          :aria-selected="!isReferences"
          @click="setReferenceView('calls')"
        >
          调用
        </button>
        <button
          type="button"
          class="mini-btn"
          role="tab"
          data-testid="view-references"
          :class="{ 'mini-btn--active': isReferences }"
          :aria-selected="isReferences"
          @click="setReferenceView('references')"
        >
          变量引用
        </button>
      </div>
      <button class="mini-btn" :disabled="!state.doc" @click="refresh">刷新解析</button>
      <label class="count" title="仅显示当前程序段">
        <input v-model="state.callsOnlyActiveSection" type="checkbox" aria-label="仅当前程序段" />
        当前段
      </label>
    </header>

    <div class="var-toolbar">
      <input
        v-model="filterInput"
        class="field-input"
        type="search"
        :aria-label="isReferences ? '按名字过滤变量引用' : '过滤调用名'"
        :placeholder="isReferences ? '按名字过滤变量引用' : '过滤调用名'"
        style="flex: 1 1 120px"
        @input="onFilterInput(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div v-if="isReferences" class="call-stats">
      <span v-if="refreshedAt">{{ refreshedAt }}</span>
      <span title="读取变量"><i class="dot kind-variable"></i>读 {{ referenceStats.read }}</span>
      <span title="写入变量"><i class="dot kind-section"></i>写 {{ referenceStats.write }}</span>
      <span title="变量作为调用目标"><i class="dot kind-builtin"></i>调用 {{ referenceStats.call }}</span>
      <span v-if="selectedVariableName" class="count" data-testid="reference-selected">
        已选 {{ selectedVariableName }}
      </span>
    </div>
    <div v-else class="call-stats">
      <span v-if="refreshedAt">{{ refreshedAt }}</span>
      <span title="功能块实例调用"><i class="dot kind-variable"></i>变量 {{ callStats.variable }}</span>
      <span title="程序段调用"><i class="dot kind-section"></i>程序段 {{ callStats.section }}</span>
      <span title="内置函数与通讯基本功能块"><i class="dot kind-builtin"></i>内置 {{ callStats.builtin }}</span>
      <span title="未解析目标"><i class="dot"></i>未解析 {{ callStats.unknown }}</span>
    </div>

    <div ref="bodyRef" class="panel-body panel-body--flush" data-testid="calls-body">
      <div v-if="!state.doc" class="empty-hint">载入文件后在此查看调用。</div>

      <template v-else-if="isReferences">
        <div v-if="noReferenceNotice" class="empty-hint ref-note" data-testid="references-empty">
          {{ noReferenceNotice }}
        </div>
        <div v-if="referencesBySection.length === 0" class="empty-hint" data-testid="references-list-empty">
          {{ referencesEmptyHint }}
        </div>
        <template v-for="group in referencesBySection" :key="group.sectionId">
          <div class="var-group-head">
            <span class="grow">{{ group.sectionName }}</span>
            <span class="count">{{ group.items.length }}</span>
          </div>
          <div
            v-for="reference in group.items"
            :key="reference.id"
            class="call-row reference-row"
            :class="{ 'call-row--active': reference.targetId === state.selectedVariableId }"
            role="button"
            tabindex="0"
            :aria-label="`变量引用 ${reference.targetName}（${accessLabel(reference.access)}）第 ${reference.line} 行`"
            :title="`${reference.targetName}（${accessLabel(reference.access)}）\n${reference.snippet}`"
            @click="jumpToReference(reference)"
            @keydown.enter="jumpToReference(reference)"
          >
            <span class="badge" :class="`access-${reference.access ?? 'read'}`">{{ accessLabel(reference.access) }}</span>
            <span class="call-name mono">{{ reference.targetName }}</span>
            <span class="line">L{{ reference.line }}:{{ reference.column }}</span>
          </div>
        </template>
      </template>

      <template v-else>
        <div v-if="callsBySection.length === 0" class="empty-hint">没有匹配的调用。</div>
        <template v-for="group in callsBySection" :key="group.sectionId">
          <div class="var-group-head">
            <span class="grow">{{ group.sectionName }}</span>
            <span class="count">{{ group.items.length }}</span>
          </div>
          <div
            v-for="call in group.items"
            :key="call.id"
            class="call-row"
            :class="{ 'call-row--active': call.targetId !== '' && call.targetId === state.selectedVariableId }"
            role="button"
            tabindex="0"
            :aria-label="`${KIND_LABEL[call.kind]} ${call.displayName} 第 ${call.line} 行`"
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
      </template>
    </div>
  </section>
</template>
