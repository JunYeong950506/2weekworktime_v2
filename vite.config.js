import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
function createAppVersionPlugin(payload) {
    return {
        name: 'app-version-manifest',
        configureServer: function (server) {
            server.middlewares.use(function (req, res, next) {
                var _a;
                if (!((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith('/app-version.json'))) {
                    next();
                    return;
                }
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(payload);
            });
        },
        generateBundle: function () {
            this.emitFile({
                type: 'asset',
                fileName: 'app-version.json',
                source: payload,
            });
        },
    };
}
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, process.cwd(), '');
    var supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
    var supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY ||
        env.SUPABASE_ANON_KEY ||
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        env.SUPABASE_PUBLISHABLE_KEY ||
        '';
    var buildId = env.VERCEL_GIT_COMMIT_SHA ||
        env.VITE_APP_BUILD_ID ||
        new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    var appVersionPayload = JSON.stringify({
        buildId: buildId,
        generatedAt: new Date().toISOString(),
    }, null, 2);
    return {
        plugins: [react(), createAppVersionPlugin(appVersionPayload)],
        define: {
            __APP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
            __APP_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
            __APP_BUILD_ID__: JSON.stringify(buildId),
        },
    };
});
