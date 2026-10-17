<script setup lang="ts">
import { computed, ref } from 'vue'
import { state } from '../store'
import { selectVariable } from '../actions'

const zoom = ref(1)
const pins = computed(() => state.doc?.variables ?? [])
const left = computed(() => pins.value.filter(v => v.category === 'IN' || v.category === 'IN_OUT'))
const right = computed(() => pins.value.filter(v => v.category === 'OUT' || v.category === 'IN_OUT'))
const rows = computed(() => Math.max(left.value.length, right.value.length, 1))
const height = computed(() => 106 + rows.value * 42)
const blockName = computed(() => state.doc?.fbName || state.doc?.sections[0]?.name || '功能块')
const width = computed(() => Math.max(600, blockName.value.length * 9 + 350,
  ...[...left.value, ...right.value].map(v => v.name.length * 16 + 220)))
</script>

<template>
  <section class="panel" data-testid="pin-panel">
    <header class="panel-head">
      <span class="panel-title">引脚调用视图</span>
      <span class="spacer"></span>
      <button class="mini-btn" aria-label="缩小引脚视图" @click="zoom = Math.max(0.5, zoom - 0.1)">−</button>
      <button class="mini-btn" @click="zoom = 1">适应</button>
      <button class="mini-btn" aria-label="放大引脚视图" @click="zoom = Math.min(2, zoom + 0.1)">+</button>
    </header>
    <div class="panel-body pin-canvas">
      <p v-if="!state.doc" class="empty-hint">导入功能块后显示引脚。变量修改后自动更新。</p>
      <p v-else-if="state.doc.kind !== 'xdb'" class="empty-hint">此文件不含独立功能块接口。全局变量不绘制为引脚。</p>
      <svg v-else :viewBox="`0 0 ${width} ${height}`" :style="{ width: `${zoom * 100}%` }" role="img" :aria-label="`${blockName} 引脚示意图`">
        <rect x="150" y="16" :width="width - 300" :height="height - 32" class="fb-outline" />
        <text :x="width / 2" y="40" text-anchor="middle" class="fb-name">{{ blockName }}</text>
        <path :d="`M 110 64 H 150 M ${width - 150} 64 H ${width - 110}`" class="fb-wire" />
        <text x="162" y="68" class="fb-label">EN</text>
        <text :x="width - 162" y="68" text-anchor="end" class="fb-label">ENO</text>
        <g v-for="(pin, index) in left" :key="`left-${pin.id}`" :data-pin-id="pin.id" class="fb-pin" tabindex="0" role="button" :aria-label="pin.name" @click="selectVariable(pin.id, true)" @keydown.enter="selectVariable(pin.id, true)">
          <title>{{ pin.name }} : {{ pin.typeName }} — {{ pin.comment }}</title>
          <path :d="`M 52 ${100 + index * 42} H 150`" class="fb-wire" :class="{ 'fb-wire-bidirectional': pin.category === 'IN_OUT' }" />
          <text x="162" :y="103 + index * 42" class="fb-label">{{ pin.name }}</text>
          <text x="162" :y="117 + index * 42" class="fb-type">{{ pin.category === 'IN_OUT' ? '↔ ' : '' }}{{ pin.typeName }}</text>
        </g>
        <g v-for="(pin, index) in right" :key="`right-${pin.id}`" :data-pin-id="pin.id" class="fb-pin" tabindex="0" role="button" :aria-label="pin.name" @click="selectVariable(pin.id, true)" @keydown.enter="selectVariable(pin.id, true)">
          <title>{{ pin.name }} : {{ pin.typeName }} — {{ pin.comment }}</title>
          <path :d="`M ${width - 150} ${100 + index * 42} H ${width - 52}`" class="fb-wire" :class="{ 'fb-wire-bidirectional': pin.category === 'IN_OUT' }" />
          <text :x="width - 162" :y="103 + index * 42" text-anchor="end" class="fb-label">{{ pin.name }}</text>
          <text :x="width - 162" :y="117 + index * 42" text-anchor="end" class="fb-type">{{ pin.category === 'IN_OUT' ? '↔ ' : '' }}{{ pin.typeName }}</text>
        </g>
      </svg>
    </div>
  </section>
</template>
