<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { createAnimatable } from 'animejs'
import TextField from '../TextField.vue'
import NumberField from '../NumberField.vue'
import ModalDialog from '../ModalDialog.vue'
import { CARD_COLORS, todayISO, billMonthOf, periodOf, dueDateOf, shortDate, parseMonth } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	cards: { type: Array, required: true },
	txs: { type: Array, required: true },
})
const emit = defineEmits(['add', 'update', 'remove'])

// 新卡片預設選一個還沒被其他卡片用過的顏色，都用過了就依序輪流
function freeColor() {
	const used = new Set(props.cards.map((c) => c.color % CARD_COLORS.length))
	const index = CARD_COLORS.findIndex((_, i) => !used.has(i))
	return index >= 0 ? index : props.cards.length % CARD_COLORS.length
}

const blank = () => ({ name: '', last4: '', closingDay: null, dueDay: null, limit: null, color: freeColor() })

// editing 為 null 代表視窗關著；'new' 是新增；數字是編輯中的卡片 id。
// shown 保留最後一次的模式，視窗淡出時標題與按鈕文字才不會跳掉
const editing = ref(null)
const shown = ref('new')
const form = ref(blank())
const errors = ref({})

const txCount = (id) => props.txs.filter((tx) => tx.cardId === id).length
const editingCard = computed(() => props.cards.find((c) => c.id === shown.value))

function startAdd() {
	form.value = blank()
	errors.value = {}
	confirmDelete.value = false
	editing.value = shown.value = 'new'
}

function startEdit(card) {
	form.value = {
		name: card.name,
		last4: card.last4,
		closingDay: card.closingDay,
		dueDay: card.dueDay,
		limit: card.limit,
		color: card.color % CARD_COLORS.length,
	}
	errors.value = {}
	confirmDelete.value = false
	editing.value = shown.value = card.id
}

function close() {
	editing.value = null
	clearTimeout(confirmTimer)
	confirmDelete.value = false
}

const validDay = (v) => Number.isInteger(v) && v >= 1 && v <= 31

// 即時預覽：用目前填的結帳日、繳款日，算出今天刷卡會記進哪一期
const preview = computed(() => {
	const { closingDay, dueDay } = form.value
	if (!validDay(closingDay)) return null
	const month = billMonthOf(todayISO(), closingDay)
	const { start, end } = periodOf(month, closingDay)
	return {
		month: `${parseMonth(month).m} 月帳單`,
		range: `${shortDate(start)} – ${shortDate(end)}`,
		due: validDay(dueDay) ? shortDate(dueDateOf(month, closingDay, dueDay)) : null,
	}
})

function save() {
	const f = form.value
	const next = {}
	if (!f.name.trim()) next.name = '請輸入卡片名稱'
	if (f.last4 && !/^\d{4}$/.test(f.last4.trim())) next.last4 = '請輸入 4 位數字'
	if (!validDay(f.closingDay)) next.closingDay = '請輸入 1–31'
	if (!validDay(f.dueDay)) next.dueDay = '請輸入 1–31'
	if (f.limit != null && !(f.limit > 0)) next.limit = '額度需大於 0'
	errors.value = next
	if (Object.keys(next).length) return

	const data = { name: f.name.trim(), last4: f.last4.trim(), closingDay: f.closingDay, dueDay: f.dueDay, limit: f.limit, color: f.color }
	if (editing.value === 'new') emit('add', data)
	else emit('update', editing.value, data)
	close()
}

// 刪除卡片會一併刪除消費，要再按一次確認
const confirmDelete = ref(false)
let confirmTimer = null

function remove() {
	if (!confirmDelete.value) {
		confirmDelete.value = true
		clearTimeout(confirmTimer)
		confirmTimer = setTimeout(() => (confirmDelete.value = false), 3000)
		return
	}
	const id = editing.value
	close()
	emit('remove', id)
}

// ── 顏色選擇：選中的外框滑到新的色塊 ──
const swatches = ref(null)
const ring = ref(null)
let mover = null

// 時長一律明確傳入，瞬間定位用 1ms（createAnimatable 設過 0 之後就不會再動畫）
function placeRing(instant) {
	const btn = swatches.value?.querySelector('.swatch.on')
	if (!btn || !ring.value) return
	mover ??= createAnimatable(ring.value, { x: { unit: 'px' }, y: { unit: 'px' }, duration: 420, ease: 'out(4)' })
	const duration = instant || prefersReducedMotion() ? 1 : 420
	mover.x(btn.offsetLeft, duration)
	mover.y(btn.offsetTop, duration)
}

function pickColor(i) {
	form.value.color = i
	nextTick(() => placeRing(false))
}

function onSwatchKey(e) {
	const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key]
	if (!step) return
	e.preventDefault()
	pickColor((form.value.color + step + CARD_COLORS.length) % CARD_COLORS.length)
	nextTick(() => swatches.value?.querySelector('.swatch.on')?.focus())
}

