<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { animate, set, stagger } from 'animejs'
import AnimatedNumber from '../AnimatedNumber.vue'
import { fmtNumber } from '../../utils/format.js'
import { prefersReducedMotion } from '../../utils/motion.js'

const props = defineProps({
	// [{ card, color, total, range, closing, due, status, days, used, limit, pct }]
	bills: { type: Array, required: true },
})
const emit = defineEmits(['toggle-paid', 'edit'])

const STATUS = { open: '未出帳', due: '待繳', paid: '已繳', past: '已逾期', none: '無需繳款' }

// 待繳（已出帳、還沒過繳款日）一律警示；逾期只低調標示
function dueText(bill) {
	if (bill.status === 'open') return `${bill.closing} 結帳 · ${bill.due} 繳款`
	if (bill.status === 'none') return bill.total < 0 ? `退款多於消費，${bill.due} 不用繳款` : `這一期沒有消費`
	if (bill.status === 'paid') return `${bill.due} 繳款 · 已繳清`
	if (bill.status === 'past') return `${bill.due} 繳款日已過，已繳款可標記`
	if (bill.days > 0) return `${bill.due} 繳款 · 還有 ${bill.days} 天`
	return `今天 ${bill.due} 是最後繳款日`
}

// ── 切換卡片篩選時：舊卡片淡出 → 換內容 → 高度平滑伸縮，新卡片依序淡入 ──
// 畫面上顯示的是 shown；只有卡片組成改變時才走動畫，金額變動直接更新
const shown = ref(props.bills)
const grid = ref(null)
const idsOf = (bills) => bills.map((b) => b.card.id).join()
let switching = false
let pending = null

watch(
	() => props.bills,
	(bills) => {
		if (switching) pending = bills
		else if (idsOf(bills) === idsOf(shown.value)) shown.value = bills
		else swap(bills)
	},
)

async function swap(bills) {
	const el = grid.value
	if (prefersReducedMotion() || !el) {
		shown.value = bills
		return
	}
	switching = true

	const from = el.offsetHeight
	el.style.height = `${from}px`
	el.style.overflow = 'hidden'
	await animate(el.children, { opacity: 0, y: -8, duration: 180, delay: stagger(25), ease: 'in(2)' })

	shown.value = pending ?? bills
	pending = null
	await nextTick()

	const cards = el.children
	set(cards, { opacity: 0, y: 12 })
	el.style.height = 'auto'
	const to = el.offsetHeight
	el.style.height = `${from}px`
	animate(el, {
		height: [from, to],
		duration: 460,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('height')
			el.style.removeProperty('overflow')
		},
	})
	await animate(cards, { opacity: 1, y: 0, duration: 480, delay: stagger(50, { start: 80 }), ease: 'out(3)' })
	for (const card of cards) {
		card.style.removeProperty('opacity')
		card.style.removeProperty('transform')
	}

	switching = false
	// 動畫期間又有變動（例如連續切換），以最新的為準
	if (pending) {
		const next = pending
		pending = null
		if (idsOf(next) === idsOf(shown.value)) shown.value = next
		else swap(next)
	}
}

// 版面依卡片數量：1–2 張橫向展開成寬列；3 張排三欄；4 張以上每列四張
const layout = computed(() => (shown.value.length <= 2 ? 'wide' : shown.value.length === 3 ? 'cols-3' : 'cols-4'))

// 卡片多時，標題旁的待繳合計讓人不用逐張看
const dueSummary = computed(() => {
	const due = props.bills.filter((b) => b.status === 'due')
	return due.length ? { count: due.length, total: due.reduce((sum, b) => sum + b.total, 0) } : null
})
</script>

