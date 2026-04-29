import Anthropic from '@anthropic-ai/sdk';

let _client = null;
const getClient = () => (_client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export async function complete(systemPrompt, history, userContent, cfg) {
  const messages = [...history, { role: 'user', content: userContent }];

  const response = await getClient().messages.create({
    model:       cfg.active_model || 'claude-sonnet-4-6',
    max_tokens:  cfg.max_tokens   || 1024,
    temperature: cfg.temperature  ?? 0.7,
    system:      systemPrompt,
    messages,
  });

  return { text: response.content[0].text, usage: response.usage };
}
