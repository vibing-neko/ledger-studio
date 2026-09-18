<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { animate, stagger } from 'animejs'
import ThemeToggle from './ThemeToggle.vue'
import { prefersReducedMotion } from '../utils/motion.js'

const links = [
	{ to: '/trade', label: '交易試算', index: '01', desc: '損益試算、加碼兩平價' },
	{ to: '/portfolio', label: '投資分析', index: '02', desc: '交易紀錄與報酬率' },
	{ to: '/expense', label: '信用卡記帳', index: '03', desc: '帳單週期與消費分析' },
]

// ── 手機選單（640px 以下取代導覽列）──
const route = useRoute()
const menuOpen = ref(false)
const header = ref(null)
const menuBtn = ref(null)

function onOutside(e) {
	if (!header.value?.contains(e.target)) closeMenu()
}

function onKey(e) {
	if (e.key !== 'Escape') return
	closeMenu()
	menuBtn.value?.focus()
}

function openMenu() {
	menuOpen.value = true
	document.addEventListener('pointerdown', onOutside, true)
	document.addEventListener('keydown', onKey)
}

function closeMenu() {
	menuOpen.value = false
	document.removeEventListener('pointerdown', onOutside, true)
	document.removeEventListener('keydown', onKey)
}

watch(() => route.path, closeMenu)

function menuEnter(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: [0, 1], y: [-10, 0], duration: 320, ease: 'out(3)', onComplete: done })
	animate(el.querySelectorAll('.menu-link'), { opacity: [0, 1], x: [-12, 0], duration: 420, ease: 'out(3)', delay: stagger(50, { start: 60 }) })
}

function menuLeave(el, done) {
	if (prefersReducedMotion()) return done()
	animate(el, { opacity: 0, y: -8, duration: 180, ease: 'in(2)', onComplete: done })
}

onBeforeUnmount(closeMenu)
</script>

<template>
	<header ref="header" class="header">
		<div class="container header-inner">
			<RouterLink to="/" class="brand" aria-label="Ledger Studio 首頁">
				<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
					<path d="M4 10h24M4 16h24M4 22h24" stroke="currentColor" stroke-opacity=".22" stroke-width="1.4" />
					<path class="brand-trend" d="M4 23l7-6.5 5 3L27 10" fill="none" stroke="var(--brass)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
					<circle cx="27" cy="10" r="2.4" fill="var(--brass)" />
				</svg>
				<span class="brand-name">Ledger</span>
				<span class="brand-sub">Studio</span>
			</RouterLink>
			<nav class="nav" aria-label="工具">
				<RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
					{{ link.label }}
				</RouterLink>
			</nav>
			<div class="header-right">
				<ThemeToggle />
				<button
					ref="menuBtn"
					type="button"
					class="menu-btn"
					:class="{ open: menuOpen }"
					:aria-expanded="menuOpen"
					aria-controls="mobile-menu"
					:aria-label="menuOpen ? '關閉選單' : '開啟選單'"
					@click="menuOpen ? closeMenu() : openMenu()"
				>
					<span class="menu-bar" />
					<span class="menu-bar" />
				</button>
			</div>
		</div>

		<Transition :css="false" @enter="menuEnter" @leave="menuLeave">
			<nav v-if="menuOpen" id="mobile-menu" class="menu" aria-label="工具">
				<div class="container menu-inner">
					<RouterLink to="/" class="menu-link" :class="{ current: route.path === '/' }">
						<span class="menu-index">00</span>
						<span class="menu-text">
							<span class="menu-label">總覽</span>
							<span class="menu-desc">所有工具</span>
						</span>
					</RouterLink>
					<RouterLink v-for="link in links" :key="link.to" :to="link.to" class="menu-link" :class="{ current: route.path === link.to }">
						<span class="menu-index">{{ link.index }}</span>
						<span class="menu-text">
							<span class="menu-label">{{ link.label }}</span>
							<span class="menu-desc">{{ link.desc }}</span>
						</span>
					</RouterLink>
				</div>
			</nav>
		</Transition>
	</header>
