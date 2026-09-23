import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: "build",
      assets: "build",
      fallback: null,
      precompress: false,
      strict: false,
    }),
    prerender: {
      handleUnseenRoutes: "warn",
      handleHttpError: ({ path, referrer, message }) => {
        // Ignore 404s for lighthouse JSON files during prerender
        if (path.includes("/lighthouse/") && path.endsWith(".json")) {
          console.warn(`Ignoring 404 for ${path}`);
          return;
        }
        // Throw error for other cases
        throw new Error(message);
      },
    },
  },
};

export default config;
