import OpenAI from 'openai';
import getSupabase from '../lib/supabase.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const MATCH_THRESHOLD = 0.7;
const MATCH_COUNT = 5;

const getOpenAI = (() => {
  let c = null;
  return () => (c ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
})();

/**
 * Busca semântica na base de conhecimento (RAG sobre diabetes).
 * 1. Gera embedding da pergunta do usuário
 * 2. Chama a função match_knowledge no Supabase (pgvector)
 * 3. Retorna os chunks relevantes concatenados como string
 * 4. Se não achar nada (similarity < 0.7) ou der erro, retorna null
 *
 * Falha silenciosa: qualquer erro de OpenAI/Supabase retorna null,
 * a Lina segue respondendo pelo conhecimento geral.
 */
export async function searchKnowledge(query) {
  try {
    const embeddingRes = await getOpenAI().embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingRes.data?.[0]?.embedding;
    if (!queryEmbedding) return null;

    const { data, error } = await getSupabase().rpc('match_knowledge', {
      query_embedding: queryEmbedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });
    if (error) {
      console.error('[knowledge] match_knowledge falhou:', error.message);
      return null;
    }
    if (!data || data.length === 0) {
      console.log('[rag] nenhum chunk encontrado para:', query);
      return null;
    }

    const chunks = data.map((row) => row.content);
    console.log('[rag] chunks encontrados:', chunks.length, '| query:', query);
    return chunks.join('\n\n---\n\n');
  } catch (err) {
    console.error('[knowledge] searchKnowledge falhou:', err.message);
    return null;
  }
}
