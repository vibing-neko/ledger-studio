<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import TextField from '../TextField.vue'
import NumberField from '../NumberField.vue'
import DateField from '../DateField.vue'
import SelectField from '../SelectField.vue'
import { todayISO } from '../../utils/expense.js'
import { fmtNumber } from '../../utils/format.js'

const props = defineProps({
	cards: { type: Array, required: true },
	categories: { type: Array, required: true },
	// 記住上一筆選的卡片與分類，連續輸入時不用每次重選
	lastCardId: { type: Number, default: null },
	lastCategoryId: { type: Number, default: null },
	// 給 SelectField 的選項（含卡片色塊、使用筆數）
	cardChoices: { type: Array, required: true },
	categoryChoices: { type: Array, required: true },
})
const emit = defineEmits(['add'])

const pickCard = () => (props.cards.some((c) => c.id === props.lastCardId) ? props.lastCardId : props.cards[0]?.id ?? null)
const pickCategory = () =>
	props.categories.some((c) => c.id === props.lastCategoryId) ? props.lastCategoryId : props.categories[0]?.id ?? null

const form = ref({ date: todayISO(), cardId: pickCard(), categoryId: pickCategory(), title: '', amount: null, installments: 1 })
const errors = ref({})
const root = ref(null)

// 卡片或分類被刪除時，改選還存在的
watch(
	() => [props.cards.length, props.categories.length],
	() => {
		if (!props.cards.some((c) => c.id === form.value.cardId)) form.value.cardId = pickCard()
		if (!props.categories.some((c) => c.id === form.value.categoryId)) form.value.categoryId = pickCategory()
	},
)

watch(
	() => [form.value.amount, form.value.installments],
	() => (errors.value = {}),
)

const perInstallment = computed(() => {
	const n = form.value.installments
	const a = form.value.amount
	if (!(n > 1) || !a) return ''
	return `每期約 ${fmtNumber(Math.trunc(a / n))} 元`
})

function submit() {
	const f = form.value
	const next = {}
	if (!f.amount) next.amount = '請輸入金額'
	if (!Number.isInteger(f.installments ?? 1) || (f.installments ?? 1) < 1 || f.installments > 60) next.installments = '1–60 期'
	errors.value = next
	if (Object.keys(next).length || !f.cardId) return

	emit('add', {
		date: f.date || todayISO(),
		cardId: f.cardId,
		categoryId: f.categoryId,
		title: f.title.trim(),
		amount: Math.round(f.amount),
		installments: f.installments || 1,
	})

	// 日期、卡片、分類保留，方便連續輸入；焦點回到項目欄
	form.value = { ...f, title: '', amount: null, installments: 1 }
	nextTick(() => root.value?.querySelector('.entry-title input')?.focus())
}
</script>

<template>
	<form ref="root" class="panel entry" novalidate @submit.prevent="submit">
		<header class="section-head">
			<h2 class="section-title">記一筆</h2>
			<span class="eyebrow">Enter 送出 · 卡片與分類會保留</span>
		</header>

		<!-- 最常填的項目與金額放第一列，Tab 順序也從這裡開始 -->
		<div class="entry-row entry-main">
			<TextField v-model="form.title" class="entry-title" label="項目" placeholder="例如：午餐、高鐵票" />
			<NumberField v-model="form.amount" class="entry-amount" label="金額" suffix="元" step="1" placeholder="0" signed :error="errors.amount" hint="退款填負數" />
			<NumberField
				v-model="form.installments"
				label="分期"
				suffix="期"
				step="1"
				placeholder="1"
				:error="errors.installments"
				:hint="perInstallment || '1 為一次付清'"
			/>
		</div>

		<div class="entry-row entry-meta">
			<div class="field">
				<span class="field-label">消費日</span>
				<DateField v-model="form.date" label="消費日" />
			</div>

			<div class="field">
				<span class="field-label">卡片</span>
				<SelectField v-model="form.cardId" :options="cardChoices" label="卡片" />
			</div>

			<div class="field">
				<span class="field-label">分類</span>
				<SelectField v-model="form.categoryId" :options="categoryChoices" label="分類" />
			</div>

			<button type="submit" class="btn btn-primary entry-submit">
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
					<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
				</svg>
				記下
			</button>
		</div>
	</form>
</template>

<style scoped>
.entry-row {
	display: grid;
	gap: 0.85rem;
	align-items: start;
}

.entry-main {
	grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.75fr);
}

.entry-meta {
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr) auto;
	margin-top: 0.4rem;
}

/* 送出鈕對齊輸入框（上方留出標籤的高度） */
.entry-submit {
	margin-top: calc(0.8rem * 1.7 + 0.4rem);
	height: 2.9rem;
	padding-inline: 1.6rem;
}

@media (max-width: 560px) {
	.entry-main,
	.entry-meta {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.entry-title {
		grid-column: 1 / -1;
	}

	.entry-submit {
		grid-column: 1 / -1;
		justify-content: center;
		margin-top: 0.25rem;
	}
}
</style>
