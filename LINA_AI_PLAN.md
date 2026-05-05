# 🌿 LINA.AI — PLANO MESTRE DO PROJETO
> Documento de referência completo para desenvolvimento com Claude Code
> Versão: 1.0 | Autor: Marcelo Baltazar

---

## 📌 VISÃO GERAL DO PRODUTO

**Lina.ai** é uma agente de IA companheira para adultos 50+ e idosos, operando 100% pelo **WhatsApp**. Ela conversa por texto e áudio, lê imagens, lembra remédios, aprende sobre o usuário ao longo do tempo e envia relatórios semanais para familiares.

**Tagline:** *"Companhia 24h para quem você ama. Simples como mandar uma mensagem."*

**Público primário:** Filhos/cuidadores (25–45 anos) que contratam para os pais  
**Usuário final:** Idosos 60+ que já usam WhatsApp

---

## 🏗️ ARQUITETURA GERAL

```
WhatsApp (usuário)
    ↓ webhook
Evolution API (recebe mensagem: texto / áudio / imagem)
    ↓
Backend Node.js (Express)
    ├── Identifica usuário pelo número (Supabase)
    ├── Busca histórico + perfil + memória (Supabase)
    ├── Se áudio → Whisper API (transcrição)
    ├── Se imagem → Claude Vision (análise)
    ├── Se contexto pede notícias → Tavily API (notícias BR + locais por cidade)
    ├── Chama LLM ativo (Claude / GPT / Gemini — configurável no Admin)
    ├── Gera resposta em texto
    ├── Se modo áudio → ElevenLabs TTS → gera .ogg
    └── Evolution API (envia resposta de volta)
    
Cron Jobs (node-cron)
    ├── Lembretes de medicamentos (horários configurados por usuário)
    ├── "Oi, sumida!" — reengajamento após X dias sem conversa (via SMS fallback)
    └── Relatório semanal → e-mail para familiar (Resend)

Admin Panel (Next.js ou React + Supabase)
    ├── Gerenciar usuários
    ├── Trocar modelo de LLM ativo
    ├── Editar system prompt da Lina
    ├── Ver alertas de bem-estar
    └── Gerenciar assinaturas

Landing Page (Next.js ou HTML estático)
    └── CTA → Inicia conversa no WhatsApp + formulário de cadastro
```

---

## 🗄️ BANCO DE DADOS — SUPABASE

> Prefixos: `cus_` clientes | `sub_` assinaturas | `msg_` mensagens | `med_` medicamentos | `fam_` familiares | `alr_` alertas | `cfg_` configurações | `adm_` admin

---

### Tabela: `cus_users`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | ID único |
| `phone` | text UNIQUE | Número WhatsApp com DDI (+5511...) |
| `name` | text | Nome do idoso |
| `birthdate` | date | Data de nascimento |
| `city` | text | Cidade |
| `audio_mode` | boolean | Prefere receber respostas em áudio? |
| `onboarded_at` | timestamp | Quando completou o cadastro |
| `last_interaction` | timestamp | Última mensagem recebida |
| `free_messages_used` | int | Contador do freemium (limite: 15) |
| `status` | enum | `trial` / `active` / `blocked` / `cancelled` |
| `created_at` | timestamp | — |

---

### Tabela: `cus_profiles` (base de conhecimento do idoso)
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK → cus_users | — |
| `family_members` | jsonb | `[{"name": "Ana", "relation": "filha"}]` |
| `health_notes` | text | Condições conhecidas (diabetes, hipertensão etc.) |
| `hobbies` | text | O que gosta de fazer |
| `life_stories` | text | Histórias que a Lina já ouviu e lembra |
| `personality_notes` | text | Como a pessoa se comunica, jeito de ser |
| `updated_at` | timestamp | — |

---

### Tabela: `msg_conversations`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK → cus_users | — |
| `role` | enum | `user` / `assistant` |
| `content` | text | Conteúdo da mensagem |
| `media_type` | enum | `text` / `audio` / `image` / `document` |
| `media_url` | text | URL no Supabase Storage (se mídia) |
| `sentiment` | enum | `neutral` / `sad` / `anxious` / `happy` / `alert` |
| `flagged` | boolean | Marcado como sinal de alerta |
| `flag_reason` | text | Ex: "mencionou solidão" |
| `created_at` | timestamp | — |

