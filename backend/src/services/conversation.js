import getSupabase from '../lib/supabase.js';
import { callLLM } from '../llm/router.js';
import { parseSentiment } from './sentiment.js';
import { fetchRelevantMemories } from './memory.js';

export async function processConversation(user, content, newsContext) {
  const supabase = getSupabase();

  const { data: llmCfg } = await supabase
    .from('cfg_llm_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  let systemPrompt = llmCfg?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const { data: profile } = await supabase
    .from('cus_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  systemPrompt = systemPrompt
    .replace('{{user.name}}', user.name || 'amigo(a)')
    .replace('{{user.city}}', user.city || '')
    .replace('{{profile.family_members}}', profile?.family_members || '')
    .replace('{{profile.health_notes}}', profile?.health_notes || '')
    .replace('{{profile.hobbies}}', profile?.hobbies || '')
    .replace('{{profile.life_stories}}', profile?.life_stories || '');

  const { data: history } = await supabase
    .from('msg_conversations')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(8);

  const historyMessages = (history || []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const memories = await fetchRelevantMemories(user.id, content);
  if (memories.length > 0) {
    systemPrompt +=
      `\n\nMEMÓRIAS RELEVANTES DE ${user.name || 'amigo(a)'} (use naturalmente só se fizer sentido):\n` +
      memories
        .map((m) => `- [${new Date(m.recorded_at).toLocaleDateString('pt-BR')}] ${m.content}. ${m.context || ''}`)
        .join('\n');
  }

  if (newsContext) {
    systemPrompt += `\n\n[CONTEXTO DE NOTÍCIAS RECENTES]: ${newsContext}`;
  }

  const { text: raw } = await callLLM(systemPrompt, historyMessages, content, llmCfg || {});

  // Detect city mention in user message and persist if not already set
  if (!user.city) {
    const cityMatch = content.match(/\b(?:em|aqui em|moro em|sou de|de)\s+([A-ZÀÁÂÃÉÊÍÓÔÕÚ][a-zàáâãéêíóôõú]+(?:\s+[A-ZÀÁÂÃÉÊÍÓÔÕÚ][a-zàáâãéêíóôõú]+)*)/);
    if (cityMatch) {
      const city = cityMatch[1];
      await getSupabase().from('cus_users').update({ city }).eq('id', user.id);
    }
  }

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
