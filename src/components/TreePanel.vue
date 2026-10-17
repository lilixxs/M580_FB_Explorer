<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commitMetaDraft, discardMetaDraft, hasPendingMetaDraft, metaDraft, selectSection } from '../actions'
import { activeSection, state } from '../store'
import { t } from '../i18n'
import { validateBlockName } from '../core/newDocument'

const warningsOpen = ref(false)
const metaAttempted = ref(false)
const metaError = computed(() => metaAttempted.value ? validateBlockName(metaDraft.fbName) ?? '' : '')

const doc = computed(() => state.doc)
watch(doc, () => { metaAttempted.value = false; warningsOpen.value = false })
const kindLabel = computed(() => {
  switch (doc.value?.kind) {
    case 'xdb':
      return t('app.tree.kindXdb')
    case 'xst':
      return t('app.tree.kindXst')
    case 'xsy':
      return t('app.tree.kindXsy')
    default:
      return t('app.tree.notLoaded')
  }
})
const activeId = computed(() => activeSection.value?.id ?? '')
/**
 * The name/comment inputs edit a draft (`metaDraft`), never the document.
 *
 * Import, demo load and 新建功能块 all re-seed the draft through `applyDocument`, so the panel always
 * shows the current document values plus whatever the user typed but has not confirmed.
 */
const metaDirty = computed(() => hasPendingMetaDraft())

function confirmMeta(): void {
  metaAttempted.value = commitMetaDraft() !== null
}

function cancelMeta(): void {
  metaAttempted.value = false
  discardMetaDraft()
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title">{{ t('app.tree.title') }}</span>
      <span class="spacer"></span>
      <span class="count">{{ t('app.tree.sectionsCount', { count: doc?.sections.length ?? 0 }) }}</span>
    </header>

    <div class="panel-body">
      <div v-if="!doc" class="empty-hint">
        {{ t('app.tree.empty') }}
      </div>

      <template v-else>
        <div class="tree-card">
          <div class="row"><span class="label">{{ t('app.tree.file') }}</span><span class="value">{{ doc.fileName }}</span></div>
          <div class="row"><span class="label">{{ t('app.tree.type') }}</span><span class="value">{{ kindLabel }}</span></div>
          <div class="row"><span class="label">{{ t('app.tree.project') }}</span><span class="value">{{ doc.projectName || '—' }}</span></div>
          <div class="row">
            <span class="label">{{ t('app.tree.block') }}</span>
            <div class="type-row">
              <input
                class="field-input mono"
                :aria-label="t('app.tree.nameLabel')"
                data-testid="metadata-name"
                v-model="metaDraft.fbName"
                :placeholder="doc.sections[0]?.name || 'Exported_FB'"
              />
            </div>
          </div>
          <div class="row"><span class="label">{{ t('app.tree.version') }}</span><span class="value">{{ doc.fbVersion || doc.fileVersion || '—' }}</span></div>
          <div class="row"><span class="label">{{ t('app.tree.variables') }}</span><span class="value">{{ doc.variables.length }}</span></div>
          <div class="row">
            <span class="label">{{ t('app.tree.comment') }}</span>
            <div class="type-row">
              <input
                class="field-input"
                :aria-label="t('app.tree.commentLabel')"
                data-testid="metadata-comment"
                v-model="metaDraft.comment"
              />
            </div>
          </div>
          <div class="row">
            <span class="label"></span>
            <div class="type-row">
              <!--
                The aria-labels carry the accessible name. The visible text stays 确认 / 取消, but a
                bare 取消 would collide with the dialog and inline-delete 取消 buttons for screen
                readers and for the page-scoped Playwright selectors in e2e/ and scripts/.
              -->
              <button
                class="mini-btn"
                data-testid="confirm-metadata"
                :aria-label="`${t('app.tree.confirm')} — ${t('app.tree.nameLabel')}`"
                :disabled="!metaDirty"
                @click="confirmMeta"
              >
                {{ t('app.tree.confirm') }}
              </button>
              <button
                class="mini-btn"
                data-testid="cancel-metadata"
                :aria-label="`${t('app.tree.cancel')} — ${t('app.tree.nameLabel')}`"
                :disabled="!metaDirty"
                @click="cancelMeta"
              >
                {{ t('app.tree.cancel') }}
              </button>
              <span v-if="metaError" style="color: var(--m580-danger)" data-testid="metadata-error">{{ metaError }}</span>
              <span v-else-if="metaDirty" style="color: var(--m580-text-muted)" data-testid="metadata-pending">{{ t('app.tree.pending') }}</span>
            </div>
          </div>
        </div>

        <div v-if="doc.warnings.length > 0" class="tree-card">
          <div class="row">
            <span class="label">{{ t('app.tree.warnings', { count: doc.warnings.length }) }}</span>
            <button class="mini-btn" @click="warningsOpen = !warningsOpen">
              {{ t(warningsOpen ? 'app.tree.collapse' : 'app.tree.expand') }}
            </button>
          </div>
          <ul v-if="warningsOpen" class="warn-list">
            <li v-for="(warning, index) in doc.warnings" :key="index">{{ warning }}</li>
          </ul>
        </div>

        <div class="panel-title" style="padding: 6px 2px">{{ t('app.tree.sections') }}</div>
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
            <span v-if="state.dirtySections[section.id]" class="dirty-dot" :title="t('app.tree.unsavedSection')">●</span>
            <span v-if="section.task" class="badge">{{ section.task }}</span>
          </button>
          <div v-if="doc.sections.length === 0" class="empty-hint">{{ t('app.tree.noSections') }}</div>
        </div>
      </template>
    </div>
  </section>
</template>
