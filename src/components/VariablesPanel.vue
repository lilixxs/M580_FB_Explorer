<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import {
  deleteVariable,
  moveVariable,
  openVariableEditor,
  revealVariable,
  setAllCollapsed,
  toggleCategory
} from '../actions'
import { escapeHtml } from '../core/markdown'
import { state, visibleVariableGroups } from '../store'
import type { VariableCategory, VariableDef } from '../types'

const searchInput = ref(state.variableSearch)
const pendingDeleteId = ref('')

watch(
  () => state.variableSearch,
  (value) => {
    if (value !== searchInput.value) searchInput.value = value
  }
)

function onSearchInput(value: string): void {
  state.variableSearch = value
}

watch(
  () => state.variableFocusNonce,
  async () => {
    await nextTick()
    const id = state.selectedVariableId
    if (!id) return
    const element = document.querySelector<HTMLElement>(`[data-var-id="${id}"]`)
    element?.scrollIntoView?.({ block: 'center' })
  }
)

function highlight(text: string): string {
  const query = state.variableSearch.trim()
  if (!query) return escapeHtml(text)
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index < 0) return escapeHtml(text)
  return escapeHtml(text.slice(0, index)) + '<mark>' + escapeHtml(text.slice(index, index + query.length)) + '</mark>' + escapeHtml(text.slice(index + query.length))
}

function confirmDelete(variable: VariableDef): void {
  deleteVariable(variable.id)
  pendingDeleteId.value = ''
}

function defaultCategory(): VariableCategory {
  if (state.doc?.kind === 'xdb') return 'IN'
  return 'GLOBAL'
}
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="panel-title">变量</span>
      <span class="count">{{ state.doc?.variables.length ?? 0 }}</span>
      <span class="spacer"></span>
      <button class="mini-btn" :disabled="!state.doc" @click="openVariableEditor('add', defaultCategory())">
        新增
      </button>
    </header>

    <div class="var-toolbar">
      <input
        v-model="searchInput"
        class="field-input"
        type="search"
        aria-label="搜索变量"
        placeholder="搜索名称 / 类型 / 地址 / 注释"
        style="flex: 1 1 200px"
        @input="onSearchInput(($event.target as HTMLInputElement).value)"
      />
      <button class="mini-btn" :disabled="!state.doc" @click="setAllCollapsed(true)">全折叠</button>
      <button class="mini-btn" :disabled="!state.doc" @click="setAllCollapsed(false)">全展开</button>
    </div>

    <div class="panel-body">
      <div v-if="!state.doc" class="empty-hint">载入文件后在此管理变量。</div>
      <div v-else-if="visibleVariableGroups.length === 0" class="empty-hint">没有匹配的变量。</div>

      <template v-for="group in visibleVariableGroups" :key="group.category">
        <div class="var-group">
          <button class="var-group-head" @click="toggleCategory(group.category)">
            <span class="arrow">{{ group.collapsed ? '▸' : '▾' }}</span>
            <span class="grow">{{ group.label }}</span>
            <span class="count">{{ group.items.length }}</span>
          </button>

          <template v-if="!group.collapsed">
            <div class="variable-columns variable-column-head">
              <span>变量名</span><span>类型</span><span>地址</span><span>初值</span><span>注释</span><span>操作</span>
            </div>
            <div
              v-for="variable in group.items"
              :key="variable.id"
              class="var-row variable-columns"
              :class="{ 'var-row--active': variable.id === state.selectedVariableId }"
              :data-var-id="variable.id"
              @click="revealVariable(variable.id)"
              @dblclick="openVariableEditor('edit', variable.category, variable.id)"
            >
              <div class="var-name mono" :title="variable.name" v-html="highlight(variable.name)"></div>
              <div class="var-type mono" :title="variable.typeName">
                <span v-html="highlight(variable.typeName)"></span>
                <span v-if="variable.positionPin" class="pin-tag">pin {{ variable.positionPin }}</span>
              </div>
              <div class="var-addr mono" :title="variable.topologicalAddress" v-html="highlight(variable.topologicalAddress || '—')"></div>
              <div class="mono variable-value">{{ variable.initValue || variable.defaultValue || '—' }}</div>
              <div class="variable-comment" :title="variable.comment">{{ variable.comment || '—' }}</div>

              <template v-if="pendingDeleteId === variable.id">
                <span class="confirm-inline">
                  删除？
                  <button class="mini-btn mini-btn--danger" @click.stop="confirmDelete(variable)">确认</button>
                  <button class="mini-btn" @click.stop="pendingDeleteId = ''">取消</button>
                </span>
              </template>
              <template v-else>
                <div class="var-actions">
                  <button class="mini-btn" title="上移变量" @click.stop="moveVariable(variable.id, -1)">↑</button>
                  <button class="mini-btn" title="下移变量" @click.stop="moveVariable(variable.id, 1)">↓</button>
                  <button
                    class="mini-btn"
                    title="修改变量"
                    @click.stop="openVariableEditor('edit', variable.category, variable.id)"
                  >
                    改
                  </button>
                  <button class="mini-btn" title="删除变量" @click.stop="pendingDeleteId = variable.id">删</button>
                </div>
              </template>
            </div>
          </template>
        </div>
      </template>
    </div>
  </section>
</template>
