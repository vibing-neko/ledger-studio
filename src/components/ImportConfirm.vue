<script setup>
import ModalDialog from './ModalDialog.vue'
import { fmtNumber } from '../utils/format.js'

// 拖放匯入會覆蓋目前資料時的確認視窗：左邊目前、右邊匯入後，下方可以先匯出備份
defineProps({
	open: { type: Boolean, default: false },
	fileName: { type: String, default: '' },
	// [{ label: '張卡片', value: 3 }, ...]
	current: { type: Array, default: () => [] },
	next: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'confirm', 'backup'])
</script>

<template>
	<ModalDialog :open="open" title="匯入並取代目前的資料？" eyebrow="Import · 拖放的檔案" @close="emit('close')">
		<p class="file">
			<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
				<path d="M3.5 1.5h5l2.5 2.5v8.5h-7.5z M8.5 1.5V4H11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
			</svg>
			<span>{{ fileName }}</span>
		</p>

		<div class="compare">
			<div class="side">
				<span class="eyebrow">目前</span>
				<p v-for="item in current" :key="item.label"><b>{{ fmtNumber(item.value) }}</b> {{ item.label }}</p>
			</div>
			<svg class="arrow" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
				<path d="M4 10h11M11 6l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<div class="side next">
				<span class="eyebrow">匯入後</span>
				<p v-for="item in next" :key="item.label"><b>{{ fmtNumber(item.value) }}</b> {{ item.label }}</p>
			</div>
		</div>

		<p class="warn">目前的資料會整份被取代，無法復原。不確定的話，先匯出一份備份。</p>

		<div class="actions">
			<button type="button" class="btn btn-sm backup" @click="emit('backup')">先匯出備份</button>
			<span class="spacer" />
			<button type="button" class="btn" @click="emit('close')">取消</button>
			<button type="button" class="btn btn-primary" @click="emit('confirm')">匯入並取代</button>
		</div>
	</ModalDialog>
</template>

<style scoped>
.file {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	min-width: 0;
	font-family: var(--font-mono);
	font-size: 0.8rem;
	color: var(--ink-2);
}

.file span {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.file svg {
	flex-shrink: 0;
	color: var(--ink-3);
}

.compare {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
	align-items: center;
	gap: 1rem;
	margin-top: 1rem;
}

.side {
	display: grid;
	gap: 0.2rem;
	padding: 0.9rem 1rem;
	border: 1px solid var(--line);
	border-radius: 14px;
	background: var(--sunken-bg);
	font-size: 0.85rem;
	color: var(--ink-2);
}

.side .eyebrow {
	margin-bottom: 0.2rem;
}

.side b {
	font-family: var(--font-mono);
	font-size: 1rem;
	font-weight: 500;
	color: var(--ink);
}

.side.next {
	border-color: color-mix(in srgb, var(--brass) 45%, transparent);
	background: color-mix(in srgb, var(--brass) 7%, var(--sunken-bg));
}

.side.next .eyebrow {
	color: var(--brass);
}

.arrow {
	color: var(--ink-3);
}

.warn {
	margin-top: 1rem;
	padding: 0.6rem 0.8rem;
	border-radius: 10px;
	background: color-mix(in srgb, var(--vermilion) 9%, transparent);
	font-size: 0.78rem;
	color: var(--vermilion);
}

.actions {
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

.btn-sm {
	height: 2.35rem;
	padding-inline: 0.9rem;
	font-size: 0.8rem;
}

@media (max-width: 460px) {
	.compare {
		grid-template-columns: minmax(0, 1fr);
	}

	.arrow {
		justify-self: center;
		rotate: 90deg;
	}

	.spacer {
		display: none;
	}

	.backup {
		order: 5;
		width: 100%;
		justify-content: center;
	}

	.actions .btn:not(.backup) {
		flex: 1;
		justify-content: center;
	}
}
</style>
