<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { animate, createTimer } from 'animejs'
import DateField from '../DateField.vue'
import SelectField from '../SelectField.vue'
import { postingsOf, parseMonth } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	txs: { type: Array, required: true },
	cards: { type: Array, required: true },
	cardChoices: { type: Array, required: true },
	categoryChoices: { type: Array, required: true },
})
// changed：日期、卡片、延後這些會影響帳單歸屬的欄位改了
const emit = defineEmits(['remove', 'changed'])

const cardOf = (tx) => props.cards.find((c) => c.id === tx.cardId)
const monthText = (key) => `${parseMonth(key).m} 月`
const firstPosting = (tx) => postingsOf(tx, cardOf(tx))[0]

function setNum(tx, key, e, fallback = null) {
	const v = e.target.value
	tx[key] = v === '' ? fallback : Math.round(Number(v))
}

function setInstallments(tx, e) {
	const n = Math.floor(Number(e.target.value))
	tx.installments = n >= 1 && n <= 60 ? n : 1
	if (e.type === 'change') e.target.value = tx.installments
}

function perInstallment(tx) {
	if (!(tx.installments > 1) || !tx.amount) return ''
	const [first, ...rest] = postingsOf(tx, cardOf(tx)).map((p) => p.amount)
	return rest.length && first !== rest[0]
		? `首期 ${fmtNumber(first)} 元，其後每期 ${fmtNumber(rest[0])} 元`
		: `每期 ${fmtNumber(first)} 元`
}

function change(tx, key, value) {
	const before = props.txs.map((t) => t.id).join()
	tx[key] = value
	emit('changed', tx)
	if (key === 'date') nextTick(() => markMoved(tx.id, before))
}

// 日期改了之後若這一列換了位置（仍在這一期），短暫亮起底色，跑出畫面時捲過去，做法同投資分析
function markMoved(id, before) {
	if (props.txs.map((t) => t.id).join() === before) return
	const row = root.value?.querySelector(`tr[data-tx="${id}"]`)
	if (!row) return
	row.classList.remove('moved')
	void row.offsetWidth
	row.classList.add('moved')
	setTimeout(() => row.classList.remove('moved'), 1800)
	// 等移動動畫結束再判斷是否在畫面內
	setTimeout(() => {
		const r = row.getBoundingClientRect()
		if (r.top < 90 || r.bottom > window.innerHeight - 40) {
			row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
		}
	}, 480)
}

// ── 刪除確認：浮出確認列，3 秒沒動作自動收起，滑鼠停在上面時暫停 ──
const confirmId = ref(null)
const root = ref(null)
let countdown = null

function stopCountdown() {
	countdown?.cancel()
	countdown = null
}

function returnFocus(id) {
	const cell = root.value?.querySelector(`tr[data-tx="${id}"] .del-cell`)
	if (cell?.querySelector('.del-confirm')?.contains(document.activeElement)) cell.querySelector('.row-del').focus({ preventScroll: true })
}

function ask(id) {
	stopCountdown()
	confirmId.value = id
	nextTick(() => {
		root.value?.querySelector(`tr[data-tx="${id}"] .del-no`)?.focus({ preventScroll: true })
		countdown = createTimer({
			duration: 3000,
			onComplete: () => {
				countdown = null
				if (confirmId.value !== id) return
				returnFocus(id)
				confirmId.value = null
			},
		})
	})
}

function cancelConfirm() {
	stopCountdown()
	if (confirmId.value != null) returnFocus(confirmId.value)
	confirmId.value = null
}

function remove(id) {
	stopCountdown()
	confirmId.value = null
	emit('remove', id)
}

function popIn(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], x: [12, 0], duration: 260, ease: 'out(3)', onComplete: done })
}

function popOut(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, x: 8, duration: 160, ease: 'in(2)', onComplete: done })
}

// ── 列的進出場；只有順序真的改變時才播放移動動畫 ──
const sorting = ref(false)
let sortingTimer = null

watch(
	() => props.txs.map((tx) => tx.id).join(),
	() => {
		sorting.value = true
		clearTimeout(sortingTimer)
		sortingTimer = setTimeout(() => (sorting.value = false), 600)
	},
	{ flush: 'pre' },
)

function rowEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, {
		opacity: [0, 1],
		x: [-10, 0],
		duration: 450,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('opacity')
			el.style.removeProperty('transform')
			done()
		},
	})
}

function rowLeave(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, x: 12, duration: 220, ease: 'in(2)', onComplete: done })
}

const total = computed(() => props.txs.length)

