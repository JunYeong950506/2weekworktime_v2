import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolvedSupabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';

const resolvedSupabaseAnonKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export default defineConfig({
    plugins: [react()],
    define: {
        __APP_SUPABASE_URL__: JSON.stringify(resolvedSupabaseUrl),
        __APP_SUPABASE_ANON_KEY__: JSON.stringify(resolvedSupabaseAnonKey),
    },
});
