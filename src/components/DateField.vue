<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../utils/motion.js'

const props = defineProps({
	// 'YYYY-MM-DD'，未填為空字串
	modelValue: { type: String, default: '' },
	// 無障礙名稱，也用在日曆面板的標題
	label: { type: String, required: true },
	// 'field'：一般表單欄位外觀；'cell'：表格內的精簡外觀
	variant: { type: String, default: 'field' },
})
const emit = defineEmits(['update:modelValue'])

// 觸控裝置沿用系統原生的日期選擇器，觸控操作比自製面板順手
const coarse = window.matchMedia('(pointer: coarse)').matches

const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const display = (iso) => (iso ? iso.replaceAll('-', '/') : '')
const today = toISO(new Date())

function fromISO(iso) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
	return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

// 接受 2026/3/5、2026-03-05、20260305 等寫法，日期不存在（如 2/30）視為無效
function parse(str) {
	const m = /^\s*(\d{4})\D?(\d{1,2})\D?(\d{1,2})\s*$/.exec(str)
	if (!m) return null
	const d = new Date(+m[1], +m[2] - 1, +m[3])
	return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? toISO(d) : null
}

// ── 文字輸入：按 Enter 或離開欄位才寫入，無效就還原 ──
const text = ref(display(props.modelValue))
watch(
	() => props.modelValue,
	(v) => (text.value = display(v)),
)

function commit(iso) {
	text.value = display(iso)
	if (iso !== props.modelValue) emit('update:modelValue', iso)
}

function commitText() {
	const iso = parse(text.value)
	if (iso) commit(iso)
	else text.value = display(props.modelValue)
}

// ── 日曆面板 ──
const root = ref(null)
const input = ref(null)
const pop = ref(null)
const grid = ref(null)
const open = ref(false)
const view = ref(new Date())
const focusDay = ref(today)
const pos = ref({ top: 0, left: 0 })

const title = computed(() => `${view.value.getFullYear()} 年 ${view.value.getMonth() + 1} 月`)

// 固定 6 週 42 格，換月份時面板高度不變
const days = computed(() => {
	const y = view.value.getFullYear()
	const m = view.value.getMonth()
	const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
	return Array.from({ length: 42 }, (_, i) => {
		const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
		return { iso: toISO(d), day: d.getDate(), inMonth: d.getMonth() === m }
	})
})

function place() {
	if (!input.value) return
	const r = input.value.getBoundingClientRect()
	// 輸入框被置頂標題列蓋住或捲出畫面時，面板跟著關閉
	const header = document.querySelector('.header')?.getBoundingClientRect().bottom ?? 0
	if (r.bottom < header || r.top > window.innerHeight) return close(false)
	const w = pop.value?.offsetWidth || 280
	const h = pop.value?.offsetHeight || 340
	let top = r.bottom + 6
	if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6
	const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
	pos.value = { top, left }
}

function onOutside(e) {
	if (!pop.value?.contains(e.target) && !root.value?.contains(e.target)) close(false)
}

function focusGrid() {
	nextTick(() => grid.value?.querySelector(`[data-iso="${focusDay.value}"]`)?.focus({ preventScroll: true }))
}

// 用滑鼠點輸入框時焦點留在輸入框（還能直接打字）；用鍵盤或日曆鈕打開時焦點移到日期格
function openPicker(toGrid) {
	if (!open.value) {
		const selected = fromISO(props.modelValue) || new Date()
		view.value = new Date(selected.getFullYear(), selected.getMonth(), 1)
		focusDay.value = props.modelValue || today
		open.value = true
		document.addEventListener('pointerdown', onOutside, true)
		window.addEventListener('scroll', place, true)
		window.addEventListener('resize', place)
		nextTick(place)
	}
	if (toGrid) focusGrid()
}

function close(returnFocus) {
	if (!open.value) return
	open.value = false
	document.removeEventListener('pointerdown', onOutside, true)
	window.removeEventListener('scroll', place, true)
	window.removeEventListener('resize', place)
	if (returnFocus) input.value?.focus({ preventScroll: true })
}

function pick(iso) {
	close(true)
	commit(iso)
	// 父層可能因日期改變而重新排序、搬動這一列，搬動會讓焦點掉落，等更新完再聚焦回來
	nextTick(() => input.value?.focus({ preventScroll: true }))
}

