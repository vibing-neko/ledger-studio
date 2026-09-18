<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { createScope, onScroll } from 'animejs'
import { CARD_COLORS, shiftMonth, parseMonth } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'

const props = defineProps({
	postings: { type: Array, required: true },
	categories: { type: Array, required: true },
	month: { type: String, required: true },
})

const AHEAD = 6
const monthText = (key) => {
	const { y, m } = parseMonth(key)
	return parseMonth(props.month).y === y ? `${m} 月` : `${y}/${m}`
}
// 中文結尾直接接「結束」，數字結尾補一個空格
const endText = (key) => {
	const text = monthText(key)
	return /\d$/.test(text) ? `${text} 結束` : `${text}結束`
}
const categoryName = (id) => props.categories.find((c) => c.id === id)?.name ?? '分期'

// 以目前檢視的那一期為基準：這一期仍在繳的分期
const plans = computed(() => {
	const byTx = new Map()
	for (const p of props.postings) {
		if (p.count < 2) continue
		if (!byTx.has(p.tx.id)) byTx.set(p.tx.id, [])
		byTx.get(p.tx.id).push(p)
	}
	return [...byTx.values()]
		.map((list) => {
			list.sort((a, b) => a.index - b.index)
			const now = list.find((p) => p.month === props.month)
			if (!now) return null
			const later = list.filter((p) => p.index > now.index)
			return {
				id: now.tx.id,
				title: now.tx.title || categoryName(now.tx.categoryId),
				card: now.card,
				color: CARD_COLORS[now.card.color % CARD_COLORS.length],
				index: now.index,
				count: now.count,
				amount: now.amount,
				total: list.reduce((sum, p) => sum + p.amount, 0),
				remaining: later.reduce((sum, p) => sum + p.amount, 0),
				end: list.at(-1).month,
			}
		})
		.filter(Boolean)
		.sort((a, b) => (a.end === b.end ? a.id - b.id : a.end < b.end ? -1 : 1))
})

const summary = computed(() => ({
	thisPeriod: plans.value.reduce((sum, p) => sum + p.amount, 0),
	remaining: plans.value.reduce((sum, p) => sum + p.remaining, 0),
}))

// 之後幾期還要繳的分期金額
const ahead = computed(() => {
	const sums = Array.from({ length: AHEAD }, (_, i) => ({ key: shiftMonth(props.month, i + 1), value: 0 }))
	for (const p of props.postings) {
		if (p.count < 2) continue
		const slot = sums.find((s) => s.key === p.month)
		if (slot) slot.value += p.amount
	}
	const max = Math.max(1, ...sums.map((s) => s.value))
	return sums.map((s) => ({ ...s, pct: (s.value / max) * 100 }))
})

const revealed = ref(false)
const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({ root: root.value, mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' } }).addOnce((self) => {
		if (self.matches.reduceMotion) {
			revealed.value = true
			return
		}
		onScroll({ target: root.value, enter: '90% top', repeat: false, onEnter: () => (revealed.value = true) })
	})
})

onBeforeUnmount(() => scope?.revert())
</script>

<template>
	<section ref="root" class="panel chart plans-card">
		<header class="section-head">
			<h3 class="section-title">分期追蹤</h3>
			<span v-if="plans.length" class="plans-summary">
				{{ plans.length }} 筆進行中 · 本期 <b>{{ fmtNumber(summary.thisPeriod) }}</b> · 之後還有 <b>{{ fmtNumber(summary.remaining) }}</b>
			</span>
		</header>

		<template v-if="plans.length">
			<ul class="plans">
				<li v-for="plan in plans" :key="plan.id" class="plan" :style="{ '--card': plan.color }">
					<div class="plan-main">
						<span class="plan-title">{{ plan.title }}</span>
						<span class="plan-card"><i aria-hidden="true" />{{ plan.card.name }} · 共 {{ fmtNumber(plan.total) }} 元</span>
					</div>
					<div class="plan-progress">
						<span class="track" role="img" :aria-label="`第 ${plan.index} 期，共 ${plan.count} 期`">
							<span class="fill" :style="{ width: revealed ? `${(plan.index / plan.count) * 100}%` : '0%' }" />
						</span>
						<span class="plan-step">第 {{ plan.index }}/{{ plan.count }} 期</span>
					</div>
					<span class="plan-amount">{{ fmtNumber(plan.amount) }}<small>本期</small></span>
					<span class="plan-rest">
						<template v-if="plan.remaining">剩 {{ plan.count - plan.index }} 期 · {{ fmtNumber(plan.remaining) }}</template>
						<template v-else>本期繳完</template>
						<small>{{ endText(plan.end) }}</small>
					</span>
				</li>
			</ul>

			<div class="ahead">
				<p class="ahead-title">之後 {{ AHEAD }} 期的分期金額</p>
				<ul class="ahead-bars">
					<li v-for="a in ahead" :key="a.key" :title="`${monthText(a.key)}帳單 ${fmtNumber(a.value)} 元`">
						<span class="ahead-value">{{ a.value ? fmtNumber(a.value) : '—' }}</span>
						<span class="ahead-track"><span class="ahead-fill" :style="{ height: revealed ? `${a.pct}%` : '0%' }" /></span>
						<span class="ahead-month">{{ monthText(a.key) }}</span>
					</li>
				</ul>
			</div>
		</template>
		<p v-else class="chart-empty">這一期沒有進行中的分期。</p>
	</section>
