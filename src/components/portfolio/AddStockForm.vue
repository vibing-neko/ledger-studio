<script setup>
import { ref, watch } from 'vue'
import TextField from '../TextField.vue'
import NumberField from '../NumberField.vue'
import SegmentedControl from '../SegmentedControl.vue'
import { TAX_RATES } from '../../utils/fees.js'

const props = defineProps({
	existing: { type: Array, required: true },
})
const emit = defineEmits(['add', 'cancel'])

const types = [
	{ value: 'stock', label: '個股' },
	{ value: 'etf', label: 'ETF' },
]

const blank = () => ({ symbol: '', name: '', type: 'stock', price: null })
const form = ref(blank())
const error = ref('')

// 台股 ETF 代號多為 00 開頭，先幫忙切好；代號改掉後切回個股。使用者手動選過類型就不再自動切換
let autoType = true

watch(
	() => form.value.symbol,
	(symbol) => {
		error.value = ''
		if (autoType) form.value.type = /^00/.test(symbol.trim()) ? 'etf' : 'stock'
	},
)

function chooseType(type) {
	autoType = false
	form.value.type = type
}

function submit() {
	const symbol = form.value.symbol.trim().toUpperCase()
	if (!symbol) {
		error.value = '請輸入股票代號'
		return
	}
	if (props.existing.some((s) => s.symbol === symbol)) {
		error.value = `${symbol} 已經在報表裡了`
		return
	}
	emit('add', { symbol, name: form.value.name.trim(), type: form.value.type, price: form.value.price })
	form.value = blank()
	autoType = true
	error.value = ''
}
</script>

<template>
	<form class="add-stock" @submit.prevent="submit">
		<div class="add-grid">
			<TextField
				v-model="form.symbol"
				label="代號"
				placeholder="2330"
				maxlength="8"
				mono
				:error="error"
				hint="必填"
			/>
			<TextField v-model="form.name" label="名稱" placeholder="台積電" hint="選填" />
			<div class="field">
				<span class="field-label">類型</span>
				<SegmentedControl :model-value="form.type" :options="types" label="商品類型" block @update:model-value="chooseType" />
				<p class="field-hint">賣出證交稅 {{ TAX_RATES[form.type] * 100 }}%</p>
			</div>
			<NumberField v-model="form.price" label="目前股價" suffix="元" step="0.01" placeholder="選填" hint="用來算未實現損益" />
		</div>

		<div class="add-actions">
			<button type="button" class="btn" @click="emit('cancel')">取消</button>
			<button type="submit" class="btn btn-primary">加入報表</button>
		</div>
	</form>
</template>

<style scoped>
.add-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem 1.1rem;
	align-items: start;
}

.add-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.6rem;
	margin-top: 1.25rem;
	padding-top: 1.1rem;
	border-top: 1px solid var(--line);
}

@media (max-width: 460px) {
	.add-grid {
		grid-template-columns: 1fr;
	}

	.add-actions .btn {
		flex: 1;
		justify-content: center;
	}
}
</style>
