<script setup>
import { ref, nextTick } from 'vue'
import { animate, set, stagger } from 'animejs'
import { prefersReducedMotion, skipLeave } from '../../utils/motion.js'

const props = defineProps({
	categories: { type: Array, required: true },
	txs: { type: Array, required: true },
})
const emit = defineEmits(['add', 'remove'])

const editing = ref(false)
const draft = ref('')
const error = ref('')
const root = ref(null)
const body = ref(null)

const usage = (id) => props.txs.filter((tx) => tx.categoryId === id).length

function add() {
	const name = draft.value.trim()
	if (!name) return
	if (props.categories.some((c) => c.name === name)) {
		error.value = `已經有「${name}」了`
		return
	}
	emit('add', name)
	draft.value = ''
	error.value = ''
	nextTick(() => root.value?.querySelector('.cat-add input')?.focus({ preventScroll: true }))
}

// 改名時清空不存檔，離開欄位若是空的就還原
function commitName(cat, e) {
	const name = e.target.value.trim()
	if (name) cat.name = name
	else e.target.value = cat.name
}

// ── 切換編輯：舊內容依序淡出 → 換內容 → 面板高度平滑伸縮，新內容依序淡入 ──
let switching = false

async function toggle() {
	error.value = ''
	if (prefersReducedMotion()) {
		editing.value = !editing.value
		return
	}
	if (switching) return
	switching = true

	const el = body.value
	const from = el.offsetHeight
	el.style.height = `${from}px`
	el.style.overflow = 'hidden'
	await animate(el.querySelectorAll('.fx'), { opacity: 0, y: -6, duration: 160, delay: stagger(10), ease: 'in(2)' })

	editing.value = !editing.value
	await nextTick()
	const items = el.querySelectorAll('.fx')
	set(items, { opacity: 0, y: 8 })
	// scrollHeight 不會小於目前固定的高度，縮回時量不到，要暫時解除固定高度量實際高度
	el.style.height = 'auto'
	const to = el.offsetHeight
	el.style.height = `${from}px`

	animate(el, {
		height: [from, to],
		duration: 420,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('height')
			el.style.removeProperty('overflow')
		},
	})
	await animate(items, { opacity: 1, y: 0, duration: 420, delay: stagger(22, { start: 80 }), ease: 'out(3)' })
	items.forEach((item) => {
		item.style.removeProperty('opacity')
		item.style.removeProperty('transform')
	})
	switching = false
}

// 按鈕文字「編輯」「完成」交錯淡入淡出
function labelEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], y: [6, 0], duration: 240, ease: 'out(3)', onComplete: done })
}

function labelLeave(el, done) {
	if (prefersReducedMotion()) return skipLeave(done)
	animate(el, { opacity: 0, y: -6, duration: 140, ease: 'in(2)', onComplete: done })
}

// ── 新增、刪除分類：新的一格放大淡入；刪除的先脫離版面淡出，其他格子滑過去補位 ──
function itemEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, {
		opacity: [0, 1],
		scale: [0.9, 1],
		duration: 380,
		ease: 'out(3)',
		onComplete: () => {
			el.style.removeProperty('opacity')
			el.style.removeProperty('transform')
			done()
		},
	})
}

function itemLeave(el, done) {
	if (prefersReducedMotion()) return done()
	const { offsetLeft, offsetTop, offsetWidth } = el
	Object.assign(el.style, { position: 'absolute', left: `${offsetLeft}px`, top: `${offsetTop}px`, width: `${offsetWidth}px` })
	animate(el, { opacity: 0, scale: 0.9, duration: 220, ease: 'in(2)', onComplete: done })
}
</script>

