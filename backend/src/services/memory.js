import OpenAI from 'openai';
import getSupabase from '../lib/supabase.js';

let _openai = null;
const getClient = () => (_openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function extractAndSaveMemories(userId, recentMessages) {
  try {
    const response = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Analise estas mensagens e extraia fatos permanentes e relevantes sobre o usuário que merecem ser lembrados futuramente.
Para cada fato extraído, forneça:
- content: o fato em si (ex: 'Fez bolo de fubá com goiabada')
- context: contexto emocional e situacional (ex: 'Parecia animada, falou com carinho')
- relevance_tags: array de tags para busca futura (ex: ['culinária','humor_positivo','receitas'])
Responda APENAS em JSON válido, array de objetos, sem markdown.
Se não houver nada relevante, responda: []
Mensagens: ${JSON.stringify(recentMessages)}`,
        },
      ],
    });

    const raw = response.choices[0].message.content || '[]';
    let memories;
    try {
      memories = JSON.parse(raw);
    } catch {
      console.error('[memory] JSON inválido na extração:', raw);
      return;
    }

    if (!Array.isArray(memories) || memories.length === 0) return;

    const supabase = getSupabase();

    for (const mem of memories) {
      if (!mem.content) continue;
      const prefix = mem.content.slice(0, 20);

      const { data: existing } = await supabase
        .from('cus_memories')
        .select('id')
        .eq('user_id', userId)
        .ilike('content', `%${prefix}%`)
        .maybeSingle();

      if (existing) continue;

      await supabase.from('cus_memories').insert({
        user_id: userId,
        content: mem.content,
        context: mem.context || null,
        relevance_tags: mem.relevance_tags || [],
      });
    }
  } catch (err) {
    console.error('[memory] erro em extractAndSaveMemories:', err.message);
  }
}

export async function fetchRelevantMemories(userId, currentMessage) {
  try {
    const supabase = getSupabase();

    const { data: memories } = await supabase
      .from('cus_memories')
      .select('*')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(50);

    if (!memories || memories.length === 0) return [];

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));

    const rankPromise = getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: `O usuário disse: '${currentMessage}'
Quais destas memórias são relevantes para o contexto atual?
Retorne APENAS os IDs relevantes em JSON array: ["id1","id2"]
Se nenhuma for relevante, retorne: []
Memórias: ${JSON.stringify(memories.map((m) => ({
  id: m.id,
  content: m.content,
  context: m.context,
  tags: m.relevance_tags,
  quando: m.recorded_at,
})))}`,
        },
      ],
    });

    const response = await Promise.race([rankPromise, timeoutPromise]);
    if (!response) return [];

    const raw = response.choices[0].message.content || '[]';
    let relevantIds;
    try {
      relevantIds = JSON.parse(raw);
    } catch {
      return [];
    }

    if (!Array.isArray(relevantIds) || relevantIds.length === 0) return [];

    return memories
      .filter((m) => relevantIds.includes(m.id))
      .slice(0, 5);
  } catch (err) {
    console.error('[memory] erro em fetchRelevantMemories:', err.message);
    return [];
  }
}
