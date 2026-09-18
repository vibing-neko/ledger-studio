<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
	modelValue: { type: Number, default: null },
	label: { type: String, required: true },
	suffix: { type: String, default: '' },
	hint: { type: String, default: '' },
	error: { type: String, default: '' },
	step: { type: [Number, String], default: 'any' },
	placeholder: { type: String, default: '' },
	// 允許負數：手機的數字鍵盤（inputmode）沒有負號，要改用一般的數字輸入鍵盤
	signed: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const id = useId()
const model = computed({
	get: () => props.modelValue ?? '',
	set: (value) => emit('update:modelValue', value === '' ? null : value),
})
</script>

<template>
	<div class="field" :class="{ 'has-error': error }">
		<label :for="id" class="field-label">{{ label }}</label>
		<div class="field-box">
			<input
				:id="id"
				v-model.number="model"
				type="number"
				:inputmode="signed ? null : 'decimal'"
				:min="signed ? null : 0"
				:step="step"
				:placeholder="placeholder"
			/>
			<span v-if="suffix" class="field-suffix">{{ suffix }}</span>
		</div>
		<p v-if="error" class="field-error">{{ error }}</p>
		<p v-else-if="hint" class="field-hint">{{ hint }}</p>
	</div>
</template>

<style scoped>
.field-box {
	display: flex;
	align-items: center;
	height: 2.9rem;
	border: 1px solid var(--line-strong);
	border-radius: 12px;
	background: var(--sunken-bg);
	transition: border-color 0.25s, box-shadow 0.25s;
}

.field-box:hover {
	border-color: color-mix(in srgb, var(--ink) 28%, transparent);
}

.field-box:focus-within {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

.has-error .field-box {
	border-color: var(--vermilion);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--vermilion) 15%, transparent);
}

input {
	flex: 1;
	min-width: 0;
	height: 100%;
	padding: 0 0.85rem;
	border: 0;
	outline: none;
	background: transparent;
	color: var(--ink);
	font-family: var(--font-mono);
	font-size: 0.98rem;
	font-variant-numeric: tabular-nums;
	appearance: textfield;
	-moz-appearance: textfield;
}

input::-webkit-inner-spin-button,
input::-webkit-outer-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

input::placeholder {
	color: var(--ink-3);
	opacity: 0.7;
}

.field-suffix {
	padding-right: 0.85rem;
	font-size: 0.8rem;
	color: var(--ink-3);
	white-space: nowrap;
}
</style>
