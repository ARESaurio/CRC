export function slugify(text: string): string {
	return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

export function addItem(list: any[], template: any): any[] {
	return [...list, deepClone(template)];
}

export function removeItem(list: any[], index: number): any[] {
	return list.filter((_, i) => i !== index);
}

export function moveItem(list: any[], from: number, to: number): any[] {
	if (to < 0 || to >= list.length) return list;
	const arr = [...list];
	const [item] = arr.splice(from, 1);
	arr.splice(to, 0, item);
	return arr;
}

export function fmtDate(d: string): string {
	if (!d) return '—';
	return new Date(d).toLocaleString('en-US', {
		month: 'short', day: 'numeric', year: 'numeric',
		hour: 'numeric', minute: '2-digit'
	});
}
