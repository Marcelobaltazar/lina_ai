import OpenAI from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function complete(systemPrompt, history, userContent, cfg) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  const model = cfg.active_model || 'gpt-4o-mini';
  const isSearchModel = model.includes('search');

  const response = await getClient().chat.completions.create({
    model,
    max_tokens: cfg.max_tokens || 1024,
    messages,
    ...(!isSearchModel && { temperature: cfg.temperature ?? 0.7 }),
  });

  return { text: response.choices[0].message.content, usage: response.usage };
}
