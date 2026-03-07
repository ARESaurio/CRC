import { guardAdminRoute } from '$lib/server/admin-guard';
export const load = guardAdminRoute('/admin/games');
