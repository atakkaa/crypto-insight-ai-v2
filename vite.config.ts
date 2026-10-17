import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
    output: {
      dir: ".vercel/output",
      serverDir: ".vercel/output/functions/__server.func",
      publicDir: ".vercel/output/static",
    },
  },
  vite: {
    server: {
      port: 5173,
      strictPort: true,
      host: true,
    },
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
    assetsInclude: ["**/*.wasm"],
    plugins: [
      {
        name: "force-close",
        closeBundle() {
          setTimeout(() => process.exit(0), 0);
        },
      },
    ],
  },
});