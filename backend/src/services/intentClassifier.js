import OpenAI from 'openai';
import getSupabase from '../lib/supabase.js';

let _openai = null;
const getClient = () => (_openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

const VALID = new Set(['LEMBRETE', 'CONFIRMACAO', 'CONVERSA']);

async function hasRecentReminder(userId) {
  try {
    const supabase = getSupabase();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('med_medication_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'sent')
      .gte('scheduled_at', twoHoursAgo)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (err) {
    console.error('[intent] hasRecentReminder', err.message);
    return false;
  }
}

export async function classifyIntent(user, content) {
  try {
    const hasPendingMedFlow = !!user.med_flow;
    const recent = await hasRecentReminder(user.id);

    const systemPrompt = `Você é um classificador de intenção de mensagens de idosos num chat com uma IA chamada Lina.

Contexto atual:
- Usuário tem cadastro de lembrete em andamento: ${hasPendingMedFlow}
- Usuário recebeu lembrete de remédio nas últimas 2 horas: ${recent}

Classifique a mensagem em EXATAMENTE uma categoria:

LEMBRETE — quando o usuário:
  - Quer criar um novo lembrete de remédio ou medicamento
  - Está respondendo uma pergunta da Lina sobre um lembrete em andamento
    (ex: informando horário ou dias quando perguntado)

CONFIRMACAO — quando o usuário:
  - Confirma que tomou um remédio (só válido se recebeu lembrete recente)
  - Diz que esqueceu de tomar (só válido se recebeu lembrete recente)
  - Diz que avisou alguém sobre o remédio (só válido se recebeu lembrete recente)

CONVERSA — qualquer outra coisa:
  - Muda de assunto
  - Faz pergunta sobre qualquer tema
  - Conta algo do dia
  - Responde de forma que não tem relação com lembrete ou confirmação

Responda APENAS com uma palavra: LEMBRETE, CONFIRMACAO ou CONVERSA`;

    const call = getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 10,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    });

    const timeout = new Promise((resolve) => setTimeout(() => resolve('__TIMEOUT__'), 2000));
    const result = await Promise.race([call, timeout]);

    if (result === '__TIMEOUT__') {
      console.warn('[intent] timeout — fallback CONVERSA');
      return 'CONVERSA';
    }

    const raw = (result.choices?.[0]?.message?.content || '').trim().toUpperCase();
    const word = raw.replace(/[^A-Z]/g, '');
    return VALID.has(word) ? word : 'CONVERSA';
  } catch (err) {
    console.error('[intent] erro classificação:', err.message);
    return 'CONVERSA';
  }
}
