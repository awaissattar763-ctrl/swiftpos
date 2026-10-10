import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * True only when real credentials are baked in at build time.
 * The static build must succeed WITHOUT credentials, so the app renders a
 * setup notice instead of crashing when they are absent.
 */
export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('placeholder') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('placeholder')
  );
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      isSupabaseConfigured() ? SUPABASE_URL : 'https://placeholder.supabase.co',
      isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'placeholder-anon-key-for-build',
    );
  }
  return client;
}

/** A fetch failure (no response) means we are offline — queue instead of erroring. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|networkerror|network request failed|load failed/i.test(msg);
}