// 面板開著時打出完整日期，面板跳到那個月份
watch(text, (value) => {
	const iso = open.value && parse(value)
	if (!iso) return
	const d = fromISO(iso)
	const delta = (d.getFullYear() - view.value.getFullYear()) * 12 + d.getMonth() - view.value.getMonth()
	focusDay.value = iso
	if (delta) changeMonth(delta)
})

function changeMonth(delta) {
	view.value = new Date(view.value.getFullYear(), view.value.getMonth() + delta, 1)
	if (prefersReducedMotion() || !grid.value) return
	animate(grid.value, { opacity: [0, 1], x: [delta * 14, 0], duration: 260, ease: 'out(3)' })
}

// 日期格的鍵盤操作：方向鍵移動、PageUp／PageDown 換月、Esc 關閉
function onGridKey(e) {
	const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
	const monthStep = { PageUp: -1, PageDown: 1 }[e.key]
	if (step == null && monthStep == null) return
	e.preventDefault()
	const cur = fromISO(focusDay.value)
	const next = monthStep
		? new Date(cur.getFullYear(), cur.getMonth() + monthStep, Math.min(cur.getDate(), 28))
		: new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + step)
	const delta = (next.getFullYear() - view.value.getFullYear()) * 12 + next.getMonth() - view.value.getMonth()
	if (delta) changeMonth(delta)
	focusDay.value = toISO(next)
	focusGrid()
}

// 輸入框失焦：寫入文字；若焦點不是移進面板（例如按 Tab 到下一欄）就關閉面板
function onInputBlur(e) {
	commitText()
	if (!pop.value?.contains(e.relatedTarget)) close(false)
}

// 點面板上非按鈕的地方時不要搶走焦點，避免輸入框失焦把面板關掉
function keepFocus(e) {
	if (!e.target.closest('button')) e.preventDefault()
}

// 焦點離開面板（例如按 Tab 出去）時關閉
function onFocusOut(e) {
	if (!pop.value?.contains(e.relatedTarget) && e.relatedTarget !== input.value) close(false)
}

function popEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], y: [-6, 0], scale: [0.98, 1], duration: 200, ease: 'out(3)', onComplete: done })
}

function popLeave(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, y: -4, duration: 120, ease: 'in(2)', onComplete: done })
}

onBeforeUnmount(() => close(false))
</script>

<template>
	<span ref="root" class="date" :class="`date-${variant}`">
		<input
			v-if="coarse"
			type="date"
			class="date-input native"
			:aria-label="label"
			:value="modelValue"
			@change="commit($event.target.value)"
		/>
		<template v-else>
			<input
				ref="input"
				v-model="text"
				type="text"
				inputmode="numeric"
				class="date-input"
				placeholder="YYYY/MM/DD"
				maxlength="10"
				autocomplete="off"
				:aria-label="label"
				aria-haspopup="dialog"
				:aria-expanded="open"
				@click="openPicker(false)"
				@keydown.enter.prevent="commitText(); close(false)"
				@keydown.down.prevent="openPicker(true)"
				@keydown.esc="close(false)"
				@blur="onInputBlur"
			/>
			<button
				type="button"
				class="date-icon"
				tabindex="-1"
				:aria-label="`選擇${label}`"
				@mousedown.prevent
				@click="open ? close(true) : openPicker(true)"
			>
				<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
					<rect x="1.75" y="2.75" width="10.5" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.3" />
					<path d="M1.75 5.75h10.5M4.5 1.5v2.5M9.5 1.5v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
				</svg>
			</button>
		</template>

		<Teleport to="body">
			<Transition :css="false" @enter="popEnter" @leave="popLeave">
				<div
					v-if="open"
					ref="pop"
					class="date-pop"
					role="dialog"
					:aria-label="`選擇${label}`"
					:style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
					@keydown.esc.stop="close(true)"
					@focusout="onFocusOut"
					@mousedown="keepFocus"
				>
					<header class="date-head">
						<button type="button" class="date-nav" aria-label="上個月" @click="changeMonth(-1)">
							<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M7.5 2.5L4 6l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
						<span class="date-title" aria-live="polite">{{ title }}</span>
						<button type="button" class="date-nav" aria-label="下個月" @click="changeMonth(1)">
							<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M4.5 2.5L8 6 4.5 9.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
						</button>
					</header>

					<div class="date-week" aria-hidden="true">
						<span v-for="w in '日一二三四五六'" :key="w">{{ w }}</span>
					</div>

					<div ref="grid" class="date-grid" role="grid" @keydown="onGridKey">
						<button
							v-for="d in days"
							:key="d.iso"
							type="button"
							class="date-day"
							:class="{ out: !d.inMonth, today: d.iso === today, selected: d.iso === modelValue }"
							:tabindex="d.iso === focusDay ? 0 : -1"
							:data-iso="d.iso"
							:aria-label="display(d.iso)"
							:aria-selected="d.iso === modelValue"
							@click="pick(d.iso)"
						>
							{{ d.day }}
						</button>
					</div>

					<footer class="date-foot">
						<button type="button" class="date-today" @click="pick(today)">今天</button>
					</footer>
				</div>
			</Transition>
		</Teleport>
	</span>
