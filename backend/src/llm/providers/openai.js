import OpenAI from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function complete(systemPrompt, history, userContent, cfg) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userContent },
  ];

  const response = await getClient().chat.completions.create({
    model:       cfg.active_model || 'gpt-4o-mini',
    temperature: cfg.temperature  ?? 0.7,
    max_tokens:  cfg.max_tokens   || 1024,
    messages,
  });

  return { text: response.choices[0].message.content, usage: response.usage };
}
