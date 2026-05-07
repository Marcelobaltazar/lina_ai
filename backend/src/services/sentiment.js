import { complete } from '../llm/providers/claude.js';

const CLASSIFY_SYSTEM = `Analise o sentimento da mensagem e responda APENAS com uma das tags:
[SENTIMENT:POSITIVO], [SENTIMENT:NEUTRO], [SENTIMENT:NEGATIVO], [SENTIMENT:ALERTA]
Use [SENTIMENT:ALERTA] quando detectar tristeza profunda, solidão extrema ou risco.`;

/**
 * Classifies sentiment of a user message (standalone call).
 * @param {string} text
 * @returns {Promise<string>} e.g. 'POSITIVO'
 */
export async function analyzeSentiment(text) {
  try {
    const { text: result } = await complete(CLASSIFY_SYSTEM, [], text, { max_tokens: 20 });
    const match = result.match(/\[SENTIMENT:(\w+)\]/);
    const sentiment = match ? match[1] : null;
    const map = {
      neutro: 'neutral', neutral: 'neutral',
      triste: 'sad', sad: 'sad',
      ansioso: 'anxious', anxious: 'anxious',
      feliz: 'happy', happy: 'happy',
      alerta: 'alert', alert: 'alert',
    };
    return map[sentiment?.toLowerCase()] || 'neutral';
  } catch (err) {
    console.error('[sentiment]', err);
    return 'neutral';
  }
}

/**
 * Parses the LLM response text produced by conversation.js.
 * The LLM is instructed to embed tags; this strips them and returns metadata.
 *
 * Expected internal tags (never shown to user):
 *   [SENTIMENT:POSITIVO|NEUTRO|NEGATIVO|ALERTA]
 *   [FLAG:RISCO_QUEDA|SOLIDAO|SAUDE|FAMILIA|...]   (optional)
 *
 * @param {string} raw - full LLM output
 * @returns {{ cleanText: string, sentiment: string, flagged: boolean, flagReason: string|null }}
 */
export function parseSentiment(raw) {
  let text = raw;

  const sentimentMatch = text.match(/\[SENTIMENT:([A-Z_]+)\]/);
  const sentiment = sentimentMatch ? sentimentMatch[1] : 'NEUTRO';

  const flagMatch = text.match(/\[FLAG:([^\]]+)\]/);
  const flagged = !!flagMatch;
  const flagReason = flagMatch ? flagMatch[1] : null;

  // Strip all internal tags before delivering to user
  const cleanText = text
    .replace(/\[SENTIMENT:[A-Z_]+\]/g, '')
    .replace(/\[FLAG:[^\]]+\]/g, '')
    .trim();

  return { cleanText, sentiment, flagged, flagReason };
}
