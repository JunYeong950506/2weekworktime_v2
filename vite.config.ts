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
  const supabaseUrl =
    env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    env.VITE_SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    env.SUPABASE_PUBLISHABLE_KEY ||
    '';
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
      __APP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __APP_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
      __APP_BUILD_ID__: JSON.stringify(buildId),
    },
  };
});