</template>

<style scoped>
.header {
	position: sticky;
	top: 0;
	z-index: 50;
	border-bottom: 1px solid var(--line);
	background: var(--header-bg);
	backdrop-filter: blur(14px) saturate(1.2);
	-webkit-backdrop-filter: blur(14px) saturate(1.2);
}

.header-inner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	height: 4rem;
}

.brand {
	display: flex;
	align-items: center;
	gap: 0.55rem;
	color: var(--ink);
}

.brand-mark {
	width: 1.75rem;
	height: 1.75rem;
	overflow: visible;
}

.brand-trend {
	transition: transform 0.6s var(--ease-out);
}

.brand:hover .brand-trend {
	transform: translateY(-2px);
}

.brand-name {
	font-family: var(--font-display);
	font-size: 1.25rem;
	font-weight: 500;
	font-style: italic;
	letter-spacing: -0.01em;
}

.brand-sub {
	font-family: var(--font-mono);
	font-size: 0.65rem;
	letter-spacing: 0.2em;
	text-transform: uppercase;
	color: var(--ink-3);
	padding-top: 0.2rem;
}

.header-right {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.nav {
	display: flex;
	gap: 0.25rem;
	margin-left: auto;
	margin-right: 0.9rem;
}

.nav-link {
	position: relative;
	padding: 0.4rem 0.85rem;
	border-radius: 999px;
	font-size: 0.88rem;
	color: var(--ink-2);
	transition: color 0.3s, background 0.3s;
}

.nav-link:hover {
	color: var(--ink);
	background: color-mix(in srgb, var(--ink) 6%, transparent);
}

.nav-link.router-link-active {
	color: var(--brass);
	background: color-mix(in srgb, var(--brass) 12%, transparent);
}

/* ── 手機選單 ── */
.menu-btn {
	display: none;
	position: relative;
	width: 2.4rem;
	height: 2.4rem;
	padding: 0;
	border: 1px solid var(--line-strong);
	border-radius: 999px;
	background: var(--sunken-bg);
	cursor: pointer;
}

.menu-bar {
	position: absolute;
	left: 50%;
	top: 50%;
	width: 1rem;
	height: 1.5px;
	margin-left: -0.5rem;
	border-radius: 2px;
	background: var(--ink);
	transition: transform 0.35s var(--ease-out);
}

.menu-bar:first-child {
	transform: translateY(-3.5px);
}

.menu-bar:last-child {
	transform: translateY(3.5px);
}

.menu-btn.open .menu-bar:first-child {
	transform: rotate(45deg);
}

.menu-btn.open .menu-bar:last-child {
	transform: rotate(-45deg);
}

.menu {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	border-bottom: 1px solid var(--line);
	/* 疊在頁面底色上變成不透明 */
	background: linear-gradient(var(--card-bg), var(--card-bg)), var(--bg);
	box-shadow: var(--shadow-lift);
}

.menu-inner {
	display: grid;
	gap: 0.25rem;
	padding-block: 0.75rem 1rem;
}

.menu-link {
	display: flex;
	align-items: center;
	gap: 0.9rem;
	padding: 0.7rem 0.75rem;
	border-radius: 14px;
	transition: background 0.2s;
}

.menu-link:hover,
.menu-link.current {
	background: color-mix(in srgb, var(--brass) 10%, transparent);
}

.menu-index {
	font-family: var(--font-display);
	font-style: italic;
	font-size: 0.95rem;
	color: var(--brass);
}

.menu-text {
	display: grid;
}

.menu-label {
	font-size: 0.98rem;
	font-weight: 500;
}

.menu-link.current .menu-label {
	color: var(--brass);
}

.menu-desc {
	font-size: 0.75rem;
	color: var(--ink-3);
}

/* 視窗從手機寬度拉寬時，開著的選單不要留在畫面上 */
@media (min-width: 641px) {
	.menu {
		display: none;
	}
}

@media (max-width: 640px) {
	.nav {
		display: none;
	}

	.menu-btn {
		display: block;
	}
}
</style>
