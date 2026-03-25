<script lang="ts">
	import { onMount } from 'svelte';
	import { session, isLoading } from '$stores/auth';
	import { goto } from '$app/navigation';
	import { checkAdminRole } from '$lib/admin';
	import { localizeHref } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';
	import { Lock, Plus, TrendingUp, TrendingDown, RefreshCw, Calendar, Pin, Target, DollarSign, Lightbulb, Trash2 } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.js';
	import * as Button from '$components/ui/button/index.js';
	import * as Select from '$components/ui/select/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

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

	// ── Confirm dialog ────────────────────────────────────────────────────────
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmDesc = $state('');
	let confirmCallback = $state<(() => void) | null>(null);
	function openConfirm(title: string, desc: string, cb: () => void) {
		confirmTitle = title; confirmDesc = desc; confirmCallback = cb; confirmOpen = true;
	}
	function handleConfirmAction() {
		confirmOpen = false;
		if (confirmCallback) confirmCallback();
		confirmCallback = null;
	}

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
		openConfirm('Delete Entry', 'Delete this entry?', () => {
			financialData[monthKey].entries.splice(i, 1);
			financialData = { ...financialData }; save();
		});
	}
	function deleteIdea(i: number) {
		openConfirm('Delete Idea', 'Delete this idea?', () => {
			ideasData.splice(i, 1);
			ideasData = [...ideasData]; saveIdeas();
		});
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

<svelte:head><title>{m.admin_finance_title()}</title></svelte:head>
<div class="page-width">
	<p class="back"><a href={localizeHref("/admin")}>← {m.admin_dashboard()}</a></p>
	{#if checking || $isLoading}
		<div class="center"><div class="spinner"></div><p class="muted">{m.admin_verifying_access()}</p></div>
	{:else if !authorized}
		<div class="center"><h2><Lock size={20} style="display:inline-block;vertical-align:-0.125em;" /> {m.admin_access_denied()}</h2><p class="muted">{m.admin_super_required()}</p><a href={localizeHref("/")} class="btn">{m.error_go_home()}</a></div>
	{:else}
		<div class="page-header">
			<span class="super-badge">🔒 Super Admin Only</span>
			<h1>{m.admin_finance_heading()}</h1>
			<p class="muted">{m.admin_finance_track_desc()}</p>
		</div>

		<!-- Month Selector -->
		<div class="card month-card">
			<div class="month-sel"><Button.Root size="sm" onclick={prevMonth}>← Prev</Button.Root><span class="month-name">{getMonthName(currentMonth)}</span><Button.Root size="sm" onclick={nextMonth}>{m.admin_users_next()}</Button.Root></div>
		</div>

		<!-- Summary Cards -->
		<div class="summary-grid">
			<div class="fin-card"><span class="fin-card__label">{m.admin_finance_revenue()}</span><span class="fin-card__val fin-card__val--green">${totalIncome.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">{m.admin_finance_monthly_expense()}</span><span class="fin-card__val fin-card__val--red">${totalExpenses.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">{m.admin_finance_net_profit()}</span><span class="fin-card__val" style:color={netTotal >= 0 ? '#10b981' : '#ef4444'}>${netTotal.toFixed(2)}</span></div>
			<div class="fin-card"><span class="fin-card__label">{m.admin_finance_premium()}</span><span class="fin-card__val">0</span></div>
		</div>

		<!-- Income/Expense Tracker -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('tracker')}>
				<h2>{m.admin_finance_tracker()}</h2><span class="toggle-icon" class:rotated={collapsed['tracker']}>▼</span>
			</button>
			{#if !collapsed['tracker']}
				<div class="table-wrap">
					<table class="fin-table">
						<thead><tr><th>{m.admin_type()}</th><th>{m.admin_finance_freq()}</th><th>{m.admin_finance_source_short()}</th><th>{m.admin_finance_description()}</th><th class="r">{m.admin_finance_income_label()}</th><th class="r">{m.admin_finance_expense_label()}</th><th class="c"><Button.Root variant="accent" size="sm" onclick={() => showEntryModal = true}>+ Add</Button.Root></th></tr></thead>
						<tbody>
							{#if entries.length === 0}
								<tr><td colspan="7" class="muted c">{m.admin_finance_no_entries()}</td></tr>
							{:else}
								{#each entries as e, i}
									<tr>
										<td><span class="type-badge type-{e.type}">{e.type === 'income' ? 'Income' : 'Expense'}</span></td>
										<td><span class="freq-badge">{e.frequency === 'yearly' ? 'Yearly' : e.frequency === 'once' ? 'Once' : 'Monthly'}</span></td>
										<td>{e.source}</td><td>{e.description || '-'}</td>
										<td class="r {e.type === 'income' ? 'green' : ''}">{e.type === 'income' ? '$' + e.amount.toFixed(2) : '-'}</td>
										<td class="r {e.type === 'expense' ? 'red' : ''}">{e.type === 'expense' ? '$' + e.amount.toFixed(2) : '-'}</td>
										<td class="c"><button class="del-btn" onclick={() => deleteEntry(i)}>🗑️</button></td>
									</tr>
								{/each}
							{/if}
						</tbody>
						<tfoot><tr class="totals"><td colspan="4" class="r"><strong>{m.admin_finance_totals()}</strong></td><td class="r green">${totalIncome.toFixed(2)}</td><td class="r red">${totalExpenses.toFixed(2)}</td><td class="c">{m.admin_finance_net_label()} <span style:color={netTotal >= 0 ? '#10b981' : '#ef4444'}>${netTotal.toFixed(2)}</span></td></tr></tfoot>
					</table>
				</div>
			{/if}
		</div>

		<!-- Monthly Overview -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('overview')}>
				<div style="display:flex;align-items:center;gap:1rem;flex:1">
					<h2>{m.admin_finance_monthly()}</h2>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="year-filter" onclick={(e) => e.stopPropagation()}>
						<label>{m.admin_finance_year()}</label>
						<Select.Root bind:value={selectedYear}>
							<Select.Trigger>{selectedYear}</Select.Trigger>
							<Select.Content>
								{#each years as y}
									<Select.Item value={String(y)} label={String(y)} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
				<span class="toggle-icon" class:rotated={collapsed['overview']}>▼</span>
			</button>
			{#if !collapsed['overview']}
				<table class="hist-table">
					<thead><tr><th><button class="sort-btn" onclick={() => sortAsc = !sortAsc}>Month {sortAsc ? '▲' : '▼'}</button></th><th>{m.admin_finance_revenue_label()}</th><th>{m.admin_finance_expenses_label()}</th><th>{m.admin_finance_net_label()}</th></tr></thead>
					<tbody>
						{#if historyMonths.length === 0}
							<tr><td colspan="4" class="muted">{m.admin_finance_no_data()}</td></tr>
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
					<tfoot><tr class="totals"><td><strong>{m.admin_finance_total()}</strong></td><td class="green">${historyTotals.rev.toFixed(2)}</td><td class="red">${historyTotals.exp.toFixed(2)}</td><td style:color={historyTotals.net >= 0 ? '#10b981' : '#ef4444'}>${historyTotals.net.toFixed(2)}</td></tr></tfoot>
				</table>
			{/if}
		</div>

		<!-- Service Costs -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('services')}><h2>{m.admin_finance_services()}</h2><span class="toggle-icon" class:rotated={collapsed['services']}>▼</span></button>
			{#if !collapsed['services']}
				<p class="muted mb-2">{m.admin_finance_services_desc()}</p>
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
				<div class="cost-summary mt-2"><strong>{m.admin_finance_current_cost()}</strong> ~$1.67/month (~$20/year)</div>
			{/if}
		</div>

		<!-- Ideas -->
		<div class="card mt-4">
			<button class="collapse-head" onclick={() => toggle('ideas')}><h2>{m.admin_finance_ideas()}</h2><span class="toggle-icon" class:rotated={collapsed['ideas']}>▼</span></button>
			{#if !collapsed['ideas']}
				<p class="muted mb-2">{m.admin_finance_ideas_desc()}</p>
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
				<Button.Root size="sm" class="mt-2" onclick={() => showIdeaModal = true}><Plus size={14} /> Add Idea</Button.Root>
			{/if}
		</div>

		<!-- Entry Modal -->
		<Dialog.Root open={showEntryModal} onOpenChange={(o: boolean) => { if (!o) showEntryModal = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_finance_add_entry()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<div class="fg"><label class="fl">{m.admin_finance_entry_type()}</label>
						<ToggleGroup.Root class="toggle-row" bind:value={entryType}>
							<ToggleGroup.Item value="income" class="toggle-btn--income">Income</ToggleGroup.Item>
							<ToggleGroup.Item value="expense" class="toggle-btn--expense">Expense</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="fg"><label class="fl">{m.admin_finance_frequency()}</label>
						<ToggleGroup.Root class="freq-row" bind:value={entryFreq}>
							<ToggleGroup.Item value="monthly">Monthly</ToggleGroup.Item>
							<ToggleGroup.Item value="yearly">Yearly</ToggleGroup.Item>
							<ToggleGroup.Item value="once">Once</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					{#if entryFreq === 'monthly'}
						<div class="fg"><label class="fl">{m.admin_finance_repeat()}</label>
							<div style="display:flex;align-items:center;gap:0.75rem">
								<input type="number" bind:value={entryRecurMonths} min="1" max="24" class="form-input" style="width:80px;text-align:center" />
								<span class="muted" style="font-size:0.8rem">months (including this month)</span>
							</div>
						</div>
					{/if}
					<div class="fg"><label class="fl">{m.admin_finance_source()}</label><input type="text" bind:value={entrySource} class="form-input" placeholder="e.g., Patreon" /></div>
					<div class="fg"><label class="fl">{m.admin_finance_description()}</label><input type="text" bind:value={entryDesc} class="form-input" placeholder="e.g., Monthly sub" /></div>
					<div class="fg"><label class="fl">{m.admin_finance_amount()}</label><input type="number" bind:value={entryAmount} class="form-input" step="0.01" min="0" placeholder="0.00" /></div>
				</div>
				<Dialog.Footer>
					<Button.Root onclick={() => showEntryModal = false}>{m.admin_cancel()}</Button.Root>
					<Button.Root variant="accent" onclick={saveEntry}>{m.admin_finance_save()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>

		<!-- Idea Modal -->
		<Dialog.Root open={showIdeaModal} onOpenChange={(o: boolean) => { if (!o) showIdeaModal = false; }}>
			<Dialog.Overlay />
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>{m.admin_finance_add_idea()}</Dialog.Title>
					<Dialog.Close>&times;</Dialog.Close>
				</Dialog.Header>
				<div class="modal__body">
					<div class="fg"><label class="fl">{m.admin_finance_category()}</label>
						<ToggleGroup.Root class="freq-row" bind:value={ideaCat}>
							<ToggleGroup.Item value="acquisition">Acquisition</ToggleGroup.Item>
							<ToggleGroup.Item value="revenue">Revenue</ToggleGroup.Item>
							<ToggleGroup.Item value="engagement">Engagement</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="fg"><label class="fl">{m.admin_finance_title_field()}</label><input type="text" bind:value={ideaTitle} class="form-input" placeholder="e.g., Premium Memberships" /></div>
					<div class="fg"><label class="fl">{m.admin_finance_description()}</label><textarea bind:value={ideaDesc} class="form-input" rows="2" placeholder="Brief description..."></textarea></div>
					<div class="fg"><label class="fl">{m.admin_finance_estimate()}</label><input type="text" bind:value={ideaEst} class="form-input" placeholder="e.g., $5-10/mo per user" /></div>
				</div>
				<Dialog.Footer>
					<Button.Root onclick={() => showIdeaModal = false}>{m.admin_cancel()}</Button.Root>
					<Button.Root variant="accent" onclick={saveIdea}>{m.admin_finance_save()}</Button.Root>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}

	<AlertDialog.Root bind:open={confirmOpen}>
		<AlertDialog.Overlay />
		<AlertDialog.Content>
			<AlertDialog.Title>{confirmTitle}</AlertDialog.Title>
			<AlertDialog.Description>{confirmDesc}</AlertDialog.Description>
			<div class="alert-dialog-actions">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action class="btn btn--danger" onclick={handleConfirmAction}>Delete</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Root>
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
	.modal__body { padding: 1rem; }
	.fg { margin-bottom: 1rem; }
	.fl { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.5rem; }
	.form-input { width: 100%; padding: 0.6rem 0.75rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--fg); font-size: 0.9rem; box-sizing: border-box; }
	.form-input:focus { outline: none; border-color: var(--accent); }
	:global(.toggle-row.ui-toggle-group) { display: flex; gap: 0.75rem; border: none; overflow: visible; }
	:global(.toggle-row .ui-toggle-group-item) { flex: 1; padding: 0.6rem; text-align: center; font-weight: 500; font-size: 0.9rem; border: 2px solid var(--border); border-radius: 6px; transition: all 0.15s; background: var(--bg); color: var(--fg); }
	:global(.toggle-row .ui-toggle-group-item[data-state="on"].toggle-btn--income) { border-color: #10b981; background: rgba(16,185,129,0.1); color: #10b981; }
	:global(.toggle-row .ui-toggle-group-item[data-state="on"].toggle-btn--expense) { border-color: #ef4444; background: rgba(239,68,68,0.1); color: #ef4444; }
	:global(.freq-row.ui-toggle-group) { display: flex; gap: 0.5rem; border: none; overflow: visible; }
	:global(.freq-row .ui-toggle-group-item) { flex: 1; padding: 0.5rem; text-align: center; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; transition: all 0.15s; background: var(--bg); color: var(--fg); }
	:global(.freq-row .ui-toggle-group-item[data-state="on"]) { border-color: var(--accent); background: rgba(var(--accent-rgb, 0,255,136), 0.1); }
</style>
