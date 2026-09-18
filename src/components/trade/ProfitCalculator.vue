<script setup>
import { computed } from 'vue'
import NumberField from '../NumberField.vue'
import AnimatedNumber from '../AnimatedNumber.vue'
import PriceRuler from './PriceRuler.vue'
import { brokerFee, transactionTax, breakEvenPrice, TAX_RATES } from '../../utils/fees.js'
import { fmtNumber, lotsText } from '../../utils/format.js'
import { enterUp, leaveFade } from '../../utils/motion.js'

const props = defineProps({
	settings: { type: Object, required: true },
	inputs: { type: Object, required: true },
})

const positive = (v) => typeof v === 'number' && v > 0

const result = computed(() => {
	const s = props.settings
	const p = props.inputs
	const hasHold = positive(s.cost) && positive(s.shares)
	const hasBuy = positive(p.buyPrice) && positive(p.buyShares)
	if (!hasHold && !hasBuy) return null

	const discount = positive(s.discount) ? s.discount : 100
	const minFee = s.minFee >= 0 ? s.minFee : 20

	const buyGross = hasBuy ? p.buyPrice * p.buyShares : 0
	const buyFee = hasBuy ? brokerFee(buyGross, discount, minFee) : 0
	const totalCost = (hasHold ? s.cost : 0) + buyGross + buyFee
	const shares = (hasHold ? s.shares : 0) + (hasBuy ? p.buyShares : 0)
	const avgCost = totalCost / shares
	const breakEven = breakEvenPrice(totalCost, shares, s.type)

	const r = {
		hasHold,
		hasBuy,
		buyGross,
		buyFee,
		buyTotal: buyGross + buyFee,
		totalCost,
		shares,
		avgCost,
		breakEven,
		gap: breakEven - avgCost,
		gapPct: (breakEven / avgCost - 1) * 100,
		sell: null,
	}

	// 賣出股數留空就是全部賣出；只賣一部分時，成本以平均成本分攤
	const sellShares = Number.isInteger(p.sellShares) && p.sellShares > 0 ? p.sellShares : shares
	if (positive(p.sellPrice) && sellShares <= shares) {
		const cost = sellShares === shares ? totalCost : (totalCost * sellShares) / shares
		const gross = p.sellPrice * sellShares
		const tax = transactionTax(gross, s.type)
		const fee = brokerFee(gross, discount, minFee)
		const feeFull = brokerFee(gross, 100, minFee)
		const pnl = gross - fee - tax - cost
		const pnlFull = gross - feeFull - tax - cost
		r.sell = {
			price: p.sellPrice,
			shares: sellShares,
			partial: sellShares < shares,
			cost,
			gross,
			fee,
			feeFull,
			tax,
			net: gross - fee - tax,
			pnl,
			pct: (pnl / cost) * 100,
			pnlFull,
			pctFull: (pnlFull / cost) * 100,
		}
	}

	return r
})

const sellSharesError = computed(() => {
	const n = props.inputs.sellShares
	if (n == null) return ''
	if (!Number.isInteger(n) || n <= 0) return '請輸入整數股數'
	if (result.value && n > result.value.shares) return `超過持有的 ${fmtNumber(result.value.shares)} 股`
	return ''
})

const taxLabel = computed(() => `證交稅（${TAX_RATES[props.settings.type] * 100}%）`)
</script>

