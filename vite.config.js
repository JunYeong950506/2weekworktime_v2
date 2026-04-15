import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
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
    return {
        plugins: [react()],
        define: {
            __APP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
            __APP_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
        },
    };
});
