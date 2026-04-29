import { tavily } from '@tavily/core';

const NEWS_KEYWORDS = [
  'notícia', 'noticias', 'jornal', 'aconteceu', 'novidade', 'hoje', 'semana',
  'política', 'politica', 'chuva', 'tempo', 'clima', 'esporte', 'futebol',
  'televisão', 'televisao', 'globo', 'record', 'sbt', 'eleição', 'eleicao',
  'presidente', 'prefeito', 'governo', 'brasil',
];

/**
 * Returns true when the message seems to be asking for news or current events.
 * @param {string} message
 * @returns {boolean}
 */
export function detectsNewsIntent(message) {
  if (!message || message.length < 4) return false;
  const lower = message.toLowerCase();
  return NEWS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Searches for news via Tavily and returns a readable summary.
 * Never throws — returns null silently on any failure.
 * @param {string} query
 * @param {string} [userCity]
 * @returns {Promise<string|null>}
 */
export async function fetchNews(query = 'notícias do dia', userCity) {
  try {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const searchQuery = userCity ? `${query} ${userCity} Brasil` : `${query} Brasil`;

    const result = await client.search(searchQuery, {
      searchDepth: 'basic',
      maxResults: 3,
      includeAnswer: true,
      topic: 'news',
    });

    if (result.answer && result.answer.trim()) {
      return result.answer.trim();
    }

    const items = (result.results || [])
      .map((r) => `Título: ${r.title}\nResumo: ${r.content}`)
      .join('\n\n');

    return items || null;
  } catch (err) {
    console.error('[news] fetchNews', err.message);
    return null;
  }
}
