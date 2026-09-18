<script setup>
import { ref, computed, nextTick, useId, onBeforeUnmount } from 'vue'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../utils/motion.js'

const props = defineProps({
	modelValue: { type: [String, Number], default: null },
	// [{ value, label, color?, meta? }]；color 會在選項前畫色塊，meta 顯示在右側
	options: { type: Array, required: true },
	// 無障礙名稱
	label: { type: String, required: true },
	// 'field'：一般表單欄位外觀；'cell'：表格內的精簡外觀
	variant: { type: String, default: 'field' },
})
const emit = defineEmits(['update:modelValue'])

// 觸控裝置沿用系統原生選單，和 DateField 一致
const coarse = window.matchMedia('(pointer: coarse)').matches

const listId = useId()
const selected = computed(() => props.options.find((o) => o.value === props.modelValue) || null)

const trigger = ref(null)
const pop = ref(null)
const list = ref(null)
const open = ref(false)
const active = ref(0)
const pos = ref({ top: 0, left: 0, width: 0 })

function place() {
	if (!trigger.value) return
	const r = trigger.value.getBoundingClientRect()
	// 被置頂標題列蓋住或捲出畫面時，面板跟著關閉
	const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0
	if (r.bottom < header || r.top > window.innerHeight) return close(false)
	const width = Math.max(r.width, 176)
	const h = pop.value?.offsetHeight || 260
	let top = r.bottom + 6
	if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6
	const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
	pos.value = { top, left, width }
}

function onOutside(e) {
	if (!pop.value?.contains(e.target) && !trigger.value?.contains(e.target)) close(false)
}

function scrollActive() {
	nextTick(() => list.value?.children[active.value]?.scrollIntoView({ block: 'nearest' }))
}

function openList() {
	if (open.value || !props.options.length) return
	active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
	open.value = true
	document.addEventListener('pointerdown', onOutside, true)
	window.addEventListener('scroll', place, true)
	window.addEventListener('resize', place)
	nextTick(() => {
		place()
		scrollActive()
	})
}

function close(returnFocus) {
	if (!open.value) return
	open.value = false
	document.removeEventListener('pointerdown', onOutside, true)
	window.removeEventListener('scroll', place, true)
	window.removeEventListener('resize', place)
	if (returnFocus) trigger.value?.focus({ preventScroll: true })
}

function choose(option) {
	close(true)
	if (option.value !== props.modelValue) emit('update:modelValue', option.value)
}

// 焦點留在觸發鈕上，用方向鍵移動反白的選項
function onKey(e) {
	const n = props.options.length
	if (!n) return
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
		e.preventDefault()
		if (!open.value) return openList()
		active.value = (active.value + (e.key === 'ArrowDown' ? 1 : -1) + n) % n
		scrollActive()
	} else if (e.key === 'Home' || e.key === 'End') {
		if (!open.value) return
		e.preventDefault()
		active.value = e.key === 'Home' ? 0 : n - 1
		scrollActive()
	} else if (e.key === 'Enter' || e.key === ' ') {
		e.preventDefault()
		if (open.value) choose(props.options[active.value])
		else openList()
	} else if (e.key === 'Escape') {
		if (open.value) {
			e.preventDefault()
			e.stopPropagation()
			close(true)
		}
	} else if (e.key === 'Tab') {
		close(false)
	}
}

function popEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], y: [-6, 0], scale: [0.98, 1], duration: 200, ease: 'out(3)', onComplete: done })
	animate(el.querySelectorAll('.sel-option'), { opacity: [0, 1], x: [-6, 0], duration: 260, delay: (_, i) => Math.min(i, 8) * 18, ease: 'out(3)' })
}

function popLeave(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, y: -4, duration: 120, ease: 'in(2)', onComplete: done })
}

onBeforeUnmount(() => close(false))
</script>

<template>
	<span class="sel" :class="`sel-${variant}`" :style="{ '--swatch': selected?.color }">
		<template v-if="coarse">
			<span v-if="selected?.color" class="sel-swatch native-swatch" aria-hidden="true" />
			<select
				class="sel-native"
				:class="{ 'has-swatch': selected?.color }"
				:aria-label="label"
				:value="modelValue"
				@change="emit('update:modelValue', options[$event.target.selectedIndex].value)"
			>
				<option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
			</select>
			<svg class="sel-caret native-caret" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
				<path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</template>

		<button
			v-else
			ref="trigger"
			type="button"
			class="sel-trigger"
			role="combobox"
			aria-haspopup="listbox"
			:aria-label="label"
			:aria-expanded="open"
			:aria-controls="listId"
			:aria-activedescendant="open ? `${listId}-${active}` : undefined"
			@click="open ? close(true) : openList()"
			@keydown="onKey"
		>
			<span v-if="selected?.color" class="sel-swatch" aria-hidden="true" />
			<span class="sel-text">{{ selected?.label ?? '—' }}</span>
			<svg class="sel-caret" :class="{ open }" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
				<path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		<Teleport to="body">
			<Transition :css="false" @enter="popEnter" @leave="popLeave">
				<div
					v-if="open"
					ref="pop"
					class="sel-pop"
					:style="{ top: `${pos.top}px`, left: `${pos.left}px`, minWidth: `${pos.width}px` }"
					@mousedown.prevent
				>
					<ul :id="listId" ref="list" class="sel-list" role="listbox" :aria-label="label">
						<li
							v-for="(o, i) in options"
							:id="`${listId}-${i}`"
							:key="o.value"
							class="sel-option"
							:class="{ active: i === active, chosen: o.value === modelValue }"
							role="option"
							:aria-selected="o.value === modelValue"
							:style="{ '--swatch': o.color }"
							@pointerenter="active = i"
							@click="choose(o)"
						>
							<span v-if="o.color" class="sel-swatch" aria-hidden="true" />
							<span class="sel-option-label">{{ o.label }}</span>
							<span v-if="o.meta" class="sel-meta">{{ o.meta }}</span>
							<svg class="sel-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</li>
					</ul>
				</div>
			</Transition>
		</Teleport>
	</span>
