import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        privacy: resolve(__dirname, "privacy.html"),
        support: resolve(__dirname, "support.html"),
        "daily-practice": resolve(__dirname, "daily-practice.html"),
        "range-training": resolve(__dirname, "range-training.html"),
        "session-tracking": resolve(__dirname, "session-tracking.html"),
        404: resolve(__dirname, "404.html"),
      },
    },
  },
});