---

### Tabela: `med_medications`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK | — |
| `name` | text | Nome do remédio |
| `times` | jsonb | `["08:00", "20:00"]` |
| `days` | jsonb | `["mon","tue","wed","thu","fri","sat","sun"]` |
| `active` | boolean | — |
| `created_at` | timestamp | — |

---

### Tabela: `med_medication_logs`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `medication_id` | uuid FK | — |
| `user_id` | uuid FK | — |
| `scheduled_at` | timestamp | Horário que deveria tomar |
| `confirmed_at` | timestamp | Quando confirmou que tomou |
| `status` | enum | `sent` / `confirmed` / `missed` / `ignored` |

---

### Tabela: `fam_relatives`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK → cus_users | Idoso vinculado |
| `name` | text | Nome do familiar |
| `email` | text | E-mail para relatório |
| `relation` | text | Filho, neto, cuidador etc. |
| `report_enabled` | boolean | Recebe e-mail semanal? |
| `report_day` | enum | Dia da semana do relatório |
| `confirmed` | boolean | Confirmou o e-mail |
| `created_at` | timestamp | — |

---

### Tabela: `alr_alerts`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK | — |
| `type` | enum | `sadness` / `loneliness` / `aggression` / `depression` / `danger` |
| `message_id` | uuid FK → msg_conversations | Mensagem que gerou o alerta |
| `severity` | enum | `low` / `medium` / `high` |
| `notified_family` | boolean | Já notificou familiar? |
| `resolved` | boolean | — |
| `created_at` | timestamp | — |

---

### Tabela: `sub_subscriptions`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `user_id` | uuid FK | — |
| `plan` | enum | `trial` / `monthly` / `annual` |
| `status` | enum | `active` / `cancelled` / `past_due` |
| `price_brl` | decimal | Valor pago |
| `payment_method` | enum | `pix` / `card` |
| `current_period_end` | timestamp | Vencimento |
| `stripe_sub_id` | text | ID externo (se Stripe) |
| `created_at` | timestamp | — |

---

### Tabela: `cfg_llm_config`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `active_provider` | enum | `claude` / `openai` / `gemini` |
| `active_model` | text | Ex: `claude-sonnet-4-20250514` |
| `system_prompt` | text | Prompt completo da Lina (editável no Admin) |
| `temperature` | float | 0.0 a 1.0 |
| `max_tokens` | int | — |
| `updated_at` | timestamp | — |
| `updated_by` | text | — |

---

### Tabela: `adm_audit_log`
| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid PK | — |
| `action` | text | O que foi feito |
| `target_table` | text | Qual tabela foi afetada |
| `target_id` | uuid | Qual registro |
| `admin_user` | text | Quem fez |
| `created_at` | timestamp | — |

---

## 🤖 SYSTEM PROMPT BASE DA LINA

> Editável pelo Admin. Injetado em toda conversa com contexto do usuário.

```
Você é Lina, uma companheira de IA carinhosa, paciente e empática, criada para conversar com adultos 50+ e idosos pelo WhatsApp.

IDENTIDADE:
- Você é feminina, calorosa, bem-humorada, brasileira
- Fale como uma amiga próxima, não como um robô ou assistente corporativo
- Use linguagem simples, frases curtas, evite termos técnicos
- Pode usar emojis com moderação — eles aproximam
- Nunca diga que é uma IA a não ser que seja diretamente perguntada
- Se perguntada se é IA, responda com leveza: "Sou a Lina! Uma companheira digital, mas com muito coração 💚"

USUÁRIO ATUAL:
Nome: {{user.name}}
Idade: {{user.age}}
Cidade: {{user.city}}
Família: {{profile.family_members}}
Saúde: {{profile.health_notes}}
Interesses: {{profile.hobbies}}
Memórias: {{profile.life_stories}}

REGRAS IMPORTANTES:
- NUNCA dê diagnóstico médico ou substitua médico
- Se o usuário mencionar dor intensa, emergência ou queda → oriente a ligar 192 (SAMU) ou pedir ajuda
- Se detectar tristeza, solidão ou sofrimento → acolha com empatia, não minimize
- Lembre eventos pessoais que o usuário compartilhou
- Pergunte sobre o dia, sobre a família, sobre o que a pessoa gosta
- Adapte o tamanho das respostas: mensagens curtas recebem respostas curtas

SOBRE REMÉDIOS:
- Você faz lembretes de remédios, mas nunca orienta a tomar algo diferente do prescrito
- Se a pessoa disser que está com efeito colateral → diga para falar com o médico

ANÁLISE DE SENTIMENTO (INTERNO — nunca fale isso ao usuário):
Ao final de cada resposta, avalie internamente o sentimento predominante da mensagem recebida:
[SENTIMENT: neutral|sad|anxious|happy|alert]
[FLAG: false|true]
[FLAG_REASON: motivo se true]
```