</template>

<style scoped>
.plans-summary {
	font-size: 0.78rem;
	color: var(--ink-3);
}

.plans-summary b {
	font-family: var(--font-mono);
	font-weight: 500;
	color: var(--ink);
}

.plans {
	display: grid;
	margin: 0;
	padding: 0;
	list-style: none;
}

.plan {
	display: grid;
	grid-template-columns: minmax(0, 1.3fr) minmax(8rem, 1fr) 6rem 9rem;
	align-items: center;
	gap: 1.25rem;
	padding: 0.7rem 0;
	border-top: 1px solid var(--line);
}

.plan:first-child {
	border-top: 0;
	padding-top: 0.2rem;
}

.plan-main {
	display: grid;
	min-width: 0;
}

.plan-title {
	overflow: hidden;
	font-size: 0.9rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.plan-card {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.plan-card i {
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 2px;
	background: var(--card);
}

.plan-progress {
	display: grid;
	gap: 0.3rem;
}

.track {
	display: block;
	height: 6px;
	overflow: hidden;
	border-radius: 6px;
	background: color-mix(in srgb, var(--ink) 9%, transparent);
}

.fill {
	display: block;
	height: 100%;
	border-radius: 6px;
	background: var(--brass);
	transition: width 0.9s var(--ease-out);
}

.plan-step {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--ink-3);
}

.plan-amount,
.plan-rest {
	display: grid;
	font-family: var(--font-mono);
	font-size: 0.85rem;
	font-variant-numeric: tabular-nums;
	text-align: right;
	white-space: nowrap;
}

.plan-rest {
	font-size: 0.78rem;
	color: var(--ink-2);
}

.plan-amount small,
.plan-rest small {
	font-family: var(--font-sans);
	font-size: 0.68rem;
	color: var(--ink-3);
}

/* 之後幾期 */
.ahead {
	margin-top: 1.1rem;
	padding-top: 1rem;
	border-top: 1px solid var(--line);
}

.ahead-title {
	margin-bottom: 0.6rem;
	font-size: 0.75rem;
	color: var(--ink-3);
}

.ahead-bars {
	display: grid;
	grid-template-columns: repeat(6, minmax(0, 1fr));
	gap: 0.5rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.ahead-bars li {
	display: grid;
	justify-items: center;
	gap: 0.3rem;
}

.ahead-value {
	font-family: var(--font-mono);
	font-size: 0.72rem;
	color: var(--ink-2);
}

.ahead-track {
	display: flex;
	align-items: flex-end;
	justify-content: center;
	width: 100%;
	height: 3.2rem;
}

.ahead-fill {
	width: min(24px, 60%);
	border-radius: 4px 4px 0 0;
	background: color-mix(in srgb, var(--brass) 55%, transparent);
	transition: height 0.9s var(--ease-out);
}

.ahead-month {
	font-size: 0.7rem;
	color: var(--ink-3);
}

.chart-empty {
	padding: 1.5rem 0;
	font-size: 0.85rem;
	color: var(--ink-3);
	text-align: center;
}

@media (max-width: 700px) {
	.plan {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.5rem 1rem;
	}

	/* 手機：名稱｜本期金額，下一列是進度｜剩餘 */
	.plan-progress {
		order: 3;
		align-self: center;
	}

	.plan-rest {
		order: 4;
	}
}
</style>