<template>
	<section class="panel bills">
		<header class="section-head">
			<h2 class="section-title">帳單總覽</h2>
			<span v-if="dueSummary" class="due-summary">
				{{ dueSummary.count }} 張待繳，合計 <b>NT$ {{ fmtNumber(dueSummary.total) }}</b>
			</span>
			<span v-else class="eyebrow">點卡片名稱可修改設定</span>
		</header>

		<div ref="grid" class="bill-grid" :class="layout">
			<article
				v-for="bill in shown"
				:key="bill.card.id"
				class="bill"
				:class="bill.status"
				:style="{ '--card': bill.color }"
			>
				<header class="bill-head">
					<button type="button" class="bill-name" @click="emit('edit', bill.card)">
						<span class="bill-chip" aria-hidden="true" />
						<span class="bill-title">{{ bill.card.name }}</span>
						<small v-if="bill.card.last4">•• {{ bill.card.last4 }}</small>
					</button>
					<span class="status">{{ STATUS[bill.status] }}</span>
				</header>

				<p class="bill-sum">
					<small>NT$</small>
					<AnimatedNumber :value="bill.total" />
				</p>
				<div class="bill-dates">
					<p class="bill-range">消費 {{ bill.range }}</p>
					<p class="bill-due">{{ dueText(bill) }}</p>
				</div>

				<div v-if="bill.limit" class="limit">
					<span class="limit-bar"><span class="limit-fill" :style="{ width: `${bill.pct}%` }" /></span>
					<span class="limit-text">
						未繳 {{ fmtNumber(bill.used) }} ／ 額度 {{ fmtNumber(bill.limit) }}
						<b>{{ Math.round(bill.pct) }}%</b>
					</span>
				</div>

				<button
					v-if="['due', 'paid', 'past'].includes(bill.status)"
					type="button"
					class="paid-btn"
					:class="{ on: bill.status === 'paid' }"
					:aria-pressed="bill.status === 'paid'"
					@click="emit('toggle-paid', bill.card.id)"
				>
					<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
						<path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					{{ bill.status === 'paid' ? '已繳款' : '標記已繳' }}
				</button>
			</article>
		</div>
	</section>
</template>

<style scoped>
.bills {
	container-type: inline-size;
}

.due-summary {
	font-size: 0.78rem;
	color: var(--ink-3);
}

.due-summary b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--brass);
}

.bill-grid {
	display: grid;
	gap: 0.9rem;
}

.bill-grid.wide {
	grid-template-columns: minmax(0, 1fr);
}

.bill-grid.cols-3 {
	grid-template-columns: repeat(3, minmax(0, 1fr));
}

.bill-grid.cols-4 {
	grid-template-columns: repeat(4, minmax(0, 1fr));
}

/* 1–2 張卡：每張展開成一整列，資訊橫向排開，不會留下大片空白 */
@container (min-width: 44rem) {
	.wide .bill {
		display: grid;
		grid-template-columns: minmax(10rem, 1.1fr) minmax(8rem, 0.9fr) minmax(11rem, 1.2fr) minmax(10rem, 1.2fr) auto;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem 1.25rem;
	}

	.wide .bill-head {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4rem;
	}

	.wide .bill-sum {
		margin-top: 0;
	}

	.wide .limit {
		margin: 0;
	}

	.wide .paid-btn {
		margin-top: 0;
		grid-column: 5;
	}
}