// 視窗每次打開都是新的 DOM，外框要重新建立並瞬間定位
watch(editing, (value) => {
	mover?.revert()
	mover = null
	if (value != null) nextTick(() => placeRing(true))
})

onBeforeUnmount(() => mover?.revert())

defineExpose({ startAdd, startEdit })
</script>

<template>
	<section class="panel card-manager">
		<header class="section-head">
			<h2 class="section-title">信用卡</h2>
			<button v-if="cards.length" type="button" class="link-btn" @click="startAdd">＋ 新增卡片</button>
		</header>

		<ul v-if="cards.length" class="card-list">
			<li v-for="card in cards" :key="card.id">
				<button
					type="button"
					class="card-item"
					:style="{ '--card': CARD_COLORS[card.color % CARD_COLORS.length] }"
					:aria-label="`編輯 ${card.name}`"
					@click="startEdit(card)"
				>
					<span class="card-chip" aria-hidden="true" />
					<span class="card-main">
						<span class="card-name">
							{{ card.name }}
							<small v-if="card.last4">•• {{ card.last4 }}</small>
						</span>
						<span class="card-meta">
							<span>結帳 {{ card.closingDay }} 日</span>
							<span>繳款 {{ card.dueDay }} 日</span>
							<span v-if="card.limit">額度 {{ fmtNumber(card.limit) }}</span>
						</span>
					</span>
					<svg class="card-edit" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
						<path d="M2 10h2l5.5-5.5-2-2L2 8z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
					</svg>
				</button>
			</li>
		</ul>
		<template v-else>
			<p class="card-empty">還沒有信用卡。先新增一張，設定結帳日與繳款日，消費就會自動歸到對應的帳單。</p>
			<button type="button" class="btn btn-sm btn-primary card-first" @click="startAdd">新增卡片</button>
		</template>

		<ModalDialog
			:open="editing != null"
			:title="shown === 'new' ? '新增信用卡' : `編輯 ${editingCard?.name ?? ''}`"
			:eyebrow="shown === 'new' ? 'New Card · 設定結帳日與繳款日' : 'Edit Card · 修改後消費會重新歸屬帳單'"
			@close="close"
		>
			<form class="card-form" novalidate @submit.prevent="save">
				<div class="form-grid">
					<TextField v-model="form.name" label="卡片名稱" placeholder="例如：玉山 Pi" :error="errors.name" hint="必填" />
					<TextField v-model="form.last4" label="末四碼" placeholder="1234" maxlength="4" mono :error="errors.last4" hint="選填，用來辨識卡片" />
					<NumberField v-model="form.closingDay" label="結帳日" suffix="日" step="1" placeholder="5" :error="errors.closingDay" hint="每月幾號結帳" />
					<NumberField v-model="form.dueDay" label="繳款日" suffix="日" step="1" placeholder="20" :error="errors.dueDay" hint="每月幾號繳款截止" />
					<NumberField v-model="form.limit" class="form-wide" label="信用額度" suffix="元" step="1000" placeholder="選填" :error="errors.limit" hint="用來算額度使用率" />
					<div class="field form-wide">
						<span class="field-label">卡片顏色</span>
						<div ref="swatches" class="swatches" role="radiogroup" aria-label="卡片顏色" @keydown="onSwatchKey">
							<span ref="ring" class="swatch-ring" aria-hidden="true" />
							<button
								v-for="(c, i) in CARD_COLORS"
								:key="c"
								type="button"
								role="radio"
								class="swatch"
								:class="{ on: form.color === i }"
								:style="{ '--card': c }"
								:aria-checked="form.color === i"
								:aria-label="`顏色 ${i + 1}`"
								:tabindex="form.color === i ? 0 : -1"
								@click="pickColor(i)"
							>
								<span class="card-chip" />
							</button>
						</div>
					</div>
				</div>

				<div class="preview" :class="{ empty: !preview }">
					<span class="preview-card" :style="{ '--card': CARD_COLORS[form.color] }">
						<span class="card-chip" aria-hidden="true" />
						<span class="preview-name">{{ form.name.trim() || '卡片名稱' }}</span>
					</span>
					<p aria-live="polite">
						<template v-if="preview">
							今天刷卡會記進 <b>{{ preview.month }}</b>，消費期間 <b>{{ preview.range }}</b><template v-if="preview.due">，<b>{{ preview.due }}</b> 繳款</template>
						</template>
						<template v-else>填入結帳日後，這裡會顯示帳單期間</template>
					</p>
				</div>

				<div class="form-actions">
					<button v-if="shown !== 'new'" type="button" class="delete" :class="{ confirming: confirmDelete }" @click="remove">
						<template v-if="confirmDelete">再按一次刪除{{ txCount(shown) ? `（含 ${txCount(shown)} 筆消費）` : '' }}</template>
						<template v-else>刪除這張卡</template>
					</button>
					<span class="spacer" />
					<button type="button" class="btn" @click="close">取消</button>
					<button type="submit" class="btn btn-primary">{{ shown === 'new' ? '加入' : '儲存' }}</button>
				</div>
			</form>
		</ModalDialog>
	</section>
