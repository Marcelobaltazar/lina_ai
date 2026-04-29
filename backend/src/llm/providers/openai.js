import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * @param {string} systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 * @param {string} userContent
 * @param {object} cfg - { active_model, temperature, max_tokens }
 * @returns {Promise<{ text: string, usage: object }>}
 */
export async function complete(systemPrompt, history, userContent, cfg) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  const response = await client.chat.completions.create({
    model: cfg.active_model || 'gpt-4o-mini',
    temperature: cfg.temperature ?? 0.7,
    max_tokens: cfg.max_tokens || 1024,
    messages,
  });

  return {
    text: response.choices[0].message.content,
    usage: response.usage,
  };
}
