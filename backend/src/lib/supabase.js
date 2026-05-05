import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('[supabase] SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
    _client = createClient(url, key);
  }
  return _client;
}

export { getClient };
export default getClient;