<template>
	<section ref="root" class="panel category-manager">
		<header class="section-head">
			<h2 class="section-title">分類</h2>
			<button type="button" class="link-btn" :aria-pressed="editing" @click="toggle">
				<Transition mode="out-in" :css="false" @enter="labelEnter" @leave="labelLeave">
					<span :key="editing">{{ editing ? '完成' : '編輯' }}</span>
				</Transition>
			</button>
		</header>

		<div ref="body" class="cat-body">
			<ul v-if="!editing" class="chips">
				<li v-for="cat in categories" :key="cat.id" class="chip fx">
					{{ cat.name }}
					<small v-if="usage(cat.id)">{{ usage(cat.id) }}</small>
				</li>
			</ul>

			<template v-else>
				<TransitionGroup tag="ul" class="cat-edit" :css="false" move-class="cat-move" @enter="itemEnter" @leave="itemLeave">
					<li v-for="cat in categories" :key="cat.id" class="fx">
						<input type="text" class="cat-input" :value="cat.name" maxlength="10" :aria-label="`分類名稱：${cat.name}`" @change="commitName(cat, $event)" />
						<button
							type="button"
							class="cat-del"
							:disabled="usage(cat.id) > 0 || categories.length <= 1"
							:title="usage(cat.id) ? `還有 ${usage(cat.id)} 筆消費使用這個分類` : '刪除分類'"
							:aria-label="`刪除分類 ${cat.name}`"
							@click="emit('remove', cat.id)"
						>
							<svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
					</li>
				</TransitionGroup>
				<form class="cat-add fx" @submit.prevent="add">
					<input v-model="draft" type="text" class="cat-input" maxlength="10" placeholder="新分類名稱" aria-label="新分類名稱" @input="error = ''" />
					<button type="submit" class="btn btn-sm" :disabled="!draft.trim()">新增</button>
				</form>
				<p class="cat-msg fx" :class="{ error }">{{ error || '有消費使用中的分類不能刪除，可以改名' }}</p>
			</template>
		</div>
	</section>
</template>

<style scoped>
.link-btn {
	padding: 0.2rem 0.6rem;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	font-size: 0.78rem;
	color: var(--brass);
	cursor: pointer;
	transition: border-color 0.2s, background 0.2s;
}

.link-btn:hover {
	border-color: color-mix(in srgb, var(--brass) 40%, transparent);
	background: color-mix(in srgb, var(--brass) 8%, transparent);
}

.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.chip {
	display: inline-flex;
	align-items: baseline;
	gap: 0.35rem;
	padding: 0.2rem 0.7rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--ink) 6%, transparent);
	font-size: 0.78rem;
	color: var(--ink-2);
}

.chip small {
	font-family: var(--font-mono);
	font-size: 0.68rem;
	color: var(--ink-3);
}

.link-btn span {
	display: inline-block;
}

.cat-edit {
	position: relative;
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.4rem;
	margin: 0;
	padding: 0;
	list-style: none;
}

.cat-edit li {
	position: relative;
}

.cat-move {
	transition: transform 0.4s var(--ease-out);
}

.cat-input {
	width: 100%;
	height: 2.2rem;
	padding: 0 1.9rem 0 0.65rem;
	border: 1px solid var(--line-strong);
	border-radius: 10px;
	outline: none;
	background: var(--sunken-bg);
	color: var(--ink);
	font: inherit;
	font-size: 0.82rem;
	transition: border-color 0.2s, box-shadow 0.2s;
}

.cat-input:focus {
	border-color: var(--brass);
	box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass) 18%, transparent);
}

.cat-input::placeholder {
	color: var(--ink-3);
	opacity: 0.7;
}

.cat-del {
	position: absolute;
	top: 50%;
	right: 0.35rem;
	display: grid;
	place-items: center;
	width: 1.4rem;
	height: 1.4rem;
	border: 0;
	border-radius: 50%;
	background: none;
	color: var(--ink-3);
	cursor: pointer;
	transform: translateY(-50%);
	transition: color 0.2s, background 0.2s;
}

.cat-del:hover:not(:disabled) {
	color: var(--vermilion);
	background: color-mix(in srgb, var(--vermilion) 12%, transparent);
}

.cat-del:disabled {
	opacity: 0.3;
	cursor: not-allowed;
}

.cat-add {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.4rem;
	margin-top: 0.6rem;
}

.cat-add .cat-input {
	padding-right: 0.65rem;
}

.btn-sm {
	height: 2.2rem;
	padding-inline: 0.9rem;
	font-size: 0.8rem;
}

.btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
}

.cat-msg {
	min-height: 1.05rem;
	margin-top: 0.4rem;
	font-size: 0.72rem;
	color: var(--ink-3);
}

.cat-msg.error {
	color: var(--vermilion);
}
</style>
