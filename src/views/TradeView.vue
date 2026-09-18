<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { createScope, createTimeline, splitText, stagger, set } from 'animejs'
import NumberField from '../components/NumberField.vue'
import SegmentedControl from '../components/SegmentedControl.vue'
import ProfitCalculator from '../components/trade/ProfitCalculator.vue'
import BreakevenSearch from '../components/trade/BreakevenSearch.vue'
import { useStoredRef } from '../composables/useStoredRef.js'
import { TAX_RATES } from '../utils/fees.js'
import { lotsText } from '../utils/format.js'
import { enterUp, leaveFade } from '../utils/motion.js'

const [settings, resetSettings] = useStoredRef('ledger-studio:trade:settings', {
	type: 'stock',
	cost: null,
	shares: null,
	discount: 100,
	minFee: 20,
})
const [profit, resetProfit] = useStoredRef('ledger-studio:trade:profit', {
	buyPrice: null,
	buyShares: null,
	sellPrice: null,
	// 留空代表全部賣出
	sellShares: null,
})
const [search, resetSearch] = useStoredRef('ledger-studio:trade:search', {
	target: null,
	priceMin: null,
	priceMax: null,
	priceStep: 0.5,
	useLots: true,
	splitMin: 1,
	splitMax: 6,
	roundMode: 'round',
	beMin: null,
	beMax: null,
})
const [view] = useStoredRef('ledger-studio:trade:view', { tab: 'profit' })

const tabs = [
	{ value: 'profit', label: '損益試算' },
	{ value: 'breakeven', label: '加碼兩平價' },
]
const types = [
	{ value: 'stock', label: '個股' },
	{ value: 'etf', label: 'ETF' },
]

// 清除需要按兩次，避免誤觸
const confirming = ref(false)
let confirmTimer = null

function clearAll() {
	if (!confirming.value) {
		confirming.value = true
		confirmTimer = setTimeout(() => (confirming.value = false), 3000)
		return
	}
	clearTimeout(confirmTimer)
	confirming.value = false
	resetSettings()
	resetProfit()
	resetSearch()
}

const root = ref(null)
let scope = null

onMounted(() => {
	scope = createScope({
		root: root.value,
		mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
	}).addOnce((self) => {
		if (self.matches.reduceMotion) return

		const { chars } = splitText('.page-title', { chars: { wrap: 'clip' } })
		set(chars, { y: '110%' })
		set('.page-eyebrow, .page-lead, .holding, .workspace', { opacity: 0 })

		createTimeline({ defaults: { ease: 'out(4)' } })
			.add('.page-eyebrow', { opacity: [0, 1], x: [-12, 0], duration: 700 }, 0)
			.add(chars, { y: '0%', duration: 900 }, stagger(45, { start: 80 }))
			.add('.page-lead', { opacity: [0, 1], y: [12, 0], duration: 800 }, 350)
			.add('.holding, .workspace', { opacity: [0, 1], y: [28, 0], duration: 900 }, stagger(120, { start: 450 }))
	})
})

onBeforeUnmount(() => {
	clearTimeout(confirmTimer)
	scope?.revert()
})
</script>