</template>

<style scoped>
.link-btn {
	padding: 0.2rem 0.6rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.78rem;
	color: var(--brass);
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s;
}

.link-btn:hover {
	border-color: color-mix(in srgb, var(--brass) 40%, transparent);
	background: color-mix(in srgb, var(--brass) 8%, transparent);
}

.card-list {
	display: grid;
	gap: 0.45rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.card-item {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	width: 100%;
	padding: 0.6rem 0.75rem;
	border: 1px solid var(--line);
	border-radius: 14px;
	background: var(--sunken-bg);
	color: var(--ink);
	text-align: left;
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s;
}

.card-item:hover {
	border-color: var(--line-strong);
}

/* 迷你卡面 */
.card-chip {
	flex-shrink: 0;
	width: 2.1rem;
	height: 1.4rem;
	border-radius: 5px;
	background:
		linear-gradient(135deg, color-mix(in srgb, var(--card) 90%, transparent), color-mix(in srgb, var(--card) 45%, transparent));
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
}

.card-main {
	display: grid;
	flex: 1;
	min-width: 0;
}

.card-name {
	overflow: hidden;
	font-size: 0.9rem;
	font-weight: 500;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.card-name small {
	margin-left: 0.35rem;
	font-family: var(--font-mono);
	font-size: 0.72rem;
	font-weight: 400;
	color: var(--ink-3);
}

.card-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 0 0.5rem;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.card-meta > span {
	white-space: nowrap;
}

.card-edit {
	flex-shrink: 0;
	color: var(--ink-3);
	opacity: 0;
	transition: opacity 0.2s;
}

.card-item:hover .card-edit,
.card-item:focus-visible .card-edit {
	opacity: 1;
}

.card-empty {
	font-size: 0.82rem;
	line-height: 1.7;
	color: var(--ink-3);
}

.card-first {
	margin-top: 0.9rem;
}

.btn-sm {
	justify-content: center;
	height: 2.35rem;
	padding-inline: 0.9rem;
	font-size: 0.8rem;
}

/* ── 彈窗內的表單 ── */
.form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.9rem 1.1rem;
	align-items: start;
}

.form-wide {
	grid-column: 1 / -1;
}

/* 顏色：迷你卡面排成一列，選中的外框用動畫滑過去 */
.swatches {
	position: relative;
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.swatch {
	position: relative;
	z-index: 1;
	display: grid;
	place-items: center;
	width: 3.1rem;
	height: 2.3rem;
	padding: 0;
	border: 0;
	border-radius: 10px;
	background: none;
	cursor: pointer;
}

.swatch .card-chip {
	width: 2.3rem;
	height: 1.5rem;
	transition: transform 0.3s var(--ease-out);
}

.swatch:hover .card-chip {
	transform: translateY(-2px);
}

.swatch:focus-visible {
	outline: none;
}

.swatch:focus-visible .card-chip {
	box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--brass);
}

.swatch-ring {
	position: absolute;
	top: 0;
	left: 0;
	width: 3.1rem;
	height: 2.3rem;
	border: 1.5px solid var(--brass);
	border-radius: 10px;
	background: color-mix(in srgb, var(--brass) 10%, transparent);
	pointer-events: none;
}

.preview {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem 1rem;
	margin-top: 1.1rem;
	padding: 0.7rem 0.9rem;
	border-radius: 12px;
	background: color-mix(in srgb, var(--brass) 9%, transparent);
	font-size: 0.8rem;
	line-height: 1.7;
	color: var(--ink-2);
	transition: background 0.3s, color 0.3s;
}

.preview-card {
	display: inline-flex;
	align-items: center;
	gap: 0.55rem;
	font-size: 0.85rem;
	font-weight: 500;
	color: var(--ink);
}

.preview-name {
	max-width: 10rem;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.preview b {
	font-weight: 500;
	color: var(--brass);
}

.preview.empty {
	background: color-mix(in srgb, var(--ink) 5%, transparent);
	color: var(--ink-3);
}

.form-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.6rem;
	margin-top: 1.25rem;
	padding-top: 1.1rem;
	border-top: 1px solid var(--line);
}

.spacer {
	flex: 1;
}

.delete {
	padding: 0.35rem 0.8rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.78rem;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.delete:hover {
	color: var(--vermilion);
}

.delete.confirming {
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
	color: var(--vermilion);
}

@media (max-width: 460px) {
	.form-grid > :first-child,
	.form-grid > :nth-child(2) {
		grid-column: 1 / -1;
	}

	.delete {
		order: 5;
		width: 100%;
	}

	.spacer {
		display: none;
	}

	.form-actions .btn {
		flex: 1;
		justify-content: center;
	}
}
</style>
