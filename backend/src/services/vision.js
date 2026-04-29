import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK = 'Não consegui ver a imagem direito, mas pode me contar o que é? 😊';

const PROMPT =
  'Descreva o que está nesta imagem de forma clara e simples. ' +
  'Se for um documento, receita médica ou exame, leia o conteúdo principal. ' +
  'Se for uma planta ou animal, identifique e dê informações úteis. ' +
  'Se for uma foto de pessoas, descreva a cena com carinho. ' +
  'Responda em português brasileiro de forma acolhedora, como se estivesse explicando para um idoso.';

function detectMediaType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('png')) return 'image/png';
  if (lower.includes('jpg') || lower.includes('jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

/**
 * Downloads image from mediaUrl and describes it using Claude vision.
 * @param {string} mediaUrl
 * @returns {Promise<string>}
 */
export async function analyzeImage(mediaUrl) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });

    const base64 = Buffer.from(response.data).toString('base64');
    const mediaType = detectMediaType(mediaUrl);

    const result = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: PROMPT,
          },
        ],
      }],
    });

    return result.content[0].text;
  } catch (err) {
    console.error('[vision] analyzeImage', err.message);
    return FALLBACK;
  }
}
