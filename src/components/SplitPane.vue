<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { t } from '../i18n'

const props = withDefaults(
  defineProps<{
    direction?: 'horizontal' | 'vertical'
    defaultSize?: number
    minSize?: number
    maxSize?: number
    storageKey?: string
  }>(),
  {
    direction: 'horizontal',
    defaultSize: 40,
    minSize: 12,
    maxSize: 88,
    storageKey: ''
  }
)

const container = ref<HTMLElement | null>(null)
const dragging = ref(false)
let captured: HTMLElement | null = null
let pointerId: number | null = null

function clamp(value: number): number {
  return Math.min(props.maxSize, Math.max(props.minSize, value))
}

function readInitialSize(): number {
  try { if (props.storageKey && typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(`m580-split:${props.storageKey}`)
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw)
    if (Number.isFinite(parsed)) return clamp(parsed)
  } } catch { /* Storage can be blocked in a sandbox or private context. */ }
  return clamp(props.defaultSize)
}

const size = ref(readInitialSize())

const paneAStyle = computed(() =>
  props.direction === 'horizontal' ? { width: `${size.value}%` } : { height: `${size.value}%` }
)

function persist(): void {
  try { if (props.storageKey && typeof localStorage !== 'undefined') {
    localStorage.setItem(`m580-split:${props.storageKey}`, String(size.value))
  } } catch { /* Layout remains usable without storage. */ }
}

function onPointerMove(event: PointerEvent): void {
  const rect = container.value?.getBoundingClientRect()
  if (!rect) return
  const ratio =
    props.direction === 'horizontal'
      ? ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100
      : ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100
  size.value = clamp(ratio)
}

function stopDrag(): void {
  dragging.value = false
  if (captured && pointerId !== null && captured.hasPointerCapture?.(pointerId)) {
    captured.releasePointerCapture(pointerId)
  }
  captured = null
  pointerId = null
  if (typeof window === 'undefined') return
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', stopDrag)
  window.removeEventListener('pointercancel', stopDrag)
  window.removeEventListener('blur', stopDrag)
  persist()
}

function startDrag(event: PointerEvent): void {
  if (typeof window === 'undefined' || event.button !== 0) return
  captured = event.currentTarget as HTMLElement
  pointerId = event.pointerId
  captured.setPointerCapture?.(event.pointerId)
  dragging.value = true
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', stopDrag)
  window.addEventListener('pointercancel', stopDrag)
  window.addEventListener('blur', stopDrag)
  event.preventDefault()
}

function resetSize(): void {
  size.value = clamp(props.defaultSize)
  persist()
}

function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 6 : 2
  if (props.direction === 'horizontal') {
    if (event.key === 'ArrowLeft') size.value = clamp(size.value - step)
    else if (event.key === 'ArrowRight') size.value = clamp(size.value + step)
    else return
  } else {
    if (event.key === 'ArrowUp') size.value = clamp(size.value - step)
    else if (event.key === 'ArrowDown') size.value = clamp(size.value + step)
    else return
  }
  event.preventDefault()
  persist()
}

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', stopDrag)
    window.removeEventListener('pointercancel', stopDrag)
    window.removeEventListener('blur', stopDrag)
  }
})
</script>

<template>
  <div ref="container" class="split" :class="`split--${props.direction}`">
    <div class="split-pane" :style="paneAStyle">
      <slot name="a" />
    </div>
    <div
      class="split-bar"
      role="separator"
      tabindex="0"
      :aria-orientation="props.direction === 'horizontal' ? 'vertical' : 'horizontal'"
      :aria-label="t('splitPane.resizeHandle')"
      :aria-valuenow="Math.round(size)"
      :aria-valuemin="props.minSize"
      :aria-valuemax="props.maxSize"
      :data-dragging="dragging"
      :title="t('splitPane.resizeHint')"
      @pointerdown="startDrag"
      @dblclick="resetSize"
      @keydown="onKeydown"
    ></div>
    <div class="split-pane split-pane--grow">
      <slot name="b" />
    </div>
  </div>
</template>