<template>
	<div class="profit">
		<!-- 輸入：本次買進與預計賣出 -->
		<section class="panel inputs">
			<div class="group">
				<p class="group-title"><span class="group-no">A</span>本次買進<small>選填</small></p>
				<div class="pair">
					<NumberField v-model="inputs.buyPrice" label="買進價格" suffix="元" step="0.01" placeholder="0.00" />
					<NumberField
						v-model="inputs.buyShares"
						label="買進股數"
						suffix="股"
						step="1"
						placeholder="0"
						:hint="lotsText(inputs.buyShares) || '1 張 = 1,000 股'"
					/>
				</div>
			</div>
			<div class="group">
				<p class="group-title"><span class="group-no">B</span>預計賣出<small>選填</small></p>
				<div class="pair">
					<NumberField v-model="inputs.sellPrice" label="賣出價格" suffix="元" step="0.01" placeholder="0.00" />
					<NumberField
						v-model="inputs.sellShares"
						label="賣出股數"
						suffix="股"
						step="1"
						placeholder="全部"
						:error="sellSharesError"
						:hint="inputs.sellShares > 0 ? lotsText(inputs.sellShares) : result ? `留空＝全部 ${fmtNumber(result.shares)} 股` : '留空＝全部賣出'"
					/>
				</div>
			</div>
		</section>

		<Transition mode="out-in" :css="false" @enter="enterUp" @leave="leaveFade">
			<!-- 尚未輸入 -->
			<section v-if="!result" key="empty" class="panel empty">
				<svg class="empty-art" viewBox="0 0 120 80" aria-hidden="true">
					<path d="M8 64H112" class="empty-axis" />
					<path d="M8 56L34 44L52 50L78 26L112 18" class="empty-line" />
					<circle cx="78" cy="26" r="4" class="empty-dot" />
				</svg>
				<p class="empty-title">輸入持股，即時算出結果</p>
				<p class="lead empty-desc">在「持股與費率」填入原有總成本與股數，或在上方輸入本次買進，就會算出平均成本、損益兩平價與賣出後的實際損益。</p>
			</section>

			<!-- 結果 -->
			<div v-else key="result" class="results">
				<section class="panel be">
					<div class="be-top">
						<div>
							<p class="eyebrow">Break-even · 損益兩平價</p>
							<p class="be-value">
								<AnimatedNumber :value="result.breakEven" :decimals="2" />
								<span class="be-unit">元／股</span>
							</p>
							<p class="lead be-note">賣在這個價位，扣除手續費（以不打折計）與證交稅後剛好不賺不賠。</p>
						</div>
						<dl class="facts">
							<div>
								<dt>平均成本</dt>
								<dd><AnimatedNumber :value="result.avgCost" :decimals="2" /><small>元</small></dd>
							</div>
							<div>
								<dt>高於成本</dt>
								<dd><AnimatedNumber :value="result.gap" :decimals="2" /><small>元</small></dd>
							</div>
							<div>
								<dt>需上漲</dt>
								<dd><AnimatedNumber :value="result.gapPct" :decimals="2" /><small>%</small></dd>
							</div>
						</dl>
					</div>
					<PriceRuler :avg="result.avgCost" :breakeven="result.breakEven" :sell="result.sell?.price" />
				</section>

				<section class="panel">
					<header class="section-head">
						<h3 class="section-title">持倉明細</h3>
						<span class="eyebrow">{{ result.hasBuy && result.hasHold ? '合併本次買進' : result.hasBuy ? '本次買進' : '原有持股' }}</span>
					</header>
					<dl class="lines">
						<div v-if="result.hasBuy">
							<dt>買進金額</dt>
							<dd><AnimatedNumber :value="result.buyGross" /></dd>
						</div>
						<div v-if="result.hasBuy">
							<dt>買進手續費<small>不足 {{ settings.minFee ?? 20 }} 元以最低計</small></dt>
							<dd><AnimatedNumber :value="result.buyFee" /></dd>
						</div>
						<div>
							<dt>總股數<small>{{ lotsText(result.shares) }}</small></dt>
							<dd><AnimatedNumber :value="result.shares" /></dd>
						</div>
						<div class="total">
							<dt>{{ result.hasBuy && result.hasHold ? '合併後總成本' : '總成本' }}</dt>
							<dd><AnimatedNumber :value="result.totalCost" /><small>元</small></dd>
						</div>
					</dl>
				</section>

				<Transition :css="false" @enter="enterUp" @leave="leaveFade">
					<section v-if="result.sell" class="panel sell" :class="result.sell.pnl >= 0 ? 'rise' : 'fall'">
						<header class="section-head">
							<h3 class="section-title">賣出試算</h3>
							<span class="eyebrow">{{ fmtNumber(result.sell.price, 2) }} 元 × {{ fmtNumber(result.sell.shares) }} 股</span>
						</header>
						<div class="pnl">
							<p class="pnl-label">{{ result.sell.pnl >= 0 ? '實際獲利' : '實際虧損' }}</p>
							<p class="pnl-value"><AnimatedNumber :value="result.sell.pnl" signed /><small>元</small></p>
							<p class="pnl-pct">報酬率 <AnimatedNumber :value="result.sell.pct" :decimals="2" signed />%</p>
						</div>
						<dl class="lines">
							<div>
								<dt>賣出金額</dt>
								<dd><AnimatedNumber :value="result.sell.gross" /></dd>
							</div>
							<div>
								<dt>手續費<small v-if="result.sell.feeFull !== result.sell.fee">原價 {{ fmtNumber(result.sell.feeFull) }}</small></dt>
								<dd>−<AnimatedNumber :value="result.sell.fee" /></dd>
							</div>
							<div>
								<dt>{{ taxLabel }}</dt>
								<dd>−<AnimatedNumber :value="result.sell.tax" /></dd>
							</div>
							<div v-if="result.sell.partial">
								<dt>賣出部位成本<small>平均成本 × {{ fmtNumber(result.sell.shares) }} 股，剩 {{ fmtNumber(result.shares - result.sell.shares) }} 股</small></dt>
								<dd><AnimatedNumber :value="Math.round(result.sell.cost)" /></dd>
							</div>
							<div class="total">
								<dt>實拿金額</dt>
								<dd><AnimatedNumber :value="result.sell.net" /><small>元</small></dd>
							</div>
						</dl>
						<p v-if="result.sell.feeFull !== result.sell.fee" class="compare">
							若手續費不打折：損益 {{ result.sell.pnlFull >= 0 ? '+' : '−' }}{{ fmtNumber(Math.abs(result.sell.pnlFull)) }} 元（{{ result.sell.pctFull >= 0 ? '+' : '−' }}{{ fmtNumber(Math.abs(result.sell.pctFull), 2) }}%）
						</p>
					</section>
				</Transition>
			</div>
		</Transition>
	</div>
