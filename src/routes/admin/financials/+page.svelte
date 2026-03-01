<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';

	let checking = $state(true);
	let authorized = $state(false);
	let currentMonth = $state(new Date());
	let financialData = $state<Record<string, { entries: Entry[] }>>({});
	let ideasData = $state<Idea[]>([]);
	let selectedYear = $state(new Date().getFullYear().toString());
	let sortAsc = $state(true);
	let showEntryModal = $state(false);
	let showIdeaModal = $state(false);
	let collapsed = $state<Record<string, boolean>>({});

	// Entry form
	let entryType = $state<'income'|'expense'>('income');
	let entryFreq = $state('monthly');
	let entryRecurMonths = $state(1);
	let entrySource = $state('');
	let entryDesc = $state('');
	let entryAmount = $state('');

	// Idea form
	let ideaCat = $state('acquisition');
	let ideaTitle = $state('');
	let ideaDesc = $state('');
	let ideaEst = $state('');

	interface Entry { type: 'income'|'expense'; source: string; description: string; amount: number; frequency: string; }
	interface Idea { category: string; title: string; description: string; estimate: string; }

	const DEFAULT_ENTRIES: Entry[] = [{ type: 'expense', source: 'GoDaddy', description: 'Domain registration', amount: 1.67, frequency: 'monthly' }];
	const DEFAULT_IDEAS: Idea[] = [
		{ category: 'revenue', title: 'Premium Memberships', description: 'Monthly subscriptions with perks', estimate: '$3-10/mo per user' },
		{ category: 'revenue', title: 'Patreon / Ko-fi', description: 'Community donations with tiers', estimate: 'Variable' },
		{ category: 'engagement', title: 'Tournament Hosting', description: 'Challenge run competitions', estimate: '% of entry fees' },
		{ category: 'acquisition', title: 'Game Dev Partnerships', description: 'Partner with indie devs', estimate: 'Sponsorships' }
	];

	const services = [
		{ icon: '🌐', name: 'GoDaddy Domain', desc: 'challengerun.net', cost: '$20/year', monthly: '~$1.67/mo', status: 'Active' },
		{ icon: '☁️', name: 'Cloudflare', desc: 'CDN & Security', cost: 'Free', monthly: '$0/mo', status: 'Free Tier' },
		{ icon: '🗄️', name: 'Supabase', desc: 'Database & Auth', cost: 'Free', monthly: '$0/mo', status: 'Free Tier' },
		{ icon: '🐙', name: 'GitHub', desc: 'Code & Actions', cost: 'Free', monthly: '$0/mo', status: 'Free Tier' }
	];

	onMount(() => {
		const unsub = isLoading.subscribe(async (l) => {
			if (!l) {
				let sess: any;
				session.subscribe(s => sess = s)();
				if (!sess) { goto('/sign-in?redirect=/admin/financials'); return; }
				const role = await checkAdminRole();
				authorized = !!role?.admin;
				checking = false;
				if (authorized) loadData();
			}
		});
		return unsub;
	});

	function getMonthKey(d: Date) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
	function getMonthName(d: Date) { return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }

	function loadData() {
		try { financialData = JSON.parse(localStorage.getItem('crc-financials-v2') || '{}'); } catch { financialData = {}; }
		try { ideasData = JSON.parse(localStorage.getItem('crc-ideas') || '[]'); } catch { ideasData = []; }
		if (ideasData.length === 0) { ideasData = [...DEFAULT_IDEAS]; }
		const mk = getMonthKey(currentMonth);
		if (!financialData[mk]) financialData[mk] = { entries: [...DEFAULT_ENTRIES] };
	}

	function save() { localStorage.setItem('crc-financials-v2', JSON.stringify(financialData)); }
	function saveIdeas() { localStorage.setItem('crc-ideas', JSON.stringify(ideasData)); }

	const monthKey = $derived(getMonthKey(currentMonth));
	const entries = $derived(financialData[monthKey]?.entries || []);
	const totalIncome = $derived(entries.filter(e => e.type === 'income').reduce((s, e) => s + e.amount, 0));
	const totalExpenses = $derived(entries.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0));
	const netTotal = $derived(totalIncome - totalExpenses);

	const years = $derived(Array.from({ length: 5 }, (_, i) => 2025 + i));
	const historyMonths = $derived.by(() => {
		let months = Object.keys(financialData).sort();
		if (!sortAsc) months = months.reverse();
		if (selectedYear) months = months.filter(k => k.startsWith(selectedYear));
		return months;
	});
	const historyTotals = $derived.by(() => {
		let rev = 0, exp = 0;
		historyMonths.forEach(k => {
			const e = financialData[k]?.entries || [];
			rev += e.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0);
			exp += e.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0);
		});
		return { rev, exp, net: rev - exp };
	});

	function prevMonth() { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1); const mk = getMonthKey(currentMonth); if (!financialData[mk]) financialData[mk] = { entries: [] }; }
	function nextMonth() { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1); const mk = getMonthKey(currentMonth); if (!financialData[mk]) financialData[mk] = { entries: [] }; }

	function deleteEntry(i: number) {
		if (!confirm('Delete this entry?')) return;
		financialData[monthKey].entries.splice(i, 1);
		financialData = { ...financialData }; save();
	}
	function deleteIdea(i: number) {
		if (!confirm('Delete this idea?')) return;
		ideasData.splice(i, 1);
		ideasData = [...ideasData]; saveIdeas();
	}

	function saveEntry() {
		const amt = parseFloat(entryAmount) || 0;
		if (!entrySource || amt <= 0) { alert('Fill Source and Amount'); return; }
		const entry: Entry = { type: entryType, source: entrySource, description: entryDesc, amount: amt, frequency: entryFreq };
		const months = entryFreq === 'monthly' ? entryRecurMonths : 1;
		for (let i = 0; i < months; i++) {
			const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + i);
			const mk = getMonthKey(d);
			if (!financialData[mk]) financialData[mk] = { entries: [] };
			financialData[mk].entries.push({ ...entry });
		}
		financialData = { ...financialData }; save();
		showEntryModal = false; entrySource = ''; entryDesc = ''; entryAmount = ''; entryRecurMonths = 1;
	}

	function saveIdea() {
		if (!ideaTitle) { alert('Enter title'); return; }
		ideasData = [...ideasData, { category: ideaCat, title: ideaTitle, description: ideaDesc, estimate: ideaEst }];
		saveIdeas(); showIdeaModal = false; ideaTitle = ''; ideaDesc = ''; ideaEst = '';
	}

	function toggle(id: string) { collapsed = { ...collapsed, [id]: !collapsed[id] }; }
	const ideaIcons: Record<string,string> = { acquisition: '🎯', revenue: '💰', engagement: '🔥' };
