<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Button as TButton, Dialog as TDialog } from 'tdesign-vue-next'
import { addVariable, closeVariableEditor, updateVariable } from '../actions'
import { state } from '../store'
import { CATEGORY_LABELS, CATEGORY_ORDER, emptyVariableInput, type VariableCategory, type VariableInput } from '../types'
import { validateVariable } from '../core/validation'

const form = reactive<VariableInput>(emptyVariableInput('IN'))
const errorText = ref('')
const targets = computed(() => CATEGORY_ORDER)

watch(
  () => state.variableEditor,
  (editor) => {
    errorText.value = ''
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

function submit(): void {
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
        <input id="var-type" v-model="form.typeName" class="field-input mono" placeholder="例如 BOOL、INT、ARRAY[0..9] OF INT" />

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
      </div>

      <footer class="modal-foot">
        <TButton size="small" variant="outline" @click="closeVariableEditor">取消</TButton>
        <TButton size="small" theme="primary" @click="submit">保存</TButton>
      </footer>
  </TDialog>
</template>
