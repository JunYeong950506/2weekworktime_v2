import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function createAppVersionPlugin(payload: string): Plugin {
  return {
    name: 'app-version-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/app-version.json')) {
          next();
          return;
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: payload,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildId =
    env.VERCEL_GIT_COMMIT_SHA ||
    env.VITE_APP_BUILD_ID ||
    new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const appVersionPayload = JSON.stringify(
    {
      buildId,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  );

  return {
    plugins: [react(), createAppVersionPlugin(appVersionPayload)],
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
  };
});
