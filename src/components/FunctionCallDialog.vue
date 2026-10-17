<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button as TButton, Dialog as TDialog } from 'tdesign-vue-next'
import { addVariable } from '../actions'
import { t } from '../i18n'
import { localize } from '../localize'
import { state } from '../store'
import {
  ALL_LIBRARY_ENTRIES,
  CALL_BROWSER_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  LIBRARY_GROUPS,
  buildCallBrowserItems,
  type CallBrowserFilter,
  type CallBrowserItem,
  type CallInsertPayload
} from '../core/functionLibrary'
import { NAME_RE } from '../types'

/**
 * Parameter and output lists supplied by the library JSON.
 *
 * Read as optional fields so the dialog keeps working when a library only carries the ST call
 * template: an EFB without `parameters` inserts `实例()` and asks the user to fill the arguments.
 * An intersection (not an interface extension) keeps the cast valid once `functionLibrary.ts`
 * declares the same optional fields on `CallBrowserItem`.
 */
type ParameterizedCallBrowserItem = CallBrowserItem & {
  parameters?: string[]
  outputs?: string[]
}

/** Sentinel of the "create a new instance" entry in the instance dropdown. */
const NEW_INSTANCE_ID = '__new__'

/** Placeholder value per formal parameter; only PT and PV get a literal default. */
function parameterPlaceholder(parameter: string): string {
  if (parameter === 'PT') return 't#2s'
  if (parameter === 'PV') return '0'
  return `x${parameter.charAt(0)}${parameter.slice(1).toLowerCase()}`
}

const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'insert', payload: CallInsertPayload): void
}>()

const filter = ref<CallBrowserFilter>('all')
const groupFilter = ref('')
const query = ref('')
const selectedId = ref('')
const customName = ref('')
const customParams = ref('')
const customError = ref('')
const efbInstanceId = ref('')
const efbNewName = ref('')
const efbError = ref('')

const sections = computed(() => state.doc?.sections ?? [])
const categoryItems = computed(() =>
  buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections.value, filter.value, query.value)
)
const items = computed(() => {
  const group = groupFilter.value
  if (!group) return categoryItems.value
  return categoryItems.value.filter((item) => item.group === group)
})

/**
 * Second level under the category list: library groups present in the current category.
 *
 * `LIBRARY_GROUPS` fixes the display order; a group that only exists on an item still gets a
 * button, appended after the known ones.
 */
const groupsInView = computed(() => {
  const present = new Set<string>()
  for (const item of buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections.value, filter.value, '')) {
    if (item.group) present.add(item.group)
  }
  const ordered = LIBRARY_GROUPS.filter((group) => present.has(group.id)).map((group) => ({ ...group }))
  for (const item of buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections.value, filter.value, '')) {
    if (!item.group || LIBRARY_GROUPS.some((group) => group.id === item.group)) continue
    if (!ordered.some((group) => group.id === item.group)) {
      ordered.push({ id: item.group, label: item.groupLabel ?? item.group })
    }
  }
  return ordered
})

const subFunctionCount = computed(
  () => buildCallBrowserItems(ALL_LIBRARY_ENTRIES, sections.value, 'sub').length
)

const categoryCounts = computed<Record<CallBrowserFilter, number>>(() => ({
  all: ALL_LIBRARY_ENTRIES.length + subFunctionCount.value,
  function: ALL_LIBRARY_ENTRIES.filter((entry) => entry.kind === 'ef' || entry.kind === 'function').length,
  efb: ALL_LIBRARY_ENTRIES.filter((entry) => entry.kind === 'efb').length,
  sub: subFunctionCount.value,
  custom: 0
}))

const selectedItem = computed<ParameterizedCallBrowserItem | null>(
  () =>
    (items.value.find((item) => item.id === selectedId.value) as
      | ParameterizedCallBrowserItem
      | undefined) ?? null
)
const selectedEfb = computed(() =>
  selectedItem.value?.kind === 'efb' ? selectedItem.value : null
)