</script>

<svelte:head><title>💰 Financials | Admin | CRC</title></svelte:head>
<div class="page-width">
	<p class="back"><a href="/admin">← Dashboard</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">Verifying access...</p></div>
	{:else if !authorized}
		<div class="center"><h2>🔒 Access Denied</h2><p class="muted">Super Admin privileges required.</p><a href="/" class="btn">Go Home</a></div>
	{:else}
		<div class="page-header">
			<span class="super-badge">🔒 Super Admin Only</span>
			<h1>💰 Financials</h1>
			<p class="muted">Track revenue, expenses, and service costs</p>
		</div>

		<!-- Month Selector -->
		<div class="card month-card">
			<div class="month-sel"><button class="btn btn--sm" onclick={prevMonth}>← Prev</button><span class="month-name">{getMonthName(currentMonth)}</span><button class="btn btn--sm" onclick={nextMonth}>Next →</button></div>
		</div>

		<!-- Summary Cards -->
		<div class="summary-grid">
			<div class="fin-card"><span class="fin-card__label">Monthly Revenue</span><span class="fin-card__val fin-card__val--green">${totalIncome.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">Monthly Expenses</span><span class="fin-card__val fin-card__val--red">${totalExpenses.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">Net Profit</span><span class="fin-card__val" style:color={netTotal >= 0 ? '#10b981' : '#ef4444'}>${netTotal.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">Premium Members</span><span class="fin-card__val">0</span></div>
		</div>

		<!-- Income/Expense Tracker -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('tracker')}>
				<h2>📒 Income / Expense Tracker</h2><span class="toggle-icon" class:rotated={collapsed['tracker']}>▼</span>
			</button>
			{#if !collapsed['tracker']}
				<div class="table-wrap">
					<table class="fin-table">
						<thead><tr><th>Type</th><th>Freq</th><th>Source</th><th>Description</th><th class="r">Income</th><th class="r">Expense</th><th class="c"><button class="btn btn--sm btn--primary" onclick={() => showEntryModal = true}>+ Add</button></th></tr></thead>
						<tbody>
							{#if entries.length === 0}
								<tr><td colspan="7" class="muted c">No entries yet</td></tr>
							{:else}
								{#each entries as e, i}
									<tr>
										<td><span class="type-badge type-{e.type}">{e.type === 'income' ? '📈 Income' : '📉 Expense'}</span></td>
										<td><span class="freq-badge">{e.frequency === 'yearly' ? '📅 Yearly' : e.frequency === 'once' ? '📌 Once' : '🔄 Monthly'}</span></td>
										<td>{e.source}</td><td>{e.description || '-'}</td>
										<td class="r {e.type === 'income' ? 'green' : ''}">{e.type === 'income' ? '$' + e.amount.toFixed(2) : '-'}</td>
										<td class="r {e.type === 'expense' ? 'red' : ''}">{e.type === 'expense' ? '$' + e.amount.toFixed(2) : '-'}</td>
										<td class="c"><button class="del-btn" onclick={() => deleteEntry(i)}>🗑️</button></td>
									</tr>
								{/each}
							{/if}
						</tbody>
						<tfoot><tr class="totals"><td colspan="4" class="r"><strong>Totals</strong></td><td class="r green">${totalIncome.toFixed(2)}</td><td class="r red">${totalExpenses.toFixed(2)}</td><td class="c">Net: <span style:color={netTotal >= 0 ? '#10b981' : '#ef4444'}>${netTotal.toFixed(2)}</span></td></tr></tfoot>
					</table>
				</div>
			{/if}
		</div>

		<!-- Monthly Overview -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('overview')}>
				<div style="display:flex;align-items:center;gap:1rem;flex:1">
					<h2>📊 Monthly Overview</h2>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="year-filter" onclick={(e) => e.stopPropagation()}>
						<label for="year-sel">Year:</label>
						<select id="year-sel" bind:value={selectedYear} class="form-input-sm">{#each years as y}<option value={String(y)}>{y}</option>{/each}</select>
					</div>
				</div>
				<span class="toggle-icon" class:rotated={collapsed['overview']}>▼</span>
			</button>
			{#if !collapsed['overview']}
				<table class="hist-table">
					<thead><tr><th><button class="sort-btn" onclick={() => sortAsc = !sortAsc}>Month {sortAsc ? '▲' : '▼'}</button></th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead>
					<tbody>
						{#if historyMonths.length === 0}
							<tr><td colspan="4" class="muted">No data for selected year</td></tr>
						{:else}
							{#each historyMonths as mk}
								{@const e = financialData[mk]?.entries || []}
								{@const inc = e.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0)}
								{@const exp = e.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0)}
								{@const net = inc - exp}
								{@const [y, m] = mk.split('-')}
								<tr>
									<td>{new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
									<td class="green">${inc.toFixed(2)}</td>
									<td class="red">${exp.toFixed(2)}</td>
									<td style:color={net >= 0 ? '#10b981' : '#ef4444'}>${net.toFixed(2)}</td>
								</tr>
							{/each}
						{/if}
					</tbody>
					<tfoot><tr class="totals"><td><strong>Total</strong></td><td class="green">${historyTotals.rev.toFixed(2)}</td><td class="red">${historyTotals.exp.toFixed(2)}</td><td style:color={historyTotals.net >= 0 ? '#10b981' : '#ef4444'}>${historyTotals.net.toFixed(2)}</td></tr></tfoot>
				</table>
			{/if}
		</div>

		<!-- Service Costs -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('services')}><h2>🔧 Service Cost Breakdown</h2><span class="toggle-icon" class:rotated={collapsed['services']}>▼</span></button>
			{#if !collapsed['services']}
				<p class="muted mb-2">Current costs for all services</p>
				<div class="service-grid">
					{#each services as s}
						<div class="service-card">
							<span class="service-icon">{s.icon}</span>
							<div class="service-info"><h4>{s.name}</h4><p class="muted">{s.desc}</p></div>
							<div class="service-cost"><span class="cost-amt">{s.cost}</span><span class="cost-mo">{s.monthly}</span></div>
							<span class="service-status">{s.status}</span>
						</div>
					{/each}
				</div>
				<div class="cost-summary mt-2"><strong>Current Monthly Cost:</strong> ~$1.67/month (~$20/year)</div>
			{/if}
		</div>

		<!-- Ideas -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('ideas')}><h2>💡 Future Ideas</h2><span class="toggle-icon" class:rotated={collapsed['ideas']}>▼</span></button>
			{#if !collapsed['ideas']}
				<p class="muted mb-2">Revenue streams and features to consider</p>
				<div class="ideas-grid">
					{#each ideasData as idea, i}
						<div class="idea-card">
							<button class="idea-del" onclick={() => deleteIdea(i)}>🗑️</button>
							<div class="idea-head"><span class="idea-title">{ideaIcons[idea.category] || '💡'} {idea.title}</span><span class="idea-cat idea-cat--{idea.category}">{idea.category}</span></div>
							{#if idea.description}<p class="idea-desc">{idea.description}</p>{/if}
							{#if idea.estimate}<span class="idea-est">Est: {idea.estimate}</span>{/if}
						</div>
					{/each}
				</div>
				<button class="btn btn--sm mt-2" onclick={() => showIdeaModal = true}>+ Add Idea</button>
			{/if}
		</div>

		<!-- Entry Modal -->
		{#if showEntryModal}
			<div class="modal-overlay" onclick={() => showEntryModal = false}>
				<div class="modal" onclick={(e) => e.stopPropagation()}>
					<div class="modal__header"><h2>Add Entry</h2><button class="modal__close" onclick={() => showEntryModal = false}>&times;</button></div>
					<div class="modal__body">
						<div class="fg"><label class="fl">Entry Type</label>
							<div class="toggle-row">
								<label class="toggle-opt"><input type="radio" name="et" value="income" bind:group={entryType} /><span class="toggle-btn toggle-btn--income">📈 Income</span></label>
								<label class="toggle-opt"><input type="radio" name="et" value="expense" bind:group={entryType} /><span class="toggle-btn toggle-btn--expense">📉 Expense</span></label>
							</div>
						</div>
						<div class="fg"><label class="fl">Frequency</label>
							<div class="freq-row">
								<label class="freq-opt"><input type="radio" name="ef" value="monthly" bind:group={entryFreq} /><span class="freq-btn">🔄 Monthly</span></label>
								<label class="freq-opt"><input type="radio" name="ef" value="yearly" bind:group={entryFreq} /><span class="freq-btn">📅 Yearly</span></label>
								<label class="freq-opt"><input type="radio" name="ef" value="once" bind:group={entryFreq} /><span class="freq-btn">📌 Once</span></label>
							</div>
						</div>
						{#if entryFreq === 'monthly'}
							<div class="fg"><label class="fl">Repeat for how many months?</label>
								<div style="display:flex;align-items:center;gap:0.75rem">
									<input type="number" bind:value={entryRecurMonths} min="1" max="24" class="form-input" style="width:80px;text-align:center" />
									<span class="muted" style="font-size:0.8rem">months (including this month)</span>
								</div>
							</div>
						{/if}
						<div class="fg"><label class="fl">Source / Service</label><input type="text" bind:value={entrySource} class="form-input" placeholder="e.g., Patreon" /></div>
						<div class="fg"><label class="fl">Description</label><input type="text" bind:value={entryDesc} class="form-input" placeholder="e.g., Monthly sub" /></div>
						<div class="fg"><label class="fl">Amount ($)</label><input type="number" bind:value={entryAmount} class="form-input" step="0.01" min="0" placeholder="0.00" /></div>
					</div>
					<div class="modal__footer"><button class="btn" onclick={() => showEntryModal = false}>Cancel</button><button class="btn btn--primary" onclick={saveEntry}>Save</button></div>
				</div>
			</div>
		{/if}

		<!-- Idea Modal -->
		{#if showIdeaModal}
			<div class="modal-overlay" onclick={() => showIdeaModal = false}>
				<div class="modal" onclick={(e) => e.stopPropagation()}>
					<div class="modal__header"><h2>Add Idea</h2><button class="modal__close" onclick={() => showIdeaModal = false}>&times;</button></div>
					<div class="modal__body">
						<div class="fg"><label class="fl">Category</label>
							<div class="freq-row">
								<label class="freq-opt"><input type="radio" name="ic" value="acquisition" bind:group={ideaCat} /><span class="freq-btn">🎯 Acquisition</span></label>
								<label class="freq-opt"><input type="radio" name="ic" value="revenue" bind:group={ideaCat} /><span class="freq-btn">💰 Revenue</span></label>
								<label class="freq-opt"><input type="radio" name="ic" value="engagement" bind:group={ideaCat} /><span class="freq-btn">🔥 Engagement</span></label>
							</div>
						</div>
						<div class="fg"><label class="fl">Title</label><input type="text" bind:value={ideaTitle} class="form-input" placeholder="e.g., Premium Memberships" /></div>
						<div class="fg"><label class="fl">Description</label><textarea bind:value={ideaDesc} class="form-input" rows="2" placeholder="Brief description..."></textarea></div>
						<div class="fg"><label class="fl">Estimate (optional)</label><input type="text" bind:value={ideaEst} class="form-input" placeholder="e.g., $5-10/mo per user" /></div>
					</div>
					<div class="modal__footer"><button class="btn" onclick={() => showIdeaModal = false}>Cancel</button><button class="btn btn--primary" onclick={saveIdea}>Save</button></div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.back { margin: 1rem 0 0.5rem; } .back a { color: var(--text-muted); text-decoration: none; } .back a:hover { color: var(--fg); }
	.center { text-align: center; padding: 4rem 0; }
	.spinner { width: 36px; height: 36px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; margin: 0 auto 1rem; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.btn { display: inline-block; padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 6px; color: var(--fg); background: transparent; cursor: pointer; font-size: 0.85rem; text-decoration: none; }
	.btn--sm { font-size: 0.8rem; padding: 0.3rem 0.75rem; }
	.mt-4 { margin-top: 1.5rem; } .mt-2 { margin-top: 1rem; } .mb-2 { margin-bottom: 1rem; }
	.super-badge { display: inline-block; background: #9b59b6; color: white; font-size: 0.75rem; font-weight: 600; padding: 0.25rem 0.75rem; border-radius: 4px; margin-bottom: 0.5rem; }
	.page-header { margin-bottom: 1.5rem; } .page-header h1 { margin-bottom: 0.25rem; }
	.month-card { margin-bottom: 1rem; }
	.month-sel { display: flex; align-items: center; justify-content: center; gap: 1.5rem; padding: 0.5rem; }
	.month-name { font-size: 1.25rem; font-weight: 600; min-width: 180px; text-align: center; }
	.summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
	@media (max-width: 900px) { .summary-grid { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 500px) { .summary-grid { grid-template-columns: 1fr; } }
	.fin-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; text-align: center; }
	.fin-card__label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase; }
	.fin-card__val { display: block; font-size: 1.75rem; font-weight: 700; }
	.fin-card__val--green { color: #10b981; } .fin-card__val--red { color: #ef4444; }
	.collapse-head { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 0.5rem 0; width: 100%; background: none; border: none; color: var(--fg); text-align: left; }
	.collapse-head h2 { margin: 0; flex: 1; }
	.toggle-icon { transition: transform 0.2s; display: inline-block; }
	.rotated { transform: rotate(-90deg); }
	.table-wrap { overflow-x: auto; }
	.fin-table { width: 100%; border-collapse: collapse; }
	.fin-table th, .fin-table td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.85rem; }
	.fin-table th { background: var(--bg); font-weight: 600; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
	.r { text-align: right; } .c { text-align: center; }
	.green { color: #10b981; font-weight: 600; } .red { color: #ef4444; font-weight: 600; }
	.totals td { background: var(--bg); border-top: 2px solid var(--border); font-weight: 600; padding: 0.75rem; }
	.type-badge { display: inline-block; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
	.type-income { background: rgba(16,185,129,0.15); color: #10b981; }
	.type-expense { background: rgba(239,68,68,0.15); color: #ef4444; }
	.freq-badge { display: inline-block; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.7rem; background: var(--surface); border: 1px solid var(--border); }
	.del-btn { background: transparent; border: none; cursor: pointer; opacity: 0.5; font-size: 0.9rem; } .del-btn:hover { opacity: 1; }
	.year-filter { display: flex; align-items: center; gap: 0.5rem; }
	.year-filter label { font-size: 0.85rem; color: var(--text-muted); }
	.form-input-sm { padding: 0.4rem 0.75rem; font-size: 0.85rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); }
	.hist-table { width: 100%; border-collapse: collapse; }
	.hist-table th, .hist-table td { padding: 0.6rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
	.hist-table th { background: var(--bg); font-weight: 600; font-size: 0.75rem; color: var(--text-muted); }
	.hist-table tfoot td { background: var(--bg); font-weight: 600; border-top: 2px solid var(--border); }
	.sort-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
	.sort-btn:hover { color: var(--accent); }
	.service-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
	.service-card { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; flex-wrap: wrap; }
	.service-icon { font-size: 1.5rem; } .service-info { flex: 1; min-width: 100px; } .service-info h4 { font-size: 0.9rem; margin: 0 0 0.15rem; } .service-info p { font-size: 0.75rem; margin: 0; }
	.service-cost { text-align: right; } .cost-amt { display: block; font-weight: 600; font-size: 0.9rem; } .cost-mo { display: block; font-size: 0.7rem; color: var(--text-muted); }
	.service-status { font-size: 0.65rem; font-weight: 600; padding: 0.2rem 0.4rem; border-radius: 4px; text-transform: uppercase; background: rgba(16,185,129,0.15); color: #10b981; }
	.cost-summary { padding: 0.75rem; background: var(--surface); border-radius: 6px; font-size: 0.9rem; }
	.ideas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
	.idea-card { padding: 1rem; padding-right: 2.5rem; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; position: relative; }
	.idea-del { position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; cursor: pointer; opacity: 0.7; font-size: 0.75rem; padding: 0.2rem 0.4rem; color: #ef4444; }
	.idea-del:hover { opacity: 1; }
	.idea-head { display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.idea-title { font-weight: 600; font-size: 0.95rem; flex: 1; }
	.idea-cat { font-size: 0.65rem; font-weight: 600; padding: 0.15rem 0.4rem; border-radius: 4px; text-transform: uppercase; }
	.idea-cat--acquisition { background: rgba(59,130,246,0.15); color: #3b82f6; }
	.idea-cat--revenue { background: rgba(16,185,129,0.15); color: #10b981; }
	.idea-cat--engagement { background: rgba(249,115,22,0.15); color: #f97316; }
	.idea-desc { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 0.5rem; }
	.idea-est { font-size: 0.75rem; font-weight: 600; color: var(--accent); }
	/* Modal */
	.modal-overlay { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); padding: 1rem; }
	.modal { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; width: 90%; max-width: 450px; max-height: 90vh; overflow-y: auto; }
	.modal__header { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border); }
	.modal__header h2 { margin: 0; font-size: 1.1rem; }
	.modal__close { background: transparent; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted); }
	.modal__body { padding: 1rem; }
	.modal__footer { display: flex; justify-content: flex-end; gap: 0.75rem; padding: 1rem; border-top: 1px solid var(--border); }
	.fg { margin-bottom: 1rem; }
	.fl { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.5rem; }
	.form-input { width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; box-sizing: border-box; }
	.form-input:focus { outline: none; border-color: var(--accent); }
	.toggle-row { display: flex; gap: 0.75rem; }
	.toggle-opt { flex: 1; cursor: pointer; } .toggle-opt input { display: none; }
	.toggle-btn { display: block; padding: 0.6rem; text-align: center; font-weight: 500; font-size: 0.9rem; border: 2px solid var(--border); border-radius: 6px; transition: all 0.15s; }
	.toggle-opt:has(input:checked) .toggle-btn--income { border-color: #10b981; background: rgba(16,185,129,0.1); color: #10b981; }
	.toggle-opt:has(input:checked) .toggle-btn--expense { border-color: #ef4444; background: rgba(239,68,68,0.1); color: #ef4444; }
	.freq-row { display: flex; gap: 0.5rem; }
	.freq-opt { flex: 1; cursor: pointer; } .freq-opt input { display: none; }
	.freq-btn { display: block; padding: 0.5rem; text-align: center; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; transition: all 0.15s; }
	.freq-opt:has(input:checked) .freq-btn { border-color: var(--accent); background: rgba(var(--accent-rgb, 0,255,136), 0.1); }
</style>
