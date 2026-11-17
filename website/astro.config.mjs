// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://meroudhyog.com",
  vite: {
    // Tailwind v4 plugin ships its own bundled vite; types don't align with astro's copy
    // @ts-expect-error - plugin runtime is compatible, only duplicated vite types differ
    plugins: [tailwindcss()],
  },
});
