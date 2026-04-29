import { createClient } from '@supabase/supabase-js';

// Lazy singleton — defers creation until first use so the process can start
// without SUPABASE_URL set (useful for local dev without .env populated).
let _client = null;

export function getSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
    );
  }
  return _client;
}

// Named export kept for backwards compatibility with all existing imports.
export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getSupabase()[prop];
  },
});
