import { sveltekit } from '@sveltejs/kit/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['url', 'cookie', 'baseLocale'],
			disableAsyncLocalStorage: true
		}),
		sveltekit()
	],
	optimizeDeps: {
		include: ['bits-ui']
	},
	css: {
		preprocessorOptions: {
			scss: {
				silenceDeprecations: ['import']
			}
		}
	}
});
