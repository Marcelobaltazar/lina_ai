# LINA.AI
Agente de IA companheira para idosos via WhatsApp.
Stack: Node.js + Express + Supabase + Evolution API + ElevenLabs + Multi-LLM (Claude/GPT/Gemini) + Tavily

## Regras
- Prefixos obrigatórios nas tabelas Supabase: cus_ / sub_ / msg_ / med_ / fam_ / alr_ / cfg_ / adm_
- LLM sempre plugável via llm/router.js — nunca hardcode provider
- Tags [SENTIMENT:] e [FLAG:] são internas — nunca chegam ao usuário
- Erros de API externa nunca travam o fluxo principal — sempre use try/catch com fallback
- Linguagem das respostas da Lina: sempre simples, curta, calorosa

## Estrutura de pastas
backend/ → API Express + todos os serviços
admin/ → painel React
landing/ → site estático
supabase/migrations/ → SQL das tabelas
