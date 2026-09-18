import { animate } from 'animejs'

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

export const prefersReducedMotion = () => reduceMotion.matches

// 減少動態時直接結束離場。<Transition mode="out-in"> 的離場如果「當下」就呼叫 done，
// Vue 會在還沒渲染完時重入更新而出錯（換頁後整頁空白），所以延到下一輪再呼叫
export const skipLeave = (done) => setTimeout(done)

// 動畫結束後清掉行內樣式：<KeepAlive> 的元件會留著上一次離場的 opacity: 0，
// 用 cleanInlineStyles 會被還原成那個值，所以直接移除屬性
function clearInline(el) {
	el.style.removeProperty('opacity')
	el.style.removeProperty('transform')
}

// 給 <Transition :css="false"> 使用的進出場
export function enterUp(el, done) {
	if (reduceMotion.matches) {
		clearInline(el)
		return done()
	}
	animate(el, {
		opacity: [0, 1],
		y: [16, 0],
		duration: 600,
		ease: 'out(4)',
		onComplete: () => {
			clearInline(el)
			done()
		},
	})
}

export function leaveFade(el, done) {
	if (reduceMotion.matches) return skipLeave(done)
	animate(el, { opacity: 0, y: -8, duration: 200, ease: 'in(2)', onComplete: done })
}

// 換頁：進場後同樣要清掉 transform，否則會成為 fixed / sticky 的參考容器
export function enterPage(el, done) {
	if (reduceMotion.matches) {
		clearInline(el)
		return done()
	}
	animate(el, {
		opacity: [0, 1],
		y: [20, 0],
		duration: 620,
		ease: 'out(4)',
		onComplete: () => {
			clearInline(el)
			done()
		},
	})
}

export function leavePage(el, done) {
	if (reduceMotion.matches) return skipLeave(done)
	animate(el, { opacity: 0, y: -12, duration: 260, ease: 'in(2)', onComplete: done })
}
