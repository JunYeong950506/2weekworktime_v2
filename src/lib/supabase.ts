import { createClient, SupabaseClient } from '@supabase/supabase-js';

const fallbackSupabaseUrl =
  (typeof __APP_SUPABASE_URL__ === 'string' ? __APP_SUPABASE_URL__ : '').trim();
const fallbackSupabaseAnonKey =
  (typeof __APP_SUPABASE_ANON_KEY__ === 'string' ? __APP_SUPABASE_ANON_KEY__ : '').trim();

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || fallbackSupabaseUrl;
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || fallbackSupabaseAnonKey;

const missingVars: string[] = [];
if (!supabaseUrl) {
  missingVars.push('VITE_SUPABASE_URL/SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL');
}
if (!supabaseAnonKey) {
  missingVars.push('VITE_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

let client: SupabaseClient | null = null;
if (missingVars.length === 0) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function hasSupabaseEnv(): boolean {
  return missingVars.length === 0;
}

export function getSupabaseEnvError(): string | null {
  if (missingVars.length === 0) {
    return null;
  }

  return `Supabase environment variables are missing: ${missingVars.join(', ')}`;
}

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    throw new Error(getSupabaseEnvError() ?? 'Failed to initialize Supabase client.');
  }

  return client;
}