</template>

<style scoped>
.sel {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
	min-width: 0;
}

.sel-swatch {
	flex-shrink: 0;
	width: 0.55rem;
	height: 0.55rem;
	border-radius: 2px;
	background: var(--swatch);
}

.sel-trigger,
.sel-native {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	width: 100%;
	min-width: 0;
	outline: none;
	color: var(--ink);
	font: inherit;
	text-align: left;
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.sel-text {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.sel-caret {
	flex-shrink: 0;
	color: var(--ink-3);
	transition: transform 0.3s var(--ease-out), color 0.2s;
}

.sel-caret.open {
	transform: rotate(180deg);
	color: var(--brass);
}

.sel-native {
	appearance: none;
}

.sel-native option {
	background: var(--bg);
	color: var(--ink);
}

.native-swatch {
	position: absolute;
	pointer-events: none;
}

.native-caret {
	position: absolute;
	right: 0.85rem;
	pointer-events: none;
}

.sel-field .sel-native {
	padding-right: 2rem;
}

/* 一般表單欄位：與 TextField 一致 */
.sel-field .sel-trigger,
.sel-field .sel-native {
	height: 2.9rem;
	padding: 0 0.85rem;
	border: 1px solid var(--line-strong);
	border-radius: 12px;
	background: var(--sunken-bg);
	font-size: 0.92rem;
}

.sel-field .sel-trigger:hover,
.sel-field .sel-native:hover {
	border-color: color-mix(in srgb, var(--ink) 28%, transparent);
}

.sel-field .sel-trigger:focus-visible,
.sel-field .sel-trigger[aria-expanded="true"],
.sel-field .sel-native:focus {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

.sel-field .native-swatch {
	left: 0.85rem;
}

.sel-field .sel-native.has-swatch {
	padding-left: 1.9rem;
}

/* 表格內：與 .cell 一致，左右內距 0.4rem 讓文字與表頭對齊 */
.sel-cell .sel-trigger,
.sel-cell .sel-native {
	height: 2.1rem;
	padding: 0 0.4rem;
	border: 1px solid transparent;
	border-radius: 8px;
	background: transparent;
	font-size: 0.84rem;
}

.sel-cell .sel-caret {
	opacity: 0;
}

.sel-cell .sel-trigger:hover,
.sel-cell .sel-native:hover {
	border-color: var(--line);
}

.sel-cell .sel-trigger:hover .sel-caret,
.sel-cell .sel-trigger:focus-visible .sel-caret,
.sel-cell .sel-caret.open {
	opacity: 1;
}

.sel-cell .sel-trigger:focus-visible,
.sel-cell .sel-trigger[aria-expanded="true"],
.sel-cell .sel-native:focus {
	border-color: var(--brass);
	background: var(--sunken-bg);
}

.sel-cell .native-swatch {
	left: 0.4rem;
}

.sel-cell .sel-native.has-swatch {
	padding-left: 1.4rem;
}

/* ── 選項面板 ── */
.sel-pop {
	position: fixed;
	z-index: 200;
	max-width: calc(100vw - 16px);
	padding: 0.35rem;
	border: 1px solid var(--line-strong);
	border-radius: 14px;
	/* 疊在頁面底色上變成不透明 */
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-lift);
	color: var(--ink);
	font-family: var(--font-sans);
	transform-origin: top left;
}

.sel-list {
	max-height: 16rem;
	margin: 0;
	padding: 0;
	overflow-y: auto;
	list-style: none;
	scrollbar-width: thin;
}

.sel-option {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	padding: 0.5rem 0.6rem;
	border-radius: 9px;
	font-size: 0.86rem;
	white-space: nowrap;
	cursor: pointer;
	transition: background 0.12s, color 0.12s;
}

.sel-option.active {
	background: color-mix(in srgb, var(--brass) 13%, transparent);
}

.sel-option.chosen {
	color: var(--brass);
}

.sel-option-label {
	flex: 1;
}

.sel-meta {
	margin-left: 0.75rem;
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--ink-3);
}

.sel-check {
	flex-shrink: 0;
	color: var(--brass);
	opacity: 0;
}

.sel-option.chosen .sel-check {
	opacity: 1;
}
</style>
