import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://eliotieno.netlify.app',
  // Never inline small scripts or assets into the HTML: the content security policy in netlify.toml blocks
  // inline scripts, so an inlined one silently stops running on the live site.
  vite: { build: { assetsInlineLimit: 0 } },
});
