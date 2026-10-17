<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { jumpToCall, jumpToDefinition, jumpToReference, refreshCalls, setReferenceView, setStatus } from '../actions'
import { t } from '../i18n'
import { callStats, callsBySection, referenceStats, referencesBySection, selectedVariableReferences, state } from '../store'
import type { CallKind, VariableAccess } from '../types'

const filterInput = ref(state.callSearch)
const refreshedAt = ref('')
const bodyRef = ref<HTMLElement | null>(null)

function refresh(): void {
  refreshCalls()
  refreshedAt.value = new Date().toLocaleTimeString()
  setStatus(t('callsPanel.refreshed'), 'success')
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

/**
 * Message key per call kind and per variable access.
 *
 * The key is looked up through a constant map instead of building the path by concatenation, so a
 * renamed key is greppable from the component.
 */
const KIND_KEYS: Record<CallKind, string> = {
  variable: 'callsPanel.kind.variable',
  section: 'callsPanel.kind.section',
  builtin: 'callsPanel.kind.builtin',
  unknown: 'callsPanel.kind.unknown'
}

const ACCESS_KEYS: Record<VariableAccess, string> = {
  read: 'callsPanel.access.read',
  write: 'callsPanel.access.write',
  call: 'callsPanel.access.call'
}

function kindLabel(kind: CallKind): string {
  return t(KIND_KEYS[kind])
}

function accessLabel(access: VariableAccess | undefined): string {
  return t(ACCESS_KEYS[access ?? 'read'])
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
  return t('callsPanel.noReference', { name: selectedVariableName.value })
})

const referencesEmptyHint = computed(() =>
  state.callSearch.trim() ? t('callsPanel.emptyReferencesFiltered') : t('callsPanel.emptyReferences')
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
      <span class="panel-title">{{ isReferences ? t('callsPanel.titleReferences') : t('callsPanel.titleCalls') }}</span>
      <span class="count">{{ isReferences ? state.variableReferences.length : state.calls.length }}</span>
      <span class="spacer"></span>
      <div class="view-toggle" role="tablist" :aria-label="t('callsPanel.viewAria')">
        <button
          type="button"
          class="mini-btn"
          role="tab"
          data-testid="view-calls"
          :class="{ 'mini-btn--active': !isReferences }"
          :aria-selected="!isReferences"
          @click="setReferenceView('calls')"
        >
          {{ t('callsPanel.viewCalls') }}
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
          {{ t('callsPanel.viewReferences') }}
        </button>
      </div>
      <button class="mini-btn" :disabled="!state.doc" @click="refresh">{{ t('callsPanel.refresh') }}</button>
      <label class="count" :title="t('callsPanel.onlyCurrentSectionTitle')">
        <input v-model="state.callsOnlyActiveSection" type="checkbox" :aria-label="t('callsPanel.onlyCurrentSectionAria')" />
        {{ t('callsPanel.onlyCurrentSection') }}
      </label>
    </header>

    <div class="var-toolbar">
      <input
        v-model="filterInput"
        class="field-input"
        type="search"
        :aria-label="isReferences ? t('callsPanel.filterReferences') : t('callsPanel.filterCalls')"
        :placeholder="isReferences ? t('callsPanel.filterReferences') : t('callsPanel.filterCalls')"
        style="flex: 1 1 120px"
        @input="onFilterInput(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div v-if="isReferences" class="call-stats">
      <span v-if="refreshedAt">{{ refreshedAt }}</span>
      <span :title="t('callsPanel.stats.readTitle')"><i class="dot kind-variable"></i>{{ t('callsPanel.stats.read', { count: referenceStats.read }) }}</span>
      <span :title="t('callsPanel.stats.writeTitle')"><i class="dot kind-section"></i>{{ t('callsPanel.stats.write', { count: referenceStats.write }) }}</span>
      <span :title="t('callsPanel.stats.callTitle')"><i class="dot kind-builtin"></i>{{ t('callsPanel.stats.call', { count: referenceStats.call }) }}</span>
      <span v-if="selectedVariableName" class="count" data-testid="reference-selected">
        {{ t('callsPanel.selected', { name: selectedVariableName }) }}
      </span>
    </div>
    <div v-else class="call-stats">
      <span v-if="refreshedAt">{{ refreshedAt }}</span>
      <span :title="t('callsPanel.stats.variableTitle')"><i class="dot kind-variable"></i>{{ t('callsPanel.stats.variable', { count: callStats.variable }) }}</span>
      <span :title="t('callsPanel.stats.sectionTitle')"><i class="dot kind-section"></i>{{ t('callsPanel.stats.section', { count: callStats.section }) }}</span>
      <span :title="t('callsPanel.stats.builtinTitle')"><i class="dot kind-builtin"></i>{{ t('callsPanel.stats.builtin', { count: callStats.builtin }) }}</span>
      <span :title="t('callsPanel.stats.unknownTitle')"><i class="dot"></i>{{ t('callsPanel.stats.unknown', { count: callStats.unknown }) }}</span>
    </div>

    <div ref="bodyRef" class="panel-body panel-body--flush" data-testid="calls-body">
      <div v-if="!state.doc" class="empty-hint">{{ t('callsPanel.emptyNoDoc') }}</div>

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
            :aria-label="t('callsPanel.referenceAria', { name: reference.targetName, access: accessLabel(reference.access), line: reference.line })"
            :title="t('callsPanel.referenceTitle', { name: reference.targetName, access: accessLabel(reference.access), snippet: reference.snippet })"
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
        <div v-if="callsBySection.length === 0" class="empty-hint">{{ t('callsPanel.emptyCalls') }}</div>
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
            :aria-label="t('callsPanel.callAria', { kind: kindLabel(call.kind), name: call.displayName, line: call.line })"
            :title="t('callsPanel.callTitle', { name: call.displayName, target: call.targetName || t('callsPanel.kind.unknown'), snippet: call.snippet })"
            @click="jumpToCall(call)"
            @keydown.enter="jumpToCall(call)"
          >
            <span class="badge" :class="`kind-${call.kind}`">{{ kindLabel(call.kind) }}</span>
            <span class="call-name mono">{{ call.displayName }}</span>
            <span class="line">L{{ call.line }}:{{ call.column }}</span>
            <button
              class="mini-btn"
              :disabled="call.kind !== 'variable' && call.kind !== 'section'"
              @click.stop="jumpToDefinition(call)"
            >
              {{ t('callsPanel.definition') }}
            </button>
          </div>
        </template>
      </template>
    </div>
  </section>
</template>
