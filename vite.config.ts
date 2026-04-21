import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const base = process.env.VITE_BASE_PATH ?? "/";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticCopyTargets = [
  { src: "static/img/**/*", dest: "static", rename: { stripBase: 1 } },
  { src: "static/apple-touch-icon*", dest: "static", rename: { stripBase: 1 } },
  { src: "static/favicon.ico", dest: "static", rename: { stripBase: 1 } },
  { src: "json/*.json", dest: "json", rename: { stripBase: 1 } }
];

const cnameSource = process.env.VITE_CNAME_SOURCE;

if (cnameSource) {
  staticCopyTargets.push({ src: cnameSource, dest: "." });
}

export default defineConfig({
  base,
  plugins: [
    react(),
    viteStaticCopy({
      targets: staticCopyTargets
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    target: "es2020",
    emptyOutDir: true,
    cssMinify: false
  }
});
