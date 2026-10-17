<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button as TButton, Dialog as TDialog } from 'tdesign-vue-next'
import { validateBlockName } from '../core/newDocument'
import { t } from '../i18n'

/**
 * Top bar "新建功能块" dialog.
 *
 * The dialog owns its form only. It validates the name itself so the message is visible while the
 * user types, then emits `submit`; the caller decides whether the current document may be replaced.
 */
const props = defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void
  (event: 'submit', payload: { name: string; comment: string }): void
}>()

const name = ref('')
const comment = ref('')
const submitted = ref(false)
const errorText = computed(() => submitted.value ? validateBlockName(name.value) ?? '' : '')

const nameHint = computed(() => (name.value.trim() ? validateBlockName(name.value) : null))

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    name.value = ''
    comment.value = ''
    submitted.value = false
  },
  { immediate: true }
)

function close(): void {
  emit('update:visible', false)
}

function submit(): void {
  const error = validateBlockName(name.value)
  if (error) {
    submitted.value = true
    return
  }
  submitted.value = false
  emit('submit', { name: name.value.trim(), comment: comment.value.trim() })
}
</script>

<template>
  <TDialog
    :visible="props.visible"
    :header="t('app.newBlock.title')"
    :footer="false"
    width="min(520px, 94vw)"
    @close="close"
  >
    <div data-testid="new-block-dialog">
    <div class="modal-body">
      <label for="new-block-name">{{ t('app.newBlock.name') }}</label>
      <input
        id="new-block-name"
        v-model="name"
        class="field-input mono"
        :placeholder="t('app.newBlock.namePlaceholder')"
        data-testid="new-block-name"
        @keyup.enter="submit"
      />

      <label for="new-block-comment">{{ t('app.newBlock.comment') }}</label>
      <input
        id="new-block-comment"
        v-model="comment"
        class="field-input"
        :placeholder="t('app.newBlock.commentPlaceholder')"
        data-testid="new-block-comment"
      />

      <div v-if="errorText" class="error" data-testid="new-block-error">{{ errorText }}</div>
      <div v-else-if="nameHint" class="error" data-testid="new-block-name-hint">{{ nameHint }}</div>
      <div class="hint">{{ t('app.newBlock.note') }}</div>
    </div>

    <footer class="modal-foot">
      <TButton size="small" variant="outline" data-testid="new-block-cancel" @click="close">{{ t('app.newBlock.cancel') }}</TButton>
      <TButton size="small" theme="primary" data-testid="new-block-submit" @click="submit">{{ t('app.newBlock.create') }}</TButton>
    </footer>
    </div>
  </TDialog>
</template>
