<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
	modelValue: { type: String, default: '' },
	label: { type: String, required: true },
	hint: { type: String, default: '' },
	error: { type: String, default: '' },
	placeholder: { type: String, default: '' },
	maxlength: { type: [Number, String], default: null },
	mono: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'enter'])

const id = useId()
const model = computed({
	get: () => props.modelValue ?? '',
	set: (value) => emit('update:modelValue', value),
})
</script>

<template>
	<div class="field" :class="{ 'has-error': error }">
		<label :for="id" class="field-label">{{ label }}</label>
		<div class="field-box">
			<input
				:id="id"
				v-model="model"
				type="text"
				:class="{ mono }"
				:placeholder="placeholder"
				:maxlength="maxlength"
				@keyup.enter="emit('enter')"
			/>
		</div>
		<p class="field-msg" :class="{ 'is-error': error }">{{ error || hint }}</p>
	</div>
</template>

<style scoped>
/* 固定保留一行，hint 換成 error 時版面不會跳動 */
.field-msg {
	min-height: 1.05rem;
	font-size: 0.72rem;
	line-height: 1.45;
	color: var(--ink-3);
	transition: color 0.25s;
}

.field-msg.is-error {
	color: var(--vermilion);
}

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
	font-size: 0.95rem;
}

input.mono {
	font-family: var(--font-mono);
	letter-spacing: 0.04em;
}

input::placeholder {
	color: var(--ink-3);
	opacity: 0.7;
}
</style>
