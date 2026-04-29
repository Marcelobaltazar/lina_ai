import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * @param {string} systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} history
 * @param {string} userContent
 * @param {object} cfg - { active_model, temperature, max_tokens }
 * @returns {Promise<{ text: string, usage: object }>}
 */
export async function complete(systemPrompt, history, userContent, cfg) {
  const messages = [
    ...history,
    { role: 'user', content: userContent },
  ];

  const response = await client.messages.create({
    model: cfg.active_model || 'claude-sonnet-4-6',
    max_tokens: cfg.max_tokens || 1024,
    temperature: cfg.temperature ?? 0.7,
    system: systemPrompt,
    messages,
  });

  return {
    text: response.content[0].text,
    usage: response.usage,
  };
}
