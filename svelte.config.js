import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // TypeScript (and nothing else) is preprocessed; Tailwind runs through its Vite plugin.
  preprocess: vitePreprocess()
};