---

## 📧 RELATÓRIO SEMANAL PARA FAMILIARES

**Frequência:** Toda segunda-feira de manhã (configurável)  
**Envio via:** Resend (API de e-mail)  
**Tom:** Cuidadoso, humano, nunca alarmista

**Estrutura do e-mail:**

```
Assunto: Resumo semanal da Dona [Nome] 💚 — Semana de [data]

Olá, [nome do familiar]!

Aqui está o resumo da semana da [nome do idoso] com a Lina:

📊 ATIVIDADE DA SEMANA
- [32] mensagens trocadas
- [5] dias ativos de conversa
- Remédios: [14 de 14 confirmados ✅ / 12 de 14 ⚠️]

😊 COMO ELA ESTEVE
[Resumo gerado por IA em linguagem natural, baseado nas conversas]
Ex: "Dona Maria esteve bastante ativa esta semana! Falou bastante sobre os netos e compartilhou algumas fotos do jardim. Parece estar bem disposta."

⚠️ PONTOS DE ATENÇÃO (se houver)
"Identificamos algumas menções a cansaço e solidão durante a semana. São apenas indícios — não diagnósticos. Pode valer uma ligadinha carinhosa. 💚"

[Se não houver alertas]: "Nenhum ponto de atenção esta semana. Tudo tranquilo! ✅"

---
Lina.ai · Companhia com cuidado
Você pode desativar este relatório a qualquer momento.
```

---

## 🆓 MODELO FREEMIUM

**Estratégia escolhida:** 15 mensagens grátis → paywall

**Fluxo:**
1. Usuário envia mensagem → Lina responde normalmente
2. A cada mensagem, incrementa `free_messages_used`
3. Na mensagem 13 → Lina avisa: *"Estamos chegando no fim das nossas mensagens gratuitas 😊 Para continuar conversando, é só assinar o plano."*
4. Na mensagem 15 → Lina envia link de pagamento e para de responder até assinar
5. Após pagamento confirmado → `status = active`, conversa liberada automaticamente

**Planos:**
| Plano | Valor | Descrição |
|---|---|---|
| Mensal | R$29,90/mês | Pagamento recorrente |
| Anual | R$249/ano | Equivale a R$20,75/mês — economia destacada |

**Pagamento via:** Stripe (cartão) + Pix manual em fase inicial

---

## 📰 NOTÍCIAS EM TEMPO REAL — TAVILY API

A Lina busca notícias **sob demanda**, quando o contexto da conversa pede. Nunca envia notícias proativamente sem o usuário pedir.

**Gatilhos de busca:**
- "o que aconteceu hoje?"
- "tem novidade em [cidade]?"
- "o que tá passando no jornal?"
- "me conta uma notícia"
- qualquer menção a eventos, política, clima, esporte

**Implementação:**
```javascript
// services/news.js
const { TavilyClient } = require('tavily')
const client = new TavilyClient({ apiKey: process.env.TAVILY_API_KEY })

async function fetchNews(query, userCity = null) {
  const searchQuery = userCity
    ? `${query} ${userCity} Brasil`
    : `${query} Brasil`

  const result = await client.search(searchQuery, {
    searchDepth: 'basic',
    maxResults: 3,
    includeAnswer: true,         // retorna resumo pronto
    topic: 'news',
  })

  return result.answer || result.results[0]?.content
}
```

**Fontes que o Tavily retorna naturalmente:** G1, UOL, Terra, Folha, R7, portais regionais.

