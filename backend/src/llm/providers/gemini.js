import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

/**
 * @param {string} systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 * @param {string} userContent
 * @param {object} cfg - { active_model, temperature, max_tokens }
 * @returns {Promise<{ text: string, usage: {} }>}
 */
export async function complete(systemPrompt, history, userContent, cfg) {
  const model = genAI.getGenerativeModel({
    model: cfg.active_model || 'gemini-2.0-flash',
    generationConfig: {
      temperature: cfg.temperature ?? 0.7,
      maxOutputTokens: cfg.max_tokens || 1024,
    },
  });

  // Convert history to Gemini format; 'assistant' → 'model'
  const geminiHistory = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history: geminiHistory });

  // Prepend system prompt to the user turn (Gemini has no dedicated system role in startChat)
  const result = await chat.sendMessage(`${systemPrompt}\n\n${userContent}`);

  return {
    text: result.response.text(),
    usage: {},
  };
}
