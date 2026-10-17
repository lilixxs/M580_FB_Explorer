<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button as TButton, Dialog as TDialog } from 'tdesign-vue-next'
import { addVariable, closeVariableEditor, updateVariable } from '../actions'
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
  <TDialog :visible="Boolean(state.variableEditor)" :header="state.variableEditor?.mode === 'edit' ? '修改变量' : '新增变量'" :footer="false" width="min(580px, 94vw)" @close="closeVariableEditor">

      <div class="modal-body">
        <label for="var-category">分类</label>
        <select id="var-category" class="field-select" :value="form.category" @change="pickCategory(($event.target as HTMLSelectElement).value)">
          <option v-for="category in targets" :key="category" :value="category">
            {{ CATEGORY_LABELS[category] }}
          </option>
        </select>

        <label for="var-name">名称</label>
        <input id="var-name" v-model="form.name" class="field-input mono" placeholder="例如 xStart" />

        <label for="var-type">数据类型</label>
        <div class="type-row">
          <input id="var-type" v-model="form.typeName" class="field-input mono" placeholder="例如 BOOL、INT、ARRAY[0..9] OF INT" />
          <button type="button" class="mini-btn" data-testid="open-type-picker" @click="openTypePicker">选择类型</button>
        </div>
        <span></span><div class="call-browser-note" data-testid="type-definition">{{ selectedTypeDefinition?.description || '自定义或扩展类型：本轮未核实目标平台支持，请在 Control Expert 中确认。' }}</div>

        <label for="var-addr">拓扑地址</label>
        <input id="var-addr" v-model="form.topologicalAddress" class="field-input mono" placeholder="例如 %MW100（可留空）" />

        <label for="var-default">默认值</label>
        <input id="var-default" v-model="form.defaultValue" class="field-input mono" placeholder="全局变量默认值，例如 0" />

        <label for="var-init">初值</label>
        <input id="var-init" v-model="form.initValue" class="field-input mono" placeholder="功能块局部变量 variableInit" />

        <label for="var-comment">注释</label>
        <input id="var-comment" v-model="form.comment" class="field-input" placeholder="用途说明" />

        <div v-if="errorText" class="error">{{ errorText }}</div>
        <div v-for="(hint, index) in hints.warnings" :key="index" class="hint">{{ hint }}</div>
        <div class="hint">32 位变量必须绑定偶数 %MW 地址。页面不会自动修改地址。</div>

        <div v-if="typePickerOpen" class="type-picker" data-testid="type-picker" role="region" aria-label="选择数据类型">
          <div class="type-picker-head">
            <span class="type-picker-title">选择数据类型</span>
            <span class="spacer"></span>
            <button
              type="button"
              class="mini-btn"
              :class="{ 'mini-btn--active': !arrayMode }"
              data-testid="type-mode-basic"
              @click="arrayMode = false"
            >
              基础类型
            </button>
            <button
              type="button"
              class="mini-btn"
              :class="{ 'mini-btn--active': arrayMode }"
              data-testid="type-mode-array"
              @click="showArrayMode"
            >
              数组
            </button>
            <button type="button" class="mini-btn" data-testid="type-picker-close" @click="typePickerOpen = false">关闭</button>
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
              :title="BASE_TYPE_LIBRARY.definitions.find((item) => item.name === type)?.description || '旧预设；未核实 M580 支持'"
              @click="pickElementaryType(type)"
            >
              {{ type }}
            </button>
          </div>
          <div class="array-form">
            <label for="type-custom">自定义类型</label>
            <input id="type-custom" v-model="customType" class="field-input mono" placeholder="例如 MotorStatus、STRING[32]" @input="customTypeError = ''" />
            <div v-if="customTypeError" class="error">{{ customTypeError }}</div>
            <button type="button" class="mini-btn" data-testid="apply-custom-type" @click="applyCustomType">使用自定义类型</button>
          </div>
          </template>

          <div v-else class="array-form">
            <label for="array-element">元素类型</label>
            <select id="array-element" v-model="arrayElement" class="field-select mono" data-testid="array-element" @change="arrayElementCustom = ''">
              <option v-for="type in elementaryTypes" :key="type" :value="type">{{ type }}</option>
            </select>

            <label for="array-element-custom">自定义元素类型</label>
            <input
              id="array-element-custom"
              v-model="arrayElementCustom"
              class="field-input mono"
              placeholder="留空则使用上方选择"
              data-testid="array-element-custom"
            />

            <label for="array-lower">下界</label>
            <input id="array-lower" v-model="arrayLower" class="field-input mono" data-testid="array-lower" />

            <label for="array-upper">上界</label>
            <input id="array-upper" v-model="arrayUpper" class="field-input mono" data-testid="array-upper" />

            <div v-if="arrayError" class="error" data-testid="array-error">{{ arrayError }}</div>
            <div class="hint">生成结果：ARRAY[lower..upper] OF 元素类型。</div>
            <button
              type="button"
              class="mini-btn"
              :disabled="Boolean(arrayError)"
              data-testid="apply-array"
              @click="applyArray"
            >
              生成数组类型
            </button>
          </div>
        </div>
      </div>

      <footer class="modal-foot">
        <TButton size="small" variant="outline" @click="closeVariableEditor">取消</TButton>
        <TButton size="small" theme="primary" @click="submit">保存</TButton>
      </footer>
  </TDialog>
</template>