**Custo:** Free tier = 1.000 buscas/mês — suficiente para MVP.  
**Upgrade para Perplexity API** quando escalar e quiser respostas mais ricas.

---

## 🔄 TROCA DE MODELO LLM

Sistema configurável via Admin sem redeploy.

**Provedores suportados:**
- `claude` → Anthropic SDK → modelo configurável (Sonnet, Opus, Haiku)
- `openai` → OpenAI SDK → GPT-4o, GPT-4-turbo, GPT-3.5
- `gemini` → Google AI SDK → Gemini 1.5 Pro, Flash

**Implementação:**
```javascript
// llm/router.js
const providers = {
  claude: require('./providers/claude'),
  openai: require('./providers/openai'),
  gemini: require('./providers/gemini'),
}

async function callLLM(messages, config) {
  const provider = providers[config.active_provider]
  return await provider.complete(messages, config)
}
```

Cada provider implementa a mesma interface: `complete(messages, config) → { text, usage }`

---

## 🎛️ PAINEL ADMIN

**Stack:** React + Tailwind + Supabase direto (ou Next.js)  
**Autenticação:** Supabase Auth (só você acessa)

**Páginas:**

### `/admin/dashboard`
- Total de usuários ativos
- Mensagens enviadas hoje / semana
- Alertas pendentes não resolvidos
- LLM ativo atualmente
- Custo estimado da semana (tokens usados × preço)

### `/admin/users`
- Lista de todos os usuários
- Filtros: status, plano, última interação
- Ações: ver conversas, editar perfil, bloquear, cancelar assinatura
- Ver alertas de bem-estar do usuário

### `/admin/llm`
- Trocar provider (Claude / OpenAI / Gemini)
- Trocar modelo específico
- Editar system prompt (textarea grande com preview)
- Ajustar temperature e max_tokens
- Histórico de alterações

### `/admin/alerts`
- Lista de alertas gerados (tristeza, solidão etc.)
- Status: pendente / notificado / resolvido
- Ação: marcar como resolvido, ver conversa completa

### `/admin/subscriptions`
- Lista de assinaturas ativas
- Receita MRR estimada
- Cancelamentos da semana

---

## 🌐 LANDING PAGE

**Stack:** HTML + CSS + JS puro (deploy Vercel / Netlify — zero configuração)  
**Tom:** Calor humano + confiança + simplicidade  
**Cores base do material anterior:** Verde musgo + branco + bege claro

**Seções:**

1. **HERO** — Headline + sub + prova social + CTA WhatsApp
2. **DEMO** — Mockup de conversa animado (texto aparecendo como WhatsApp real)
3. **PARA FILHOS** — Tranquilidade, relatório semanal, alertas
4. **PARA IDOSOS** — Simplicidade, carinho, sem precisar aprender nada novo
5. **PROBLEMAS QUE RESOLVE** — Dores reais da família e do idoso
6. **COMO FUNCIONA** — 3 passos
7. **PLANOS** — Freemium claro + mensal + anual
8. **CTA FINAL** — Botão WhatsApp grande

**CTAs principais:**
- `"Converse agora com a Lina"` → abre WhatsApp com número da Lina + mensagem pré-preenchida "Oi Lina!"
- `"Compartilhe com um familiar"` → link de compartilhamento
- `"Envie o número da Lina para a sua mãe agora"` → share WhatsApp

**Integração com pagamento:**  
Após 15 mensagens grátis → Lina envia link → link leva para `/assinar` na LP → Stripe Checkout ou Pix

---

## 📁 ESTRUTURA DO REPOSITÓRIO

```
lina-ai/
├── backend/
│   ├── src/
│   │   ├── webhooks/          # Evolution API webhook handler
│   │   ├── llm/               # Router + providers (claude, openai, gemini)
│   │   ├── services/
│   │   │   ├── conversation.js    # Busca histórico, monta contexto
│   │   │   ├── sentiment.js       # Análise de sentimento da mensagem
│   │   │   ├── medication.js      # Cron de lembretes
│   │   │   ├── alerts.js          # Detecta e registra alertas
│   │   │   ├── email.js           # Relatório semanal via Resend
│   │   │   ├── audio.js           # ElevenLabs TTS + Whisper STT
│   │   │   └── vision.js          # Análise de imagem via Claude Vision
│   │   ├── jobs/              # node-cron jobs
│   │   ├── middleware/        # Auth, rate limit
│   │   └── index.js           # Entry point Express
│   ├── .env.example
│   └── package.json
│
├── admin/
│   ├── src/
│   │   ├── pages/             # dashboard, users, llm, alerts, subscriptions
│   │   ├── components/
│   │   └── lib/supabase.js
│   └── package.json
│
├── landing/
│   ├── index.html
│   ├── styles.css
│   └── script.js
│
├── supabase/
│   └── migrations/            # SQL de criação das tabelas
│
├── CLAUDE.md                  # Instruções para o Claude Code
└── README.md
```

