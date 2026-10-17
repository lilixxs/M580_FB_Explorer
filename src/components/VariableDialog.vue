<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button as TButton, Dialog as TDialog } from 'tdesign-vue-next'
import { addVariable, closeVariableEditor, updateVariable } from '../actions'
import { t } from '../i18n'
import { localize } from '../localize'
import { state } from '../store'
import { CATEGORY_LABELS, CATEGORY_ORDER, emptyVariableInput, type VariableCategory, type VariableInput } from '../types'
import { validateVariable, validateTypeName } from '../core/validation'
import {
  ELEMENTARY_VARIABLE_TYPES,
  BASE_TYPE_LIBRARY,
  buildArrayTypeChecked,
  isElementaryVariableType,
  parseArrayType
} from '../core/functionLibrary'

const form = reactive<VariableInput>(emptyVariableInput('IN'))
const errorText = ref('')
const targets = computed(() => CATEGORY_ORDER)

const typePickerOpen = ref(false)
const arrayMode = ref(false)
const arrayElement = ref('INT')
const arrayElementCustom = ref('')
const arrayLower = ref('0')
const arrayUpper = ref('9')
const customType = ref('')
const customTypeError = ref('')

const elementaryTypes = ELEMENTARY_VARIABLE_TYPES
const selectedTypeDefinition = computed(() => BASE_TYPE_LIBRARY.definitions.find((item) => item.name === form.typeName.toUpperCase()))

/**
 * Type description of the bundled library.
 *
 * The text is bundled data, not a message key, so it goes through the shared label helper: an
 * unknown or user defined type is returned unchanged instead of blanking the note.
 */
function typeDescription(name: string): string {
  return localize(BASE_TYPE_LIBRARY.definitions.find((item) => item.name === name)?.description ?? '')
}

watch(
  () => state.variableEditor,
  (editor) => {
    errorText.value = ''
    typePickerOpen.value = false
    arrayMode.value = false
    arrayElementCustom.value = ''
    arrayElement.value = 'INT'
    arrayLower.value = '0'
    arrayUpper.value = '9'
    if (!editor) return
    if (editor.mode === 'edit') {
      const variable = state.doc?.variables.find((item) => item.id === editor.variableId)
      if (variable) {
        Object.assign(form, {
          name: variable.name,
          typeName: variable.typeName,
          category: variable.category,
          topologicalAddress: variable.topologicalAddress,
          defaultValue: variable.defaultValue,
          comment: variable.comment,
          initValue: variable.initValue
        })
        return
      }
    }
    Object.assign(form, emptyVariableInput(editor.category))
  },
  { immediate: true }
)

const hints = computed(() => {
  const reports = validateVariable(
    { name: form.name, typeName: form.typeName, topologicalAddress: form.topologicalAddress, category: form.category },
    state.doc?.variables ?? [],
    state.variableEditor?.variableId ?? ''
  )
  return reports
})

/** Live validation of the array mode inputs, so the error text updates while typing. */
const arrayError = computed(() => {
  if (!arrayMode.value) return ''
  const result = buildArrayTypeChecked(
    arrayElement.value,
    arrayElementCustom.value,
    arrayLower.value,
    arrayUpper.value
  )
  return result.ok ? '' : result.error
})

function submit(): void {
  errorText.value = ''
  const editor = state.variableEditor
  if (!editor) return
  const error = editor.mode === 'edit' ? updateVariable(editor.variableId, form) : addVariable(form)
  if (error) {
    errorText.value = error
    return
  }
  closeVariableEditor()
}

function pickCategory(value: string): void {
  form.category = value as VariableCategory
}

/** Seed the picker from the current free-text type; optionally open it. */
function seedPicker(open: boolean): void {
  arrayElementCustom.value = ''
  customType.value = form.typeName
  customTypeError.value = ''
  const parsed = parseArrayType(form.typeName)
  if (parsed) {
    arrayMode.value = true
    arrayLower.value = String(parsed.lower)
    arrayUpper.value = String(parsed.upper)
    if (isElementaryVariableType(parsed.elementType)) {
      arrayElement.value = parsed.elementType.trim().toUpperCase()
      arrayElementCustom.value = ''
    } else {
      arrayElementCustom.value = parsed.elementType
    }
  } else {
    arrayMode.value = false
    if (isElementaryVariableType(form.typeName)) arrayElement.value = form.typeName.trim().toUpperCase()
  }
  if (open) typePickerOpen.value = true
}

function openTypePicker(): void {
  seedPicker(true)
}

/** The array tab always shows the array form, even when the current type is elementary. */
function showArrayMode(): void {
  seedPicker(false)
  arrayMode.value = true
}

function pickElementaryType(type: string): void {
  form.typeName = type
  typePickerOpen.value = false
}

function applyArray(): void {
  const result = buildArrayTypeChecked(
    arrayElement.value,
    arrayElementCustom.value,
    arrayLower.value,
    arrayUpper.value
  )
  if (!result.ok) return
  form.typeName = result.typeName
  typePickerOpen.value = false
}

function applyCustomType(): void {
  const error = validateTypeName(customType.value)
  if (error) {
    customTypeError.value = error
    return
  }
  form.typeName = customType.value.trim()
  typePickerOpen.value = false
}
</script>

