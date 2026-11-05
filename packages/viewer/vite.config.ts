import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { bundledNotices } from "../../scripts/third-party-notices.mjs";

// In development, /data and /api reach a running `archeion view --no-open`.
const cli = process.env.ARCHEION_CLI ?? "http://127.0.0.1:4173";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "bundled-third-party-notices",
      generateBundle(_options, bundle) {
        const modules = Object.values(bundle).flatMap((chunk) =>
          chunk.type === "chunk"
            ? Object.entries(chunk.modules)
                .filter(([, module]) => module.renderedLength > 0)
                .map(([id]) => id)
            : [],
        );
        this.emitFile({
          type: "asset",
          fileName: "THIRD_PARTY_LICENSES.txt",
          source: bundledNotices(modules),
        });
        this.emitFile({
          type: "asset",
          fileName: "THIRD_PARTY_NOTICES.md",
          source: readFileSync(new URL("../../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
        });
      },
    },
  ],
  base: "./",
  build: {
    chunkSizeWarningLimit: 2000,
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  worker: {
    format: "es",
    rolldownOptions: { output: { comments: { legal: true } } },
  },
  server: {
    proxy: {
      "/data": { target: cli, changeOrigin: true },
      "/api": { target: cli, changeOrigin: true },
    },
  },
});
