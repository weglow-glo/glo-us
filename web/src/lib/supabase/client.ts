import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for Client Components / browser code.
 * Safe to use the anon key here — row-level security guards the data.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
