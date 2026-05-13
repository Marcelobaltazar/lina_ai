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
const SENTIMENT_MAP = {
  neutro: 'neutral', neutral: 'neutral',
  triste: 'sad', sad: 'sad',
  negativo: 'sad',
  ansioso: 'anxious', anxious: 'anxious',
  feliz: 'happy', happy: 'happy', positivo: 'happy',
  alerta: 'alert', alert: 'alert',
};

export function parseSentiment(raw) {
  const sentimentMatch = raw.match(/\[SENTIMENT:\s*([\w|]+)\]/i);
  const rawSentiment = sentimentMatch ? sentimentMatch[1].split('|')[0].toLowerCase() : 'neutral';
  const sentiment = SENTIMENT_MAP[rawSentiment] || 'neutral';

  const flagMatch = raw.match(/\[FLAG:\s*(true|false)\]/i);
  const flagged = flagMatch ? flagMatch[1].toLowerCase() === 'true' : false;

  const flagReasonMatch = raw.match(/\[FLAG_REASON:\s*(.+?)\]/i);
  const flagReason = flagReasonMatch ? flagReasonMatch[1].trim() : null;

  const cleanText = raw
    .replace(/\[SENTIMENT:.*?\]/gi, '')
    .replace(/\[FLAG_REASON:.*?\]/gi, '')
    .replace(/\[FLAG:.*?\]/gi, '')
    .replace(/\[SENTIMENT.*?\]/gi, '')
    .replace(/\[FLAG.*?\]/gi, '')
    .trim();

  return { cleanText, sentiment, flagged, flagReason };
}