<template>
  <TDialog :visible="Boolean(state.variableEditor)" :header="state.variableEditor?.mode === 'edit' ? t('variableDialog.titleEdit') : t('variableDialog.titleAdd')" :footer="false" width="min(580px, 94vw)" @close="closeVariableEditor">

      <div class="modal-body">
        <label for="var-category">{{ t('variableDialog.category') }}</label>
        <select id="var-category" class="field-select" :value="form.category" @change="pickCategory(($event.target as HTMLSelectElement).value)">
          <option v-for="category in targets" :key="category" :value="category">
            {{ localize(CATEGORY_LABELS[category]) }}
          </option>
        </select>

        <label for="var-name">{{ t('variableDialog.name') }}</label>
        <input id="var-name" v-model="form.name" class="field-input mono" :placeholder="t('variableDialog.namePlaceholder')" />

        <label for="var-type">{{ t('variableDialog.typeName') }}</label>
        <div class="type-row">
          <input id="var-type" v-model="form.typeName" class="field-input mono" :placeholder="t('variableDialog.typePlaceholder')" />
          <button type="button" class="mini-btn" data-testid="open-type-picker" @click="openTypePicker">{{ t('variableDialog.pickType') }}</button>
        </div>
        <span></span><div class="call-browser-note" data-testid="type-definition">{{ localize(selectedTypeDefinition?.description ?? '') || t('variableDialog.customTypeNotice') }}</div>

        <label for="var-addr">{{ t('variableDialog.address') }}</label>
        <input id="var-addr" v-model="form.topologicalAddress" class="field-input mono" :placeholder="t('variableDialog.addressPlaceholder')" />

        <label for="var-default">{{ t('variableDialog.defaultValue') }}</label>
        <input id="var-default" v-model="form.defaultValue" class="field-input mono" :placeholder="t('variableDialog.defaultValuePlaceholder')" />

        <label for="var-init">{{ t('variableDialog.initValue') }}</label>
        <input id="var-init" v-model="form.initValue" class="field-input mono" :placeholder="t('variableDialog.initValuePlaceholder')" />

        <label for="var-comment">{{ t('variableDialog.comment') }}</label>
        <input id="var-comment" v-model="form.comment" class="field-input" :placeholder="t('variableDialog.commentPlaceholder')" />

        <div v-if="errorText" class="error">{{ errorText }}</div>
        <div v-for="(hint, index) in hints.warnings" :key="index" class="hint">{{ hint }}</div>
        <div class="hint">{{ t('variableDialog.addressHint') }}</div>

        <div v-if="typePickerOpen" class="type-picker" data-testid="type-picker" role="region" :aria-label="t('variableDialog.typePickerAria')">
          <div class="type-picker-head">
            <span class="type-picker-title">{{ t('variableDialog.typePickerTitle') }}</span>
            <span class="spacer"></span>
            <button
              type="button"
              class="mini-btn"
              :class="{ 'mini-btn--active': !arrayMode }"
              data-testid="type-mode-basic"
              @click="arrayMode = false"
            >
              {{ t('variableDialog.basicTypes') }}
            </button>
            <button
              type="button"
              class="mini-btn"
              :class="{ 'mini-btn--active': arrayMode }"
              data-testid="type-mode-array"
              @click="showArrayMode"
            >
              {{ t('variableDialog.arrayMode') }}
            </button>
            <button type="button" class="mini-btn" data-testid="type-picker-close" @click="typePickerOpen = false">{{ t('common.close') }}</button>
          </div>

          <template v-if="!arrayMode">
          <div class="type-grid">
            <button
              v-for="type in elementaryTypes"
              :key="type"
              type="button"
              class="type-chip mono"
              :class="{ 'type-chip--active': form.typeName.trim().toUpperCase() === type }"
              :data-type="type"
              :title="typeDescription(type) || t('variableDialog.unverifiedPreset')"
              @click="pickElementaryType(type)"
            >
              {{ type }}
            </button>
          </div>
          <div class="array-form">
            <label for="type-custom">{{ t('variableDialog.customType') }}</label>
            <input id="type-custom" v-model="customType" class="field-input mono" :placeholder="t('variableDialog.customTypePlaceholder')" @input="customTypeError = ''" />
            <div v-if="customTypeError" class="error">{{ customTypeError }}</div>
            <button type="button" class="mini-btn" data-testid="apply-custom-type" @click="applyCustomType">{{ t('variableDialog.applyCustomType') }}</button>
          </div>
          </template>

          <div v-else class="array-form">
            <label for="array-element">{{ t('variableDialog.arrayElement') }}</label>
            <select id="array-element" v-model="arrayElement" class="field-select mono" data-testid="array-element" @change="arrayElementCustom = ''">
              <option v-for="type in elementaryTypes" :key="type" :value="type">{{ type }}</option>
            </select>

            <label for="array-element-custom">{{ t('variableDialog.arrayElementCustom') }}</label>
            <input
              id="array-element-custom"
              v-model="arrayElementCustom"
              class="field-input mono"
              :placeholder="t('variableDialog.arrayElementCustomPlaceholder')"
              data-testid="array-element-custom"
            />

            <label for="array-lower">{{ t('variableDialog.arrayLower') }}</label>
            <input id="array-lower" v-model="arrayLower" class="field-input mono" data-testid="array-lower" />

            <label for="array-upper">{{ t('variableDialog.arrayUpper') }}</label>
            <input id="array-upper" v-model="arrayUpper" class="field-input mono" data-testid="array-upper" />

            <div v-if="arrayError" class="error" data-testid="array-error">{{ arrayError }}</div>
            <div class="hint">{{ t('variableDialog.arrayHint') }}</div>
            <button
              type="button"
              class="mini-btn"
              :disabled="Boolean(arrayError)"
              data-testid="apply-array"
              @click="applyArray"
            >
              {{ t('variableDialog.applyArray') }}
            </button>
          </div>
        </div>
      </div>

      <footer class="modal-foot">
        <TButton size="small" variant="outline" @click="closeVariableEditor">{{ t('common.cancel') }}</TButton>
        <TButton size="small" theme="primary" @click="submit">{{ t('common.save') }}</TButton>
      </footer>
  </TDialog>
</template>
