import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  return (_client ??= createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
  ));
}

export { getClient };
export default getClient;
