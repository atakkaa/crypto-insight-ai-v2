import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // TanStack Start'ın sunucu girişini src/server.ts dosyasına yönlendir
    server: { entry: "server" },
  },
  // Nitro'nun Vercel için doğru çıktıyı (.vercel/output) üretmesini sağla
  nitro: {
    preset: "vercel",
  },
  vite: {
    server: {
      port: 5173,
      strictPort: true,
      host: true,
    },
    // ONNX Runtime Web için optimizasyon ayarları
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
    // WASM dosyalarının doğru yüklenmesi için
    assetsInclude: ["**/*.wasm"],
    // Vercel build sürecinin takılmasını önlemek için süreci zorla kapat
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