import { GoogleGenerativeAI } from '@google/generative-ai';

let _genAI = null;
const getGenAI = () => (_genAI ??= new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY));

export async function complete(systemPrompt, history, userContent, cfg) {
  const model = getGenAI().getGenerativeModel({
    model: cfg.active_model || 'gemini-2.0-flash',
    generationConfig: {
      temperature:     cfg.temperature ?? 0.7,
      maxOutputTokens: cfg.max_tokens  || 1024,
    },
  });

  const geminiHistory = history.map((m) => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat   = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(`${systemPrompt}\n\n${userContent}`);

  return { text: result.response.text(), usage: {} };
}