const efbInstances = computed(() => {
  const entry = selectedEfb.value
  if (!entry) return []
  const type = entry.label.trim().toUpperCase()
  return (state.doc?.variables ?? []).filter((variable) => variable.typeName.trim().toUpperCase() === type)
})

/** Input parameters come from the library JSON; an unknown external EFB has none. */
const efbParameters = computed(() => selectedEfb.value?.parameters ?? [])
const efbOutputs = computed(() => selectedEfb.value?.outputs ?? [])

/** The new-name input shows for a type without instances, or after picking "新建实例…". */
const creatingInstance = computed(
  () => efbInstances.value.length === 0 || efbInstanceId.value === NEW_INSTANCE_ID
)

const efbParameterHint = computed(() => {
  const entry = selectedEfb.value
  if (!entry) return ''
  const parameters = efbParameters.value
  if (parameters.length === 0) {
    return t('functionCallDialog.efbNoParameters', { label: entry.label })
  }
  return t('functionCallDialog.efbParameters', {
    list: parameters.map((parameter) => `${parameter} := ...`).join(t('functionCallDialog.parameterSeparator'))
  })
})

const efbOutputHint = computed(() => {
  const outputs = efbOutputs.value
  if (outputs.length === 0) return t('functionCallDialog.efbOutputsHint')
  // The member prefix is interface text, not an identifier, so it is translated as well.
  const prefix = t('functionCallDialog.instancePrefix')
  return t('functionCallDialog.efbOutputs', {
    list: outputs.map((output) => `${prefix}.${output}`).join(' / ')
  })
})

watch(
  () => props.visible,
  (open) => {
    if (!open) return
    filter.value = 'all'
    groupFilter.value = ''
    query.value = ''
    selectedId.value = ''
    customName.value = ''
    customParams.value = ''
    customError.value = ''
    efbInstanceId.value = ''
    efbNewName.value = ''
    efbError.value = ''
  }
)

// Keep the selection valid while the filter/search narrows the list.
watch(items, (next) => {
  if (next.length === 0) {
    selectedId.value = ''
    return
  }
  if (!next.some((item) => item.id === selectedId.value)) selectedId.value = next[0].id
})

watch(efbInstances, (next) => {
  if (next.length === 0) {
    efbInstanceId.value = ''
    return
  }
  // Default to an existing instance; a new one is only created after an explicit choice + insert.
  if (!next.some((instance) => instance.id === efbInstanceId.value)) efbInstanceId.value = next[0].id
})

function close(): void {
  emit('update:visible', false)
}

function pickCategory(id: CallBrowserFilter): void {
  filter.value = id
  groupFilter.value = ''
  customError.value = ''
  efbError.value = ''
}

function pickGroup(id: string): void {
  groupFilter.value = groupFilter.value === id ? '' : id
}

function selectItem(item: CallBrowserItem): void {
  selectedId.value = item.id
  efbError.value = ''
}

function insertItem(item: CallBrowserItem): void {
  // An EFB must be called through a declared instance; only the instance panel may insert it.
  if (item.kind === 'efb') {
    selectItem(item)
    return
  }
  emit('insert', { label: item.label, kind: item.kind, text: item.insertText })
}

function insertCustom(): void {
  const name = customName.value.trim()
  if (!name) {
    customError.value = t('functionCallDialog.customNameRequired')
    return
  }
  if (!NAME_RE.test(name)) {
    customError.value = t('functionCallDialog.customNamePattern')
    return
  }
  const params = customParams.value.trim()
  customError.value = ''
  emit('insert', {
    label: name,
    kind: 'custom',
    text: params ? `${name}(${params})` : `${name}()`
  })
}

/**
 * Insert a full instance call.
 *
 * With an existing instance the dialog only builds the call text. Without one the PRIVATE
 * variable is created here, on the explicit insert action: closing or cancelling the dialog never
 * creates a variable.
 */