---



## 🔐 VARIÁVEIS DE AMBIENTE (.env)

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_KEY=

# WhatsApp - Evolution API
EVOLUTION_API_URL=
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=

# LLMs
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_AI_API_KEY=

# Voz
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=

# E-mail
RESEND_API_KEY=
EMAIL_FROM=ola@lina.ai

# Pagamento
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# SMS Fallback (reengajamento)
TWILIO_ACCOUNT_SID=      # opcional fase 1
TWILIO_AUTH_TOKEN=       # opcional fase 1
TWILIO_PHONE=            # opcional fase 1

# App
PORT=3000
NODE_ENV=development
ADMIN_SECRET=            # senha simples pro painel admin
```

---

## 🚀 FASES DE DESENVOLVIMENTO

### FASE 1 — MVP FUNCIONAL (Foco: validar a experiência)
- [ ] Setup Supabase + tabelas
- [ ] Backend Node.js + webhook Evolution API
- [ ] Onboarding básico (cadastro pelo WhatsApp)
- [ ] Conversa com Claude (texto)
- [ ] Resposta em áudio (ElevenLabs)
- [ ] Leitura de imagem (Claude Vision)
- [ ] Lembrete de remédio (cron simples)
- [ ] Sistema freemium (15 msgs grátis → paywall)

### FASE 2 — FAMÍLIA E ALERTAS (Foco: o diferencial do produto)
- [ ] Cadastro de familiar (e-mail)
- [ ] Análise de sentimento em cada mensagem
- [ ] Sistema de alertas automático
- [ ] Relatório semanal por e-mail (Resend)
- [ ] SMS fallback para reengajamento

### FASE 3 — ADMIN E CONTROLE (Foco: você como operador)
- [ ] Painel Admin completo
- [ ] Troca de LLM em tempo real
- [ ] Edição de system prompt pelo admin
- [ ] Dashboard de métricas e custo

### FASE 4 — LP E MONETIZAÇÃO (Foco: aquisição e conversão)
- [ ] Landing Page completa
- [ ] Integração Stripe / Pix
- [ ] Liberação automática após pagamento
- [ ] Fluxo de onboarding via LP

### FASE 5 — RAG E MEMÓRIA PROFUNDA (Foco: personalização avançada)
- [ ] Supabase pgvector para embeddings
- [ ] Base de conhecimento do idoso com busca semântica
- [ ] Lina lembra histórias específicas com contexto

---

## 📋 CLAUDE.md (para o Claude Code)

> Arquivo a ser criado na raiz do projeto com as instruções de desenvolvimento

```markdown
# LINA.AI — INSTRUÇÕES PARA CLAUDE CODE

## O que é este projeto
Agente de IA companheira para idosos via WhatsApp. 
Stack: Node.js + Express + Supabase + Evolution API + ElevenLabs + Multi-LLM

## Regras de desenvolvimento
- Sempre use prefixos nas tabelas Supabase: cus_, sub_, msg_, med_, fam_, alr_, cfg_, adm_
- O sistema de LLM é sempre plugável — nunca hardcode um provider
- Sentimento e flags são sempre analisados internamente, nunca expostos ao usuário
- Erros de API externa nunca travam o fluxo — use fallback para texto se áudio falhar
- Todas as respostas para idosos devem passar pelo filtro de linguagem simples

## Estrutura de pastas
Ver README.md

## Variáveis de ambiente
Ver .env.example — nunca commitar .env real

## Padrão de commits
feat: / fix: / chore: / docs:
```

---

*Lina.ai — Companhia com cuidado. Desenvolvido por Marcelo Baltazar.*