</template>

<style scoped>
.profit {
	display: grid;
	gap: 1.25rem;
}

/* ── 輸入 ── */
.inputs {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1.25rem 2rem;
}

.group-title {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	margin-bottom: 0.9rem;
	font-size: 0.92rem;
	font-weight: 500;
}

.group-title small {
	font-size: 0.7rem;
	font-weight: 400;
	color: var(--ink-3);
}

.group-no {
	display: grid;
	place-items: center;
	width: 1.35rem;
	height: 1.35rem;
	border-radius: 6px;
	background: color-mix(in srgb, var(--brass) 15%, transparent);
	font-family: var(--font-mono);
	font-size: 0.7rem;
	color: var(--brass);
}

.pair {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.85rem;
}

/* ── 空狀態 ── */
.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-block: 3.5rem;
	text-align: center;
}

.empty-art {
	width: 7.5rem;
	margin-bottom: 1.25rem;
}

.empty-axis {
	stroke: var(--line-strong);
	stroke-dasharray: 3 5;
}

.empty-line {
	fill: none;
	stroke: var(--ink-3);
	stroke-width: 2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.empty-dot {
	fill: var(--brass);
}

.empty-title {
	font-family: var(--font-serif);
	font-size: 1.2rem;
	font-weight: 600;
}

.empty-desc {
	max-width: 28rem;
	margin-top: 0.5rem;
	font-size: 0.88rem;
	color: var(--ink-2);
}

/* ── 結果 ── */
.results {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
	gap: 1.25rem;
	align-items: start;
}

.be {
	grid-column: 1 / -1;
	background:
		radial-gradient(600px 240px at 0% 0%, color-mix(in srgb, var(--brass) 14%, transparent), transparent 70%),
		var(--panel-bg);
}

.be-top {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 1.5rem 2.5rem;
}

.be-value {
	display: flex;
	align-items: baseline;
	gap: 0.6rem;
	margin-top: 0.4rem;
	font-family: var(--font-display);
	font-size: clamp(2.8rem, 6vw, 4.2rem);
	line-height: 1;
	letter-spacing: -0.03em;
	color: var(--brass-light);
}

.be-unit {
	font-family: var(--font-sans);
	font-size: 0.9rem;
	letter-spacing: 0;
	color: var(--ink-3);
}

.be-note {
	max-width: 24rem;
	margin-top: 0.75rem;
	font-size: 0.8rem;
	color: var(--ink-3);
}

.facts {
	display: flex;
	gap: 0.5rem 2rem;
	margin: 0;
}

.facts dt {
	font-size: 0.72rem;
	color: var(--ink-3);
}

.facts dd {
	margin: 0.2rem 0 0;
	font-family: var(--font-mono);
	font-size: 1.1rem;
}

.facts small,
.lines small,
.pnl-value small {
	margin-left: 0.25rem;
	font-family: var(--font-sans);
	font-size: 0.72rem;
	color: var(--ink-3);
}

/* 帳目明細列 */
.lines {
	margin: 0;
}

.lines > div {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.65rem 0;
	border-bottom: 1px solid var(--line);
}

.lines dt {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 0 0.5rem;
	font-size: 0.86rem;
	color: var(--ink-2);
}

.lines dt small {
	margin: 0;
}

.lines dd {
	margin: 0;
	font-family: var(--font-mono);
	font-size: 0.95rem;
	white-space: nowrap;
}

.lines .total {
	border-bottom: 0;
	padding-top: 0.9rem;
}

.lines .total dt {
	color: var(--ink);
	font-weight: 500;
}

.lines .total dd {
	font-size: 1.15rem;
	color: var(--ink);
}

/* 賣出 */
.sell {
	--tone: var(--rise);
}

.sell.fall {
	--tone: var(--fall);
}

.sell::before {
	content: "";
	position: absolute;
	top: -1px;
	left: 1.6rem;
	right: 1.6rem;
	height: 2px;
	border-radius: 2px;
	background: var(--tone);
	opacity: 0.8;
}

.pnl {
	margin-bottom: 0.5rem;
}

.pnl-label {
	font-size: 0.78rem;
	color: var(--tone);
}

.pnl-value {
	margin-top: 0.15rem;
	font-family: var(--font-display);
	font-size: clamp(2rem, 4vw, 2.6rem);
	line-height: 1.1;
	letter-spacing: -0.02em;
	color: var(--tone);
}

.pnl-pct {
	margin-top: 0.2rem;
	font-size: 0.85rem;
	color: var(--ink-2);
}

.compare {
	margin-top: 0.9rem;
	padding: 0.6rem 0.8rem;
	border-radius: 10px;
	background: color-mix(in srgb, var(--ink) 5%, transparent);
	font-size: 0.76rem;
	color: var(--ink-3);
}

@media (max-width: 720px) {
	.inputs {
		grid-template-columns: 1fr;
	}

	.facts {
		width: 100%;
		justify-content: space-between;
	}
}
</style>
