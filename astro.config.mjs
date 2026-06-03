import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  integrations: [
    react({
      exclude: [/\/src\/components\/QuadraticFortress\.tsx$/],
    }),
  ],
  vite: {
    optimizeDeps: {
      esbuildOptions: {
        define: {
          "process.env.NODE_ENV": '"development"',
        },
      },
    },
  },
});
