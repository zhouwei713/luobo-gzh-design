import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

type LocalApplication = { handle(req: IncomingMessage, res: ServerResponse): Promise<void>; close(): Promise<void> };

// Keep the existing OSS `npm run dev` entry connected to the local SQLite library.
export function localDiscoveryPlugin(options: { dataDir?: string } = {}): Plugin {
  return {
    name: 'local-discovery-library',
    apply: 'serve',
    configureServer(server) {
      let application: Promise<LocalApplication> | undefined;
      const backendRoot = resolve(server.config.root, '../server');
      server.watcher.add([resolve(backendRoot, 'discovery'), resolve(backendRoot, 'topics'), resolve(backendRoot, 'articles'), resolve(backendRoot, 'application.mjs')]);
      server.watcher.on('change', path => {
        if (path.startsWith(backendRoot) && /\.(mjs|sql)$/.test(path)) {
          const previous = application; application = undefined;
          void previous?.then(app => app.close()).catch(() => {});
        }
      });
      server.httpServer?.once('close', () => { void application?.then(app => app.close()); });
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url || '').split('?')[0];
        if (path !== '/upload' && !path.startsWith('/file/') && !path.startsWith('/api/discovery/') && path !== '/api/articles' && !path.startsWith('/api/articles/') && path !== '/api/topics' && !path.startsWith('/api/topics/') && !path.startsWith('/api/auth/') && !path.startsWith('/api/user/')) return next();
        const host = req.headers.host || '';
        if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '')) {
          res.writeHead(403).end(); return;
        }
        try {
          application ??= (async () => {
            const module = await server.ssrLoadModule(resolve(backendRoot, 'application.mjs'));
            return module.createApplication({
              dataDir: options.dataDir || process.env.GZH_LOCAL_DATA_DIR || resolve(server.config.root, '../server/data'), staticDir: resolve(server.config.root, 'dist'),
              publicUrl: `http://${host}`, config: {
                NODE_ENV: 'development', LOCAL_DISCOVERY_DEBUG: '1', ENABLE_PHASE2: server.config.env.VITE_ENABLE_PHASE2 === 'true' ? '1' : '0',
                ...(process.env.REDFOX_KEYWORD_COLLECTION === '1' ? {
                  REDFOX_KEYWORD_COLLECTION: '1', REDFOX_API_KEY: process.env.REDFOX_API_KEY,
                  REDFOX_DAILY_REQUEST_LIMIT: process.env.REDFOX_DAILY_REQUEST_LIMIT ?? '1',
                } : {}),
              },
            }) as Promise<LocalApplication>;
          })();
          await (await application).handle(req, res);
        } catch {
          res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: '本地文章库启动失败，请检查 Node.js 版本与 server 构建。' }));
        }
      });
    },
  };
}
