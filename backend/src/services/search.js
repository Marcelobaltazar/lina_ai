import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

const getAnthropic = (() => {
  let c = null;
  return () => (c ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));
})();

const getOpenAI = (() => {
  let c = null;
  return () => (c ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
})();

const getGenAI = (() => {
  let c = null;
  return () => (c ??= new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY));
})();

const DECISION_PROMPT = (message) =>
  `O usuário disse: '${message}'
Ele precisa de informação atualizada da internet para ser respondido corretamente?
Considere que NÃO precisa de busca quando: é relato pessoal, conversa cotidiana, pergunta sobre sentimentos, receitas conhecidas, conselhos gerais.
Considere que SIM precisa de busca quando: pergunta sobre preços, cotações, clima, previsão do tempo, notícias, resultados de jogos, eventos recentes, informações que mudam com o tempo.
Responda APENAS com uma palavra: SIM ou NÃO`;

export async function needsSearch(message, provider) {
  const prompt = DECISION_PROMPT(message);
  try {
    const decisionPromise = (async () => {
      if (provider === 'openai') {
        const res = await getOpenAI().chat.completions.create({
          model: 'gpt-4o-mini',
          max_tokens: 5,
          messages: [{ role: 'user', content: prompt }],
        });
        return res.choices[0].message.content;
      }

      if (provider === 'gemini') {
        const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
        const res = await model.generateContent(prompt);
        return res.response.text();
      }

      // claude (default)
      const res = await getAnthropic().messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 5,
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content[0].text;
    })();

    const timeout = new Promise((resolve) => setTimeout(() => resolve('NÃO'), 3000));
    const answer = await Promise.race([decisionPromise, timeout]);
    return answer.includes('SIM');
  } catch (err) {
    console.error('[search] needsSearch falhou:', err.message);
    return false;
  }
}

export async function searchWeb(query, provider) {
  try {
    if (provider === 'openai') {
      const res = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-search-preview',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Busque informações atuais sobre: ' + query }],
      });
      return res.choices[0].message.content;
    }

    if (provider === 'gemini') {
      const model = getGenAI().getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ googleSearch: {} }],
      });
      const res = await model.generateContent('Busque informações atuais sobre: ' + query);
      return res.response.text();
    }
  } catch (err) {
    console.error(`[search] busca via ${provider} falhou, tentando Tavily:`, err.message);
  }

  // fallback: Tavily
  try {
    const { fetchNews } = await import('./news.js');
    return await fetchNews(query, null);
  } catch (err) {
    console.error('[search] Tavily fallback falhou:', err.message);
    return null;
  }
}

export function formatSearchContext(searchResult) {
  return '\n\n[CONTEXTO ATUALIZADO DA INTERNET - use naturalmente na resposta]:\n' + searchResult;
}