onBeforeUnmount(() => {
	stopCountdown()
	clearTimeout(sortingTimer)
})
</script>

<template>
	<div ref="root" class="tx-wrap">
		<table class="tx">
			<colgroup>
				<col style="width: 14%" />
				<col style="width: 13%" />
				<col style="width: 9%" />
				<col style="width: 20%" />
				<col style="width: 10%" />
				<col style="width: 6%" />
				<col style="width: 10%" />
				<col style="width: 14%" />
				<col style="width: 4%" />
			</colgroup>
			<thead>
				<tr>
					<th>消費日</th>
					<th>卡片</th>
					<th>分類</th>
					<th>項目</th>
					<th class="num">金額</th>
					<th class="num">分期</th>
					<th>入帳</th>
					<th>備註</th>
					<th><span class="sr-only">刪除（共 {{ total }} 筆）</span></th>
				</tr>
			</thead>
			<TransitionGroup tag="tbody" :css="false" :move-class="sorting ? 'row-move' : 'row-still'" @enter="rowEnter" @leave="rowLeave">
				<tr v-for="tx in txs" :key="tx.id" :data-tx="tx.id" :class="{ confirming: confirmId === tx.id }">
					<td>
						<DateField :model-value="tx.date" label="消費日" variant="cell" @update:model-value="change(tx, 'date', $event)" />
					</td>
					<td>
						<SelectField :model-value="tx.cardId" :options="cardChoices" label="卡片" variant="cell" @update:model-value="change(tx, 'cardId', $event)" />
					</td>
					<td>
						<SelectField v-model="tx.categoryId" :options="categoryChoices" label="分類" variant="cell" />
					</td>
					<td><input v-model="tx.title" type="text" class="cell" placeholder="項目" aria-label="項目" /></td>
					<td class="num">
						<input
							type="number"
							class="cell"
							:class="{ refund: tx.amount < 0 }"
							step="1"
							placeholder="0"
							aria-label="金額"
							:value="tx.amount ?? ''"
							@input="setNum(tx, 'amount', $event)"
						/>
					</td>
					<td class="num">
						<input
							type="number"
							class="cell"
							inputmode="numeric"
							min="1"
							max="60"
							step="1"
							aria-label="分期期數"
							:title="perInstallment(tx)"
							:value="tx.installments"
							@input="setInstallments(tx, $event)"
							@change="setInstallments(tx, $event)"
						/>
					</td>
					<td>
						<button
							type="button"
							class="bill-tag"
							:class="{ shifted: tx.shift }"
							:title="tx.shift ? '已手動延後一期，點一下改回自動歸屬' : '點一下延後到下一期帳單（延後入帳時使用）'"
							@click="change(tx, 'shift', tx.shift ? 0 : 1)"
						>
							{{ firstPosting(tx) ? monthText(firstPosting(tx).month) : '—' }}
							<small v-if="tx.shift">延後</small>
							<small v-else-if="tx.installments > 1">起 {{ tx.installments }} 期</small>
						</button>
					</td>
					<td><input v-model="tx.note" type="text" class="cell" placeholder="備註" aria-label="備註" /></td>
					<td class="del-cell">
						<button
							type="button"
							class="row-del"
							:class="{ active: confirmId === tx.id }"
							:aria-label="confirmId === tx.id ? '取消刪除' : '刪除這筆消費'"
							:title="confirmId === tx.id ? '取消' : '刪除'"
							@click="confirmId === tx.id ? cancelConfirm() : ask(tx.id)"
						>
							<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
						<Transition :css="false" @enter="popIn" @leave="popOut">
							<div
								v-if="confirmId === tx.id"
								class="del-confirm"
								role="group"
								aria-label="確認刪除消費"
								@keydown.esc="cancelConfirm"
								@mouseenter="countdown?.pause()"
								@mouseleave="countdown?.resume()"
							>
								<span>刪除這筆消費{{ tx.installments > 1 ? `（含全部 ${tx.installments} 期）` : '' }}？</span>
								<button type="button" class="del-yes" @click="remove(tx.id)">刪除</button>
								<button type="button" class="del-no" @click="cancelConfirm">取消</button>
							</div>
						</Transition>
					</td>
				</tr>
			</TransitionGroup>
		</table>
	</div>
</template>

<style scoped>
.tx-wrap {
	position: relative;
	overflow-x: auto;
	margin-inline: -0.5rem;
	padding-inline: 0.5rem;
}

.tx {
	width: 100%;
	min-width: 920px;
	table-layout: fixed;
	border-collapse: collapse;
	font-size: 0.85rem;
}