</template>

<style scoped>
.date {
	position: relative;
	display: flex;
	align-items: center;
	width: 100%;
}

.date-input {
	width: 100%;
	min-width: 0;
	outline: none;
	color: var(--ink);
	font-family: var(--font-mono);
	font-variant-numeric: tabular-nums;
	transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.date-input::placeholder {
	color: var(--ink-3);
	opacity: 0.75;
}

.date-icon {
	position: absolute;
	right: 0.3rem;
	display: grid;
	place-items: center;
	width: 1.5rem;
	height: 1.5rem;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.2s, background 0.2s;
}

.date-icon:hover {
	color: var(--brass);
	background: color-mix(in srgb, var(--brass) 12%, transparent);
}

/* 表格內：與 StockCard 的 .cell 一致，左右內距 0.4rem 讓數值與表頭對齊 */
.date-cell .date-input {
	height: 2.1rem;
	padding: 0 1.8rem 0 0.4rem;
	border: 1px solid transparent;
	border-radius: 8px;
	background: transparent;
	font-size: 0.84rem;
}

.date-cell .date-input:hover {
	border-color: var(--line);
}

.date-cell .date-input:focus {
	border-color: var(--brass);
	background: var(--sunken-bg);
}

/* 一般表單欄位：與 TextField 一致 */
.date-field .date-input {
	height: 2.9rem;
	padding: 0 2.2rem 0 0.85rem;
	border: 1px solid var(--line-strong);
	border-radius: 12px;
	background: var(--sunken-bg);
	font-size: 0.95rem;
}

.date-field .date-input:focus {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

.date-field .date-icon {
	right: 0.55rem;
}

.date-input.native {
	padding-right: 0.4rem;
}

/* ── 日曆面板 ── */
.date-pop {
	position: fixed;
	z-index: 200;
	width: 17.5rem;
	padding: 0.75rem;
	border: 1px solid var(--line-strong);
	border-radius: 16px;
	/* 疊在頁面底色上變成不透明 */
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-lift);
	color: var(--ink);
	font-family: var(--font-sans);
	transform-origin: top left;
}

.date-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
}

.date-title {
	font-family: var(--font-serif);
	font-size: 0.95rem;
	font-weight: 600;
}

.date-nav {
	display: grid;
	place-items: center;
	width: 2rem;
	height: 2rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.date-nav:hover {
	border-color: var(--line-strong);
	color: var(--ink);
}

.date-week,
.date-grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 0.15rem;
}

.date-week span {
	padding: 0.2rem 0;
	font-size: 0.7rem;
	color: var(--ink-3);
	text-align: center;
}

.date-grid {
	overflow: hidden;
}

.date-day {
	display: grid;
	place-items: center;
	height: 2.1rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.8rem;
	cursor: pointer;
	transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.date-day:hover {
	background: color-mix(in srgb, var(--brass) 14%, transparent);
}

.date-day.out {
	color: var(--ink-3);
	opacity: 0.55;
}

.date-day.today {
	border-color: color-mix(in srgb, var(--brass) 60%, transparent);
	color: var(--brass);
}

.date-day.selected {
	border-color: var(--brass);
	background: var(--brass);
	color: var(--on-brass);
	opacity: 1;
}

.date-day:focus-visible {
	outline: 2px solid var(--brass);
	outline-offset: 1px;
}

.date-foot {
	display: flex;
	justify-content: flex-end;
	margin-top: 0.5rem;
	padding-top: 0.5rem;
	border-top: 1px solid var(--line);
}

.date-today {
	padding: 0.3rem 0.8rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	color: var(--ink-2);
	font-size: 0.76rem;
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s;
}

.date-today:hover {
	border-color: var(--brass);
	color: var(--brass);
}
</style>
