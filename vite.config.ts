import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Cloudflare のデプロイ処理が plugins 配列にプラグインを差し込むため、
  // 空でも明示しておかないと "could not find a valid plugins array" で失敗する。
  plugins: [],
  server: {
    open: true,
  },
});
