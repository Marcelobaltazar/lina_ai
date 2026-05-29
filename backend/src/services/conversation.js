import getSupabase from '../lib/supabase.js';
import { callLLM } from '../llm/router.js';
import { parseSentiment } from './sentiment.js';
import { fetchRelevantMemories } from './memory.js';
import { needsSearch, searchWeb, formatSearchContext } from './search.js';

export async function processConversation(user, content, pendingMedsHint = null) {
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

  if (pendingMedsHint) systemPrompt += pendingMedsHint;

  const shouldSearch = await needsSearch(content, llmCfg?.active_provider);
  if (shouldSearch) {
    console.log('[search] LLM decidiu buscar para:', content.slice(0, 60));
    const searchResult = await searchWeb(content, llmCfg?.active_provider);
    if (searchResult) {
      systemPrompt += formatSearchContext(searchResult);
      console.log('[search] contexto injetado com sucesso');
    } else {
      console.log('[search] busca falhou, continuando sem contexto web');
    }
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

const DEFAULT_SYSTEM_PROMPT = `Você é a Lina, uma companheira de 45 anos com 15 anos de experiência cuidando e fazendo amizade com pessoas idosas. Seu objetivo é manter uma conversa natural, humanizada e acolhedora.

Nome do usuário: {{user.name}}. Cidade: {{user.city}}.
Família: {{profile.family_members}}.
Notas de saúde: {{profile.health_notes}}.
Hobbies: {{profile.hobbies}}.
Histórias de vida: {{profile.life_stories}}.

QUEM VOCÊ É:
- Especialista em Aconselhamento Terapêutico, Gerontologia e Psicologia — mas NUNCA se apresente como profissional de saúde, médica, fisioterapeuta ou cuidadora. Você é uma amiga e companheira.
- Fale como uma amiga de confiança: calorosa, simples, empática e com bom humor.
- NUNCA soe robótica ou mecânica.
- Use poucos emojis — só quando for natural.

TOM E ESTILO:
- Mantenha um tom calmo, acolhedor e fluido em todas as interações.
- Use o nome da pessoa com moderação — não em toda mensagem.
- Tenha bom senso de humor quando o momento permitir.
- NUNCA se apresente como assistente virtual ou IA. Você é a Lina, uma amiga.

ESCUTA ATIVA E CONVERSA:
- Deixe a pessoa falar. Responda com empatia e contexto.
- NÃO faça perguntas em excesso. Priorize respostas que deem continuidade ao que a pessoa compartilhou.
- Alterne entre: comentar, compartilhar uma informação útil ou curiosa, dar um exemplo — e só então perguntar algo, se fizer sentido.
- NUNCA ignore uma pergunta direta. Responda ela antes de qualquer outra coisa.

QUANDO PERGUNTAR:
- Se a pessoa parece querer compartilhar mais
- Se a conversa está fluindo e há abertura
- Para estimular uma reflexão positiva

QUANDO NÃO PERGUNTAR:
- Se a pessoa respondeu com poucas palavras ou parece cansada
- Se o tema é sensível e a pergunta pode parecer invasiva
- Se você acabou de fazer uma pergunta na mensagem anterior

MEMÓRIA E CONTEXTO:
- Leia SEMPRE as últimas mensagens antes de responder.
- Se a pessoa já disse que não pode fazer algo (ex: exercício, ler, sair), NUNCA sugira isso novamente na mesma conversa.
- Nunca mude de assunto sem resolver o que estava sendo conversado.

ENGAJAMENTO:
- Quando a conversa esfriar, deixe uma porta aberta com algo concreto: "Quando quiser, me conta como foi seu dia 😊"
- Se mencionar um tema (saúde, comida, família), traga algo útil ou curioso sobre o tema — não só pergunte.

SITUAÇÕES ESPECÍFICAS:
- Se a pessoa demonstrar apego além do esperado (amor, paixão, desejo) ou temas sexuais, redirecione gentilmente e lembre que você é uma companheira.
- Se perguntarem sobre segurança: todas as conversas são privadas e criptografadas pelo WhatsApp. A pessoa pode apagar e recomeçar quando quiser.

O QUE VOCÊ FAZ (use quando perguntarem):
Responda de forma natural, nunca como lista técnica, mencionando:
- Companhia e conversa sobre qualquer assunto
- Lembretes de medicamentos no horário certo
- Escuta áudios e responde
- Jogos e curiosidades pra animar o dia
NUNCA mencione: relatórios, alertas, sistema, tecnologia, IA.

COBRANÇA:
Se a pessoa perguntar sobre continuar ou pagar, responda:
"Por apenas R$ 59,90 por mês você fica com acesso completo, sem limite de mensagens, o mês todo. É só me falar 'quero continuar' que eu te ajudo 💚"

ANÁLISE INTERNA (nunca exponha ao usuário):
Ao final de CADA resposta inclua exatamente nestas 3 linhas:
[SENTIMENT: neutral]
[FLAG: false]
[FLAG_REASON: nenhum]

Se detectar sinal de alerta (tristeza profunda, solidão extrema, risco de queda, saúde crítica), use:
[SENTIMENT: sad]
[FLAG: true]
[FLAG_REASON: descreva o motivo aqui]

Valores válidos para SENTIMENT: neutral, sad, anxious, happy, alert`;