/* 窄的容器依序減少欄數 */
@container (max-width: 62rem) {
	.bill-grid.cols-4 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@container (max-width: 44rem) {
	.bill-grid.cols-3 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@container (max-width: 30rem) {
	.bill-grid.cols-3,
	.bill-grid.cols-4 {
		grid-template-columns: minmax(0, 1fr);
	}
}

.bill {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	padding: 0.9rem 1rem 1rem;
	min-height: 100%;
	border: 1px solid var(--line);
	border-radius: 16px;
	background: var(--sunken-bg);
	transition: border-color 0.3s;
}

/* 待繳：已出帳、還沒過繳款日，一律警示 */
.bill.due {
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background:
		linear-gradient(color-mix(in srgb, var(--vermilion) 5%, transparent), color-mix(in srgb, var(--vermilion) 5%, transparent)),
		var(--sunken-bg);
}

/* 逾期：沒標記已繳、繳款日已過，只用虛線外框和黃銅色字低調標示 */
.bill.past {
	border-style: dashed;
	border-color: color-mix(in srgb, var(--brass) 40%, transparent);
}

.bill-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.bill-name {
	display: flex;
	align-items: baseline;
	gap: 0.45rem;
	min-width: 0;
	padding: 0.15rem 0.3rem;
	margin-left: -0.3rem;
	border: 1px solid transparent;
	border-radius: 8px;
	background: none;
	color: var(--ink);
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s;
}

.bill-name:hover {
	border-color: var(--line-strong);
	background: color-mix(in srgb, var(--ink) 4%, transparent);
}

.bill-chip {
	align-self: center;
	flex-shrink: 0;
	width: 1.5rem;
	height: 1rem;
	border-radius: 4px;
	background: linear-gradient(135deg, color-mix(in srgb, var(--card) 90%, transparent), color-mix(in srgb, var(--card) 45%, transparent));
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 12%, transparent);
}

.bill-title {
	overflow: hidden;
	font-size: 0.9rem;
	font-weight: 500;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.bill-name small {
	flex-shrink: 0;
	white-space: nowrap;
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--ink-3);
}

.status {
	flex-shrink: 0;
	padding: 0.1rem 0.55rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	font-size: 0.7rem;
	color: var(--ink-3);
}

.due .status {
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 12%, transparent);
	color: var(--vermilion);
}

.past .status {
	border-style: dashed;
	border-color: color-mix(in srgb, var(--brass) 45%, transparent);
	color: var(--brass);
}

.paid .status {
	border-color: color-mix(in srgb, var(--fall) 45%, transparent);
	background: color-mix(in srgb, var(--fall) 10%, transparent);
	color: var(--fall);
}

.bill-sum {
	display: flex;
	align-items: baseline;
	gap: 0.35rem;
	margin-top: 0.35rem;
	font-family: var(--font-display);
	font-size: 1.8rem;
	line-height: 1.1;
	letter-spacing: -0.02em;
}

.paid .bill-sum,
.none .bill-sum {
	color: var(--ink-3);
}

.bill-sum small {
	font-family: var(--font-mono);
	font-size: 0.72rem;
	letter-spacing: 0.05em;
	color: var(--ink-3);
}

.bill-range,
.bill-due {
	font-size: 0.75rem;
	color: var(--ink-3);
}

.due .bill-due {
	color: var(--vermilion);
}

.past .bill-due {
	color: color-mix(in srgb, var(--brass) 80%, var(--ink-3));
}

.bill-dates {
	display: grid;
	gap: 0.15rem;
}

.limit {
	margin-top: 0.6rem;
	margin-bottom: 0.25rem;
}

.limit-bar {
	display: block;
	height: 4px;
	overflow: hidden;
	border-radius: 4px;
	background: color-mix(in srgb, var(--ink) 10%, transparent);
}

.limit-fill {
	display: block;
	height: 100%;
	border-radius: 4px;
	background: var(--card);
	transition: width 0.6s var(--ease-out);
}

.limit-text {
	display: block;
	margin-top: 0.35rem;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.limit-text b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink-2);
}

.paid-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.4rem;
	/* 卡片內容長短不一時，按鈕一律貼齊底部 */
	margin-top: auto;
	padding: 0.4rem 0.8rem;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: none;
	font-size: 0.78rem;
	color: var(--ink-2);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s, background 0.2s;
}

.paid-btn svg {
	opacity: 0.35;
	transition: opacity 0.2s;
}

.paid-btn:hover {
	border-color: var(--fall);
	color: var(--fall);
}

.paid-btn.on {
	border-color: color-mix(in srgb, var(--fall) 45%, transparent);
	background: color-mix(in srgb, var(--fall) 10%, transparent);
	color: var(--fall);
}

.paid-btn.on svg {
	opacity: 1;
}

</style>
