import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import TradeView from './views/TradeView.vue'
import PortfolioView from './views/PortfolioView.vue'
import ExpenseView from './views/ExpenseView.vue'

const router = createRouter({
	history: createWebHashHistory(import.meta.env.BASE_URL),
	routes: [
		{ path: '/', name: 'home', component: HomeView },
		{ path: '/trade', name: 'trade', component: TradeView, meta: { title: '交易試算', index: '01' } },
		{ path: '/portfolio', name: 'portfolio', component: PortfolioView, meta: { title: '投資報酬率分析', index: '02' } },
		{ path: '/expense', name: 'expense', component: ExpenseView, meta: { title: '信用卡記帳分析', index: '03' } },
		{ path: '/:pathMatch(.*)*', redirect: '/' },
	],
	scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
	document.title = to.meta.title ? `${to.meta.title} · Ledger Studio` : 'Ledger Studio'
})

export default router