<template>
	<main ref="root" class="container trade">
		<header class="page-head">
			<p class="eyebrow page-eyebrow">Tool 01 · Trade Calculator</p>
			<h1 class="page-title">交易試算</h1>
			<p class="lead lead-balance page-lead">下單前先算清楚：平均成本、損益兩平價、賣出後實拿多少，以及怎麼分筆加碼，才能讓兩平價落在整數。</p>
		</header>

		<div class="layout">
			<!-- 共用：持股與費率 -->
			<aside class="panel holding">
				<header class="section-head">
					<h2 class="section-title">持股與費率</h2>
					<span class="eyebrow">兩種試算共用</span>
				</header>

				<div class="holding-fields">
					<div class="field">
						<span class="field-label">商品類型</span>
						<SegmentedControl v-model="settings.type" :options="types" label="商品類型" block />
						<p class="field-hint">賣出證交稅 {{ TAX_RATES[settings.type] * 100 }}%</p>
					</div>
					<NumberField
						v-model="settings.cost"
						label="原有總成本"
						suffix="元"
						step="1"
						placeholder="沒有持股可留空"
						hint="含買進手續費"
					/>
					<NumberField
						v-model="settings.shares"
						label="原有股數"
						suffix="股"
						step="1"
						placeholder="沒有持股可留空"
						:hint="lotsText(settings.shares) || '1 張 = 1,000 股'"
					/>
					<div class="pair">
						<NumberField v-model="settings.discount" label="手續費折扣" suffix="%" step="1" hint="6 折填 60" />
						<NumberField v-model="settings.minFee" label="最低手續費" suffix="元" step="1" hint="預設 20 元" />
					</div>
				</div>

				<footer class="holding-foot">
					<span class="saved">
						<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
							<path d="M2.5 6.2L5 8.5L9.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
						自動儲存在此瀏覽器
					</span>
					<button type="button" class="clear" :class="{ confirming }" @click="clearAll">
						{{ confirming ? '再按一次確認清除' : '清除資料' }}
					</button>
				</footer>
			</aside>

			<!-- 試算區 -->
			<section class="workspace">
				<SegmentedControl v-model="view.tab" :options="tabs" label="試算類型" size="lg" class="tabs" />
				<Transition mode="out-in" :css="false" @enter="enterUp" @leave="leaveFade">
					<KeepAlive>
						<ProfitCalculator v-if="view.tab === 'profit'" :settings="settings" :inputs="profit" />
						<BreakevenSearch v-else :settings="settings" :inputs="search" />
					</KeepAlive>
				</Transition>
			</section>
		</div>
	</main>
</template>

<style scoped>
.trade {
	padding-block: clamp(2.5rem, 6vw, 4.5rem) clamp(4rem, 8vw, 6rem);
}

.page-head {
	max-width: 46rem;
	margin-bottom: clamp(2rem, 4vw, 3rem);
}

.page-eyebrow {
	color: var(--brass);
}

.page-title {
	margin-top: 0.9rem;
	font-family: var(--font-serif);
	font-size: clamp(2.4rem, 5vw, 3.6rem);
	font-weight: 900;
	line-height: 1.15;
}

.page-lead {
	margin-top: 1rem;
	color: var(--ink-2);
}

.layout {
	display: grid;
	grid-template-columns: 330px minmax(0, 1fr);
	gap: 1.5rem;
	align-items: start;
}

.holding {
	position: sticky;
	top: 5.25rem;
}

.holding-fields {
	display: grid;
	gap: 1.1rem;
}

.pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.holding-foot {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-top: 1.4rem;
	padding-top: 1rem;
	border-top: 1px solid var(--line);
	font-size: 0.75rem;
	color: var(--ink-3);
}

.saved {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}

.saved svg {
	color: var(--fall);
}

.clear {
	padding: 0.3rem 0.7rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.75rem;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.3s, border-color 0.3s, background 0.3s;
}

.clear:hover {
	color: var(--ink);
	border-color: var(--line-strong);
}

.clear.confirming {
	color: var(--vermilion);
	border-color: color-mix(in srgb, var(--vermilion) 45%, transparent);
	background: color-mix(in srgb, var(--vermilion) 10%, transparent);
}

.workspace {
	display: grid;
	gap: 1.25rem;
	min-width: 0;
}

.tabs {
	justify-self: start;
}

@media (max-width: 960px) {
	.layout {
		grid-template-columns: 1fr;
	}

	.holding {
		position: static;
	}
}

@media (max-width: 480px) {
	.tabs {
		justify-self: stretch;
		display: flex;
	}

	.tabs :deep(.seg-btn) {
		flex: 1;
	}
}
</style>
