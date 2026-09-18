<script setup>
import { ref, watch, nextTick, useId, onBeforeUnmount } from 'vue'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../utils/motion.js'

const props = defineProps({
	open: { type: Boolean, default: false },
	title: { type: String, required: true },
	eyebrow: { type: String, default: '' },
})
const emit = defineEmits(['close', 'after-leave'])

const titleId = useId()
const panel = ref(null)
const sheet = window.matchMedia('(max-width: 560px)')
let returnTo = null

// 開著時鎖住背後頁面的捲動；補上捲軸寬度，避免頁面左右跳一下
function lockScroll() {
	const gap = window.innerWidth - document.documentElement.clientWidth
	document.documentElement.style.overflow = 'hidden'
	if (gap > 0) document.body.style.paddingRight = `${gap}px`
}

function unlockScroll() {
	document.documentElement.style.removeProperty('overflow')
	document.body.style.removeProperty('padding-right')
}

const focusables = () =>
	[...(panel.value?.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || [])].filter(
		(el) => !el.disabled && el.offsetParent !== null,
	)

// Esc 關閉；Tab 只在視窗內循環
function onKey(e) {
	if (e.key === 'Escape') {
		e.preventDefault()
		emit('close')
		return
	}
	if (e.key !== 'Tab') return
	const list = focusables()
	if (!list.length) return
	const first = list[0]
	const last = list[list.length - 1]
	if (e.shiftKey && document.activeElement === first) {
		e.preventDefault()
		last.focus()
	} else if (!e.shiftKey && document.activeElement === last) {
		e.preventDefault()
		first.focus()
	} else if (!panel.value.contains(document.activeElement)) {
		e.preventDefault()
		first.focus()
	}
}

watch(
	() => props.open,
	(open) => {
		if (open) {
			returnTo = document.activeElement
			lockScroll()
			document.addEventListener('keydown', onKey)
			// 打開時游標放在第一個輸入欄（標題列的關閉鈕排在前面，要先找輸入欄）
			nextTick(() => {
				const target = panel.value?.querySelector('input, select, textarea') || focusables()[0]
				target?.focus({ preventScroll: true })
			})
		} else {
			document.removeEventListener('keydown', onKey)
		}
	},
)

// ── 進出場：桌機由略小放大淡入，手機從底部滑上來 ──
function onEnter(el, done) {
	const box = el.querySelector('.modal-panel')
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], duration: 220, ease: 'out(2)' })
	const motion = sheet.matches ? { y: ['100%', '0%'] } : { opacity: [0, 1], scale: [0.96, 1], y: [12, 0] }
	animate(box, {
		...motion,
		duration: sheet.matches ? 420 : 360,
		ease: 'out(4)',
		onComplete: () => {
			// 清掉 transform，避免成為視窗內 fixed 元素的定位參考
			box.style.removeProperty('transform')
			box.style.removeProperty('opacity')
			done()
		},
	})
}

function onLeave(el, done) {
	const box = el.querySelector('.modal-panel')
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, duration: 200, delay: 60, ease: 'in(2)' })
	const motion = sheet.matches ? { y: '100%' } : { opacity: 0, scale: 0.97, y: 8 }
	animate(box, { ...motion, duration: sheet.matches ? 260 : 200, ease: 'in(2)', onComplete: done })
}

function onAfterLeave() {
	unlockScroll()
	emit('after-leave')
	// 焦點沒有被父層移到別處（例如新增後聚焦新的一列）時，還給打開視窗的按鈕
	nextTick(() => {
		const active = document.activeElement
		if ((!active || active === document.body) && returnTo?.isConnected) returnTo.focus({ preventScroll: true })
		returnTo = null
	})
}

onBeforeUnmount(() => {
	document.removeEventListener('keydown', onKey)
	if (props.open) unlockScroll()
})
</script>

<template>
	<Teleport to="body">
		<Transition :css="false" @enter="onEnter" @leave="onLeave" @after-leave="onAfterLeave">
			<div v-if="open" class="modal" @mousedown.self="emit('close')">
				<div ref="panel" class="modal-panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
					<header class="modal-head">
						<div>
							<p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
							<h2 :id="titleId" class="modal-title">{{ title }}</h2>
						</div>
						<button type="button" class="modal-close" aria-label="關閉" @click="emit('close')">
							<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true">
								<path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
					</header>
					<slot />
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.modal {
	position: fixed;
	inset: 0;
	z-index: 300;
	display: grid;
	place-items: center;
	padding: 1.25rem;
	background: color-mix(in srgb, var(--bg) 60%, transparent);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
}

.modal-panel {
	width: min(40rem, 100%);
	max-height: calc(100svh - 2.5rem);
	overflow-y: auto;
	padding: clamp(1.25rem, 3vw, 1.75rem);
	border: 1px solid var(--line-strong);
	border-radius: 22px;
	/* 疊在頁面底色上變成不透明 */
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-lift);
	color: var(--ink);
}

.modal-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1.25rem;
}

.modal-title {
	margin-top: 0.3rem;
	font-family: var(--font-serif);
	font-size: 1.35rem;
	font-weight: 600;
}

.modal-close {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 2.2rem;
	height: 2.2rem;
	margin: -0.25rem -0.4rem 0 0;
	border: 1px solid transparent;
	border-radius: 999px;
	background: none;
	color: var(--ink-3);
	cursor: pointer;
	transition: color 0.2s, border-color 0.2s;
}

.modal-close:hover {
	border-color: var(--line-strong);
	color: var(--ink);
}

/* 手機：從底部滑上來的面板 */
@media (max-width: 560px) {
	.modal {
		place-items: end stretch;
		padding: 0;
	}

	.modal-panel {
		width: 100%;
		max-height: calc(100svh - 3rem);
		padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
		border-bottom: 0;
		border-radius: 22px 22px 0 0;
	}
}
</style>
