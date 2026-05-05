import getSupabase from '../lib/supabase.js';
import { callLLM } from '../llm/router.js';
import { parseSentiment } from './sentiment.js';

/**
 * Orchestrates an LLM turn for a given user.
 *
 * @param {object} user       - cus_users row
 * @param {string} content    - processed user message text
 * @param {string|null} newsContext
 * @returns {Promise<{ cleanText: string, sentiment: string, flagged: boolean, flagReason: string|null }>}
 */
export async function processConversation(user, content, newsContext) {
  // 1. LLM config
  const { data: llmCfg } = await getSupabase()
    .from('cfg_llm_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  let systemPrompt = llmCfg?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  // 2. User profile
  const { data: profile } = await getSupabase()
    .from('cus_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  // 3. Variable substitution in system prompt
  systemPrompt = systemPrompt
    .replace('{{user.name}}', user.name || 'amigo(a)')
    .replace('{{user.city}}', user.city || '')
    .replace('{{profile.family_members}}', profile?.family_members || '')
    .replace('{{profile.health_notes}}', profile?.health_notes || '')
    .replace('{{profile.hobbies}}', profile?.hobbies || '')
    .replace('{{profile.life_stories}}', profile?.life_stories || '');

  // 4. Conversation history (last 20 messages)
  const { data: history } = await getSupabase()
    .from('msg_conversations')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const historyMessages = (history || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // 5. News context appended to system prompt
  if (newsContext) {
    systemPrompt += `\n\n[CONTEXTO DE NOTÍCIAS RECENTES]: ${newsContext}`;
  }

  // 6. LLM call — router returns { text, usage }
  const { text: raw } = await callLLM(systemPrompt, historyMessages, content, llmCfg || {});

  // 7. Parse sentiment / flags
  return parseSentiment(raw);
}

const DEFAULT_SYSTEM_PROMPT = `Você é Lina, uma assistente de IA companheira para idosos via WhatsApp.
Nome do usuário: {{user.name}}. Cidade: {{user.city}}.
Família: {{profile.family_members}}.
Notas de saúde: {{profile.health_notes}}.
Hobbies: {{profile.hobbies}}.
Histórias de vida: {{profile.life_stories}}.

Regras:
- Linguagem sempre simples, curta e calorosa. Máximo 3 frases.
- Nunca use jargões técnicos.
- Ao final de CADA resposta, inclua internamente (sem mostrar ao usuário) a tag de sentimento:
  [SENTIMENT:POSITIVO] ou [SENTIMENT:NEUTRO] ou [SENTIMENT:NEGATIVO] ou [SENTIMENT:ALERTA]
- Use [SENTIMENT:ALERTA] para tristeza profunda, solidão extrema ou risco.
- Se detectar risco (queda, saúde crítica, isolamento severo), inclua também: [FLAG:motivo]
  Exemplos: [FLAG:RISCO_QUEDA], [FLAG:SAUDE], [FLAG:SOLIDAO]`;