/* th 的左右 padding（0.7rem）= td（0.3rem）+ 輸入框（0.4rem），表頭與數值才會對齊 */
.tx th {
	padding: 0.6rem 0.7rem;
	border-bottom: 1px solid var(--line);
	font-size: 0.72rem;
	font-weight: 400;
	color: var(--ink-3);
	text-align: left;
	white-space: nowrap;
}

.tx td {
	padding: 0.3rem;
	border-bottom: 1px solid var(--line);
	vertical-align: middle;
}

.tx tbody tr:last-child td {
	border-bottom: 0;
}

.tx .num {
	text-align: right;
}

.tx tbody tr {
	transition: background 0.2s;
}

.tx tbody tr:hover {
	background: color-mix(in srgb, var(--ink) 3%, transparent);
}

.tx tbody tr.confirming {
	background: color-mix(in srgb, var(--vermilion) 8%, transparent);
}

.row-move {
	transition: transform 0.45s var(--ease-out);
}

/* 改日期後換了位置的列：底色亮起再淡出 */
.tx tbody tr.moved {
	animation: row-moved 1.8s var(--ease-out);
}

@keyframes row-moved {
	0%,
	35% {
		background: color-mix(in srgb, var(--brass) 20%, transparent);
	}

	100% {
		background: transparent;
	}
}

.cell {
	width: 100%;
	height: 2.1rem;
	padding: 0 0.4rem;
	border: 1px solid transparent;
	border-radius: 8px;
	outline: none;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.84rem;
	font-variant-numeric: tabular-nums;
	transition: border-color 0.2s, background 0.2s;
	appearance: textfield;
	-moz-appearance: textfield;
}

.cell::-webkit-inner-spin-button,
.cell::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.cell[type="text"] {
	font-family: var(--font-sans);
}

.num .cell {
	text-align: right;
}

.cell.refund {
	color: var(--fall);
}

.cell:hover {
	border-color: var(--line);
}

.cell:focus {
	border-color: var(--brass);
	background: var(--sunken-bg);
}

.cell::placeholder {
	color: var(--ink-3);
	opacity: 0.75;
}

.bill-tag {
	display: inline-flex;
	align-items: baseline;
	gap: 0.3rem;
	margin-left: 0.4rem;
	padding: 0.15rem 0.55rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	font-size: 0.75rem;
	color: var(--ink-2);
	white-space: nowrap;
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.bill-tag small {
	font-size: 0.68rem;
	color: var(--ink-3);
}

.bill-tag:hover {
	border-color: var(--ink-3);
	color: var(--ink);
}

.bill-tag.shifted {
	border-color: color-mix(in srgb, var(--brass) 45%, transparent);
	background: color-mix(in srgb, var(--brass) 10%, transparent);
	color: var(--brass);
}

.bill-tag.shifted small {
	color: var(--brass);
}

.row-del {
	display: grid;
	place-items: center;
	width: 1.8rem;
	height: 1.8rem;
	margin-inline: auto;
	border: 0;
	border-radius: 50%;
	background: none;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.2s, background 0.2s;
}

.row-del:hover,
.row-del.active {
	color: var(--vermilion);
	background: color-mix(in srgb, var(--vermilion) 12%, transparent);
}

.del-cell {
	position: relative;
}

.del-confirm {
	position: absolute;
	inset-block: 0;
	right: calc(100% + 0.1rem);
	z-index: 2;
	display: flex;
	align-items: center;
	gap: 0.35rem;
	height: 2.3rem;
	margin-block: auto;
	padding: 0 0.3rem 0 0.85rem;
	border: 1px solid color-mix(in srgb, var(--vermilion) 40%, transparent);
	border-radius: 999px;
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-card);
	font-size: 0.78rem;
	color: var(--ink-2);
	white-space: nowrap;
}

.del-yes,
.del-no {
	height: 1.7rem;
	padding: 0 0.75rem;
	border: 1px solid transparent;
	border-radius: 999px;
	font-size: 0.76rem;
	cursor: pointer;
	transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.del-yes {
	margin-left: 0.2rem;
	background: var(--vermilion);
	color: var(--on-brass);
}

.del-yes:hover {
	background: color-mix(in srgb, var(--vermilion) 85%, var(--ink));
}

.del-no {
	border-color: var(--line-strong);
	background: none;
	color: var(--ink-2);
}

.del-no:hover {
	border-color: var(--ink-3);
	color: var(--ink);
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip: rect(0 0 0 0);
}
</style>