function insertEfbCall(): void {
  const entry = selectedEfb.value
  if (!entry) return
  const parameters = efbParameters.value
  let instanceName = ''

  const existing = creatingInstance.value
    ? undefined
    : efbInstances.value.find((instance) => instance.id === efbInstanceId.value)
  if (existing) {
    instanceName = existing.name
  } else {
    const name = efbNewName.value.trim()
    if (!name) {
      efbError.value = t('functionCallDialog.instanceRequired')
      return
    }
    if (!NAME_RE.test(name)) {
      efbError.value = t('functionCallDialog.instancePattern')
      return
    }
    if ((state.doc?.variables ?? []).some((variable) => variable.name.trim().toUpperCase() === name.toUpperCase())) {
      efbError.value = t('functionCallDialog.instanceExists', { name })
      return
    }
    const error = addVariable({
      name,
      typeName: entry.label,
      category: 'PRIVATE',
      topologicalAddress: '',
      defaultValue: '',
      comment: t('functionCallDialog.createdInstanceComment', { label: entry.label }),
      initValue: ''
    })
    if (error) {
      efbError.value = t('functionCallDialog.createFailed', { error })
      return
    }
    instanceName = name
  }

  efbError.value = ''
  const args = parameters.map((parameter) => `${parameter} := ${parameterPlaceholder(parameter)}`)
  // An EFB call is an ST statement, so it is terminated with `;`.
  emit('insert', { label: entry.label, kind: 'efb', text: `${instanceName}(${args.join(', ')});` })
}
</script>

