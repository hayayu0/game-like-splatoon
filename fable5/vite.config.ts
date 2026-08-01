import { defineConfig, Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/** 開発時のみ: ページから POST された画像を qa/ に保存する（自動テスト用） */
function qaShots(): Plugin {
  return {
    name: 'qa-shots',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          try {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const name = (url.searchParams.get('name') ?? 'shot').replace(/[^a-zA-Z0-9_-]/g, '');
            const b64 = body.replace(/^data:image\/\w+;base64,/, '');
            const dir = path.resolve(process.cwd(), 'qa');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.from(b64, 'base64'));
            res.end('ok');
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [qaShots()],
});
