<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { animate, spring } from 'animejs'
import { prefersReducedMotion } from '../utils/motion.js'

// 把檔案拖進視窗時整頁蓋上提示，放開就交給父層處理；只理會「檔案」的拖曳，拖選文字不受影響
defineProps({
	// 提示卡片下方的說明，例如「會取代目前的記帳資料，匯入前會再確認」
	hint: { type: String, default: '' },
})
const emit = defineEmits(['file', 'error'])

const active = ref(false)
// dragenter／dragleave 會在每個子元素上觸發，用計數判斷是否真的離開視窗
let depth = 0

const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files')

function onEnter(e) {
	if (!hasFiles(e)) return
	e.preventDefault()
	depth++
	active.value = true
}

function onOver(e) {
	if (!hasFiles(e)) return
	// 不擋預設行為的話，瀏覽器會直接打開檔案
	e.preventDefault()
	e.dataTransfer.dropEffect = 'copy'
}

function onLeave(e) {
	if (!hasFiles(e)) return
	depth = Math.max(0, depth - 1)
	if (!depth) active.value = false
}

function onDrop(e) {
	if (!hasFiles(e)) return
	e.preventDefault()
	depth = 0
	active.value = false
	const files = [...e.dataTransfer.files]
	if (files.length === 1) emit('file', files[0])
	else emit('error', '一次只能匯入一個檔案')
}

onMounted(() => {
	window.addEventListener('dragenter', onEnter)
	window.addEventListener('dragover', onOver)
	window.addEventListener('dragleave', onLeave)
	window.addEventListener('drop', onDrop)
})

onBeforeUnmount(() => {
	window.removeEventListener('dragenter', onEnter)
	window.removeEventListener('dragover', onOver)
	window.removeEventListener('dragleave', onLeave)
	window.removeEventListener('drop', onDrop)
})

// 遮罩淡入，卡片用彈簧微微放大，箭頭往下落一次（只播一次，不循環）
function onShow(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], duration: 200, ease: 'out(2)' })
	animate(el.querySelector('.drop-card'), { scale: [0.94, 1], y: [14, 0], ease: spring({ bounce: 0.3, duration: 480 }) })
	animate(el.querySelector('.drop-arrow'), { y: [-8, 0], opacity: [0, 1], duration: 520, delay: 120, ease: 'out(3)', onComplete: done })
}

function onHide(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, duration: 160, ease: 'in(2)' })
	animate(el.querySelector('.drop-card'), { scale: 0.97, duration: 160, ease: 'in(2)', onComplete: done })
}
</script>

<template>
	<Teleport to="body">
		<Transition :css="false" @enter="onShow" @leave="onHide">
			<div v-if="active" class="drop" aria-hidden="true">
				<div class="drop-card">
					<svg class="drop-icon" viewBox="0 0 48 48">
						<path class="drop-sheet" d="M13 6h15l9 9v27H13z" />
						<path class="drop-fold" d="M28 6v9h9" />
						<g class="drop-arrow">
							<path d="M25 19v14M19.5 27.5L25 33l5.5-5.5" />
						</g>
					</svg>
					<p class="drop-title">放開以匯入 JSON</p>
					<p v-if="hint" class="drop-hint">{{ hint }}</p>
				</div>
			</div>
		</Transition>
	</Teleport>
</template>

<style scoped>
.drop {
	position: fixed;
	inset: 0;
	z-index: 400;
	display: grid;
	place-items: center;
	padding: 1.5rem;
	background: color-mix(in srgb, var(--bg) 72%, transparent);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	/* 不擋拖曳事件，計數才不會被遮罩本身打亂 */
	pointer-events: none;
}

.drop-card {
	display: grid;
	justify-items: center;
	gap: 0.35rem;
	width: min(26rem, 100%);
	padding: 2.4rem 2rem 2.2rem;
	border: 1.5px dashed color-mix(in srgb, var(--brass) 60%, transparent);
	border-radius: 28px;
	/* 疊在頁面底色上變成不透明 */
	background:
		radial-gradient(420px 200px at 50% 0%, color-mix(in srgb, var(--brass) 12%, transparent), transparent 70%),
		linear-gradient(var(--card-bg), var(--card-bg)),
		var(--bg);
	box-shadow: var(--shadow-lift);
	text-align: center;
}

.drop-icon {
	width: 3.4rem;
	height: 3.4rem;
	margin-bottom: 0.6rem;
	overflow: visible;
}

.drop-sheet,
.drop-fold {
	fill: none;
	stroke: var(--ink-3);
	stroke-width: 1.6;
	stroke-linejoin: round;
}

.drop-arrow path {
	fill: none;
	stroke: var(--brass);
	stroke-width: 2.2;
	stroke-linecap: round;
	stroke-linejoin: round;
}

.drop-title {
	font-family: var(--font-serif);
	font-size: 1.35rem;
	font-weight: 600;
	color: var(--ink);
}

.drop-hint {
	max-width: 20rem;
	font-size: 0.82rem;
	color: var(--ink-3);
	text-wrap: balance;
}
</style>