<template>
  <TDialog
    :visible="props.visible"
    :header="t('functionCallDialog.title')"
    :footer="false"
    width="min(760px, 96vw)"
    @close="close"
  >
    <div class="call-browser" data-testid="function-call-dialog">
      <nav class="call-browser-nav" :aria-label="t('functionCallDialog.categoryNavAria')">
        <button
          v-for="category in CALL_BROWSER_CATEGORIES"
          :key="category.id"
          type="button"
          class="call-browser-tab"
          :class="{ 'call-browser-tab--active': filter === category.id }"
          :data-category="category.id"
          :aria-pressed="filter === category.id"
          @click="pickCategory(category.id)"
        >
          <span class="grow">{{ localize(category.label) }}</span>
          <span class="count">{{ categoryCounts[category.id] }}</span>
        </button>

        <template v-if="groupsInView.length > 0">
          <div class="call-browser-group-label">{{ t('functionCallDialog.libraryGroups') }}</div>
          <button
            type="button"
            class="call-browser-tab call-browser-tab--sub"
            :class="{ 'call-browser-tab--active': groupFilter === '' }"
            data-group-filter=""
            @click="groupFilter = ''"
          >
            <span class="grow">{{ t('functionCallDialog.allGroups') }}</span>
          </button>
          <button
            v-for="group in groupsInView"
            :key="group.id"
            type="button"
            class="call-browser-tab call-browser-tab--sub"
            :class="{ 'call-browser-tab--active': groupFilter === group.id }"
            :data-group-filter="group.id"
            @click="pickGroup(group.id)"
          >
            <span class="grow">{{ localize(group.label) }}</span>
          </button>
        </template>
      </nav>

      <div class="call-browser-main">
        <template v-if="filter === 'custom'">
          <div class="call-custom">
            <label for="call-custom-name">{{ t('functionCallDialog.customNameLabel') }}</label>
            <input
              id="call-custom-name"
              v-model="customName"
              class="field-input mono"
              :placeholder="t('functionCallDialog.customNamePlaceholder')"
              data-testid="custom-call-name"
            />
            <label for="call-custom-params">{{ t('functionCallDialog.customParamsLabel') }}</label>
            <input
              id="call-custom-params"
              v-model="customParams"
              class="field-input mono"
              :placeholder="t('functionCallDialog.customParamsPlaceholder')"
              data-testid="custom-call-params"
            />
            <div v-if="customError" class="error" data-testid="custom-call-error">{{ customError }}</div>
            <div class="hint">{{ t('functionCallDialog.customHint') }}</div>
            <TButton size="small" theme="primary" data-testid="insert-custom-call" @click="insertCustom">
              {{ t('functionCallDialog.insertCustom') }}
            </TButton>
          </div>
        </template>

        <template v-else>
          <div class="call-browser-search">
            <input
              v-model="query"
              class="field-input"
              type="search"
              :aria-label="t('functionCallDialog.searchAria')"
              :placeholder="t('functionCallDialog.searchPlaceholder')"
            />
          </div>
          <div class="call-browser-list" role="listbox" :aria-label="t('functionCallDialog.listAria')">
            <div v-if="items.length === 0" class="empty-hint">{{ t('functionCallDialog.listEmpty') }}</div>
            <div
              v-for="item in items"
              :key="item.id"
              class="call-lib-item"
              :class="{ 'call-lib-item--selected': item.id === selectedId }"
              :data-entry-label="item.label"
              :title="item.detail"
              @click="selectItem(item)"
            >
              <span class="badge" :class="`kind-${item.category}`">{{ localize(LIBRARY_CATEGORY_LABELS[item.category]) }}</span>
              <span class="call-lib-name mono">{{ item.label }}</span>
              <span class="call-lib-detail" :title="localize(item.detail)">{{ localize(item.detail) || item.insertText }}</span>
              <button type="button" class="mini-btn lib-insert" @click.stop="insertItem(item)">
                {{ item.kind === 'efb' ? t('functionCallDialog.instanceEllipsis') : t('functionCallDialog.insert') }}
              </button>
            </div>
          </div>

          <div v-if="selectedEfb" class="efb-panel" data-testid="efb-panel">
            <div class="efb-head">
              <span class="badge kind-efb">{{ t('functionCallDialog.efbBadge') }}</span>
              <span class="grow mono">{{ selectedEfb.label }}</span>
            </div>
            <div class="hint" data-testid="efb-parameter-hint">{{ efbParameterHint }}</div>

            <template v-if="efbInstances.length > 0">
              <label for="efb-instance">{{ t('functionCallDialog.declaredInstances') }}</label>
              <select id="efb-instance" v-model="efbInstanceId" class="field-select mono" data-testid="efb-instance">
                <option v-for="instance in efbInstances" :key="instance.id" :value="instance.id">
                  {{ instance.name }}
                </option>
                <option :value="NEW_INSTANCE_ID" data-testid="efb-instance-new">{{ t('functionCallDialog.newInstance') }}</option>
              </select>
            </template>
            <template v-else>
              <div class="hint" data-testid="efb-no-instance">
                {{ t('functionCallDialog.noInstance', { label: selectedEfb.label }) }}
              </div>
            </template>

            <template v-if="creatingInstance">
              <label for="efb-new-instance">
                {{ efbInstances.length > 0 ? t('functionCallDialog.newInstanceName') : t('functionCallDialog.instanceName') }}
              </label>
              <input
                id="efb-new-instance"
                v-model="efbNewName"
                class="field-input mono"
                :placeholder="t('functionCallDialog.instancePlaceholder')"
                data-testid="efb-new-instance"
              />
            </template>

            <div v-if="efbError" class="error" data-testid="efb-error">{{ efbError }}</div>
            <div class="hint" data-testid="efb-outputs">{{ efbOutputHint }}</div>
            <TButton size="small" theme="primary" data-testid="insert-efb-call" @click="insertEfbCall">
              {{ t('functionCallDialog.insertInstance') }}
            </TButton>
          </div>

          <div v-else-if="filter === 'efb'" class="hint">
            {{ t('functionCallDialog.efbOnlyHint') }}
          </div>
        </template>
      </div>
    </div>
  </TDialog>
</template>
