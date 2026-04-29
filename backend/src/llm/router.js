import { supabase } from '../lib/supabase.js';
import { complete as claudeComplete } from './providers/claude.js';
import { complete as openaiComplete } from './providers/openai.js';
import { complete as geminiComplete } from './providers/gemini.js';

const providers = {
  claude: claudeComplete,
  openai: openaiComplete,
  gemini: geminiComplete,
};

/**
 * @param {string} systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 * @param {string} userContent
 * @param {object} [cfg] - { active_provider, active_model, temperature, max_tokens }
 *                         If omitted, fetched from cfg_llm_config in Supabase.
 * @returns {Promise<{ text: string, usage: object }>}
 */
export async function callLLM(systemPrompt, history, userContent, cfg) {
  // Resolve config from DB when not provided
  if (!cfg) {
    const { data } = await supabase
      .from('cfg_llm_config')
      .select('*')
      .limit(1)
      .maybeSingle();
    cfg = data || {};
  }

  const providerName = cfg.active_provider || 'claude';
  const fn = providers[providerName];

  if (!fn) {
    console.warn(`[llm/router] Unknown provider "${providerName}", falling back to claude`);
    return claudeComplete(systemPrompt, history, userContent, cfg);
  }

  try {
    return await fn(systemPrompt, history, userContent, cfg);
  } catch (err) {
    if (providerName !== 'claude') {
      console.warn(`[llm/router] Provider "${providerName}" failed, falling back to claude:`, err.message);
      return await claudeComplete(systemPrompt, history, userContent, cfg);
    }
    throw err;
  }
}
