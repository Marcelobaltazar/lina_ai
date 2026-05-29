# LINA.AI — Documentação Técnica

---

## 1. Stack Completa

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js (ESM) | — |
| Framework | Express | ^4.21.2 |
| Banco de dados | Supabase (Postgres) | @supabase/supabase-js ^2.49.4 |
| LLM principal | Anthropic Claude | @anthropic-ai/sdk ^0.39.0 |
| LLM alternativo | OpenAI GPT | openai ^4.93.0 |
| LLM alternativo | Google Gemini | @google/generative-ai ^0.21.0 |
| STT (transcrição) | OpenAI Whisper | via openai SDK |
| TTS (áudio) | ElevenLabs | @elevenlabs/elevenlabs-js ^2.45.0 |
| WhatsApp | Evolution API | via axios (REST) |
| Busca web | Tavily | @tavily/core ^0.7.3 |
| E-mail | Resend | resend ^4.5.2 |
| Pagamentos | Stripe | stripe ^17.7.0 |
| Cron jobs | node-cron | ^3.0.3 |
| Conversão de áudio | ffmpeg | @ffmpeg-installer/ffmpeg ^1.1.0 + fluent-ffmpeg ^2.1.3 |
| HTTP client | axios | ^1.8.4 |
| Upload | multer | ^1.4.5-lts.1 |
| Env | dotenv | ^16.4.7 |

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        USUÁRIO IDOSO                            │
│                    (WhatsApp — celular)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ mensagem (texto / áudio / imagem)
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      EVOLUTION API                               │
│             (gateway WhatsApp — servidor externo)                │
└──────────────────────────┬───────────────────────────────────────┘
                           │ POST /webhook/evolution
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                  BACKEND NODE.JS (Express)                       │
│                  backend/src/index.js                            │
│                                                                  │
│  webhooks/evolution.js                                           │
│  ├─ Ignorar grupo / fromMe                                       │
│  ├─ Lookup / criação de usuário (cus_users)                      │
│  ├─ Onboarding: pede nome → extrai nome via GPT-4o-mini         │
│  ├─ Controle de acesso (trial / blocked)                         │
│  ├─ Freemium: conta mensagens, aviso na 13ª, paywall na 15ª     │
│  ├─ Processamento de mídia:                                      │
│  │   ├─ audioMessage → transcribeAudio() → Whisper              │
│  │   └─ imageMessage → analyzeImage() → Claude Vision           │
│  ├─ classifyIntent() → LEMBRETE / CONFIRMACAO / CONVERSA        │
│  ├─ Fluxo LEMBRETE → handleMedicationFlow()                     │
│  ├─ Fluxo CONFIRMACAO → confirmMedication()                     │
│  ├─ Fluxo CONVERSA → processConversation()                      │
│  │   ├─ Monta system prompt com perfil do usuário               │
│  │   ├─ Busca histórico (últimas 8 msgs)                        │
│  │   ├─ fetchRelevantMemories() → memórias semânticas           │
│  │   ├─ needsSearch() → decide se busca na web                  │
│  │   ├─ searchWeb() → GPT-4o-search / Gemini+Google / Tavily    │
│  │   └─ callLLM() → router → Claude / OpenAI / Gemini           │
│  ├─ parseSentiment() → extrai [SENTIMENT] e [FLAG] da resposta  │
│  ├─ Salva msgs em msg_conversations                             │
│  ├─ createAlert() se flagged                                     │
│  ├─ extractAndSaveMemories() em background                      │
│  └─ Delay humanizado → sendTypingIndicator → sendWhatsApp       │
│                                                                  │
│  jobs/cron.js                                                    │
│  ├─ A cada minuto: checkAndSendReminders / resend / markIgnored │
│  ├─ Diário 10h: reengajamento (usuários inativos 3+ dias)       │
│  └─ Segunda 8h: relatório semanal por e-mail (Resend)           │
│                                                                  │
│  routes/caregiver.js                                             │
│  └─ REST API para portal do cuidador (auth por token UUID)      │
└──────┬────────────────────────┬────────────────────────────────┘
       │                        │
       ▼                        ▼
┌──────────────┐     ┌──────────────────────┐
│   SUPABASE   │     │   APIS EXTERNAS      │
│  (Postgres)  │     │  Claude / GPT /      │
│              │     │  Gemini / Whisper /  │
│  cus_*       │     │  ElevenLabs /        │
│  msg_*       │     │  Tavily / Resend /   │
│  med_*       │     │  Stripe / Evolution  │
│  fam_*       │     └──────────────────────┘
│  alr_*       │
│  cfg_*       │
│  adm_*       │
└──────────────┘
```

---

## 3. Estrutura de Pastas

```
lina_ai/
├── backend/
│   ├── src/
│   │   ├── index.js                  Entrypoint Express — registra rotas, body parser 50mb, cron
│   │   ├── lib/
│   │   │   └── supabase.js           Singleton do cliente Supabase
│   │   ├── middleware/
│   │   │   └── auth.js               Bearer token para rotas admin (ADMIN_SECRET)
│   │   ├── llm/
│   │   │   ├── router.js             Decide qual provider usar; fallback automático para Claude
│   │   │   └── providers/
│   │   │       ├── claude.js         Anthropic SDK — claude-sonnet-4-6 por padrão
│   │   │       ├── openai.js         OpenAI SDK — gpt-4o-mini por padrão
│   │   │       └── gemini.js         Google Generative AI — gemini-2.0-flash por padrão
│   │   ├── webhooks/
│   │   │   └── evolution.js          Webhook principal — processa todas as msgs do WhatsApp
│   │   ├── routes/
│   │   │   └── caregiver.js          REST API do portal do cuidador
│   │   ├── services/
│   │   │   ├── conversation.js       Orquestra chamada ao LLM com contexto completo
│   │   │   ├── audio.js              STT (Whisper) e TTS (ElevenLabs); descriptografia WhatsApp
│   │   │   ├── vision.js             Análise de imagem via Claude Vision
│   │   │   ├── memory.js             Extração e busca de memórias semânticas (GPT-4o-mini)
│   │   │   ├── search.js             Decisão e execução de busca web
│   │   │   ├── news.js               Busca de notícias via Tavily
│   │   │   ├── intentClassifier.js   Classifica intenção: LEMBRETE / CONFIRMACAO / CONVERSA
│   │   │   ├── sentiment.js          Parseia tags [SENTIMENT] e [FLAG] da resposta do LLM
│   │   │   ├── medication.js         Lembretes: envio, reenvio 30min, ignore 60min, confirmação
│   │   │   ├── medicationFlow.js     Flow conversacional de cadastro de remédio (2 passos)
│   │   │   ├── alerts.js             Cria alertas e notifica familiares por e-mail
│   │   │   └── email.js              Envia e-mails via Resend (alerta, relatório, token cuidador)
│   │   └── jobs/
│   │       └── cron.js               3 cron jobs (medicação, reengajamento, relatório semanal)
│   └── package.json
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql    Schema inicial (algumas tabelas estão defasadas)
│       └── 002_med_medications_fields.sql  Campos estendidos para med_medications
├── docs/
│   ├── LINA_TECH.md                  Este documento
│   └── LINA_PRODUCT.md               Documentação de produto
└── CLAUDE.md                         Instruções de desenvolvimento para o agente IA
```

---

## 4. Banco de Dados

### Prefixos obrigatórios por domínio

| Prefixo | Domínio |
|---|---|
| `cus_` | Clientes / usuários idosos |
| `sub_` | Assinaturas |
| `msg_` | Mensagens / conversas |
| `med_` | Medicamentos |
| `fam_` | Familiares |
| `alr_` | Alertas |
| `cfg_` | Configurações |
| `adm_` | Admin / auditoria |

### Tabelas em uso (schema real)

#### `cus_users`
Registro principal do usuário idoso.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| phone | text | Número sem formatação |
| name | text | `null` = novo, `__awaiting_name__` = onboarding em andamento |
| city | text | Detectada automaticamente nas mensagens |
| status | text | `trial`, `active`, `blocked` |
| free_messages_used | int | Contador do plano gratuito (máx 15) |
| onboarded_at | timestamptz | Quando completou onboarding |
| last_interaction | timestamptz | Usado pelo job de reengajamento |
| audio_mode | bool | Se deve responder em áudio (ElevenLabs) |
| med_flow | jsonb | Estado do fluxo conversacional de cadastro de remédio |
| created_at | timestamptz | — |

#### `cus_profiles`
Perfil detalhado do idoso (preenchido pelo cuidador ou extraído das conversas).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | — |
| family_members | text | Ex: "filho João, neta Maria" |
| health_notes | text | Condições de saúde relevantes |
| hobbies | text | Atividades preferidas |
| life_stories | text | Histórias pessoais importantes |

#### `cus_memories`
Fatos permanentes extraídos das conversas pelo GPT-4o-mini.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | — |
| content | text | O fato em si ("Fez bolo de fubá com goiabada") |
| context | text | Contexto emocional ("Parecia animada, falou com carinho") |
| relevance_tags | jsonb | Array de tags para busca futura |
| recorded_at | timestamptz | — |

#### `msg_conversations`
Histórico completo de mensagens.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | — |
| role | text | `user` ou `assistant` |
| content | text | Texto da mensagem |
| media_type | text | `text`, `audio`, `image` |
| sentiment | text | `neutral`, `sad`, `anxious`, `happy`, `alert` |
| flagged | bool | Se foi marcada como alerta |
| flag_reason | text | Motivo do alerta |
| created_at | timestamptz | — |

#### `med_medications`
Lembretes de medicamentos cadastrados.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | — |
| name | text | Nome do remédio |
| times | jsonb | Array de horários `["08:00","20:00"]` |
| days | jsonb | Array de dias `["mon","wed","fri"]` |
| active | bool | Se está ativo |
| generic_name, dosage, form... | text | Campos detalhados (migration 002) |

#### `med_medication_logs`
Registro de cada disparo de lembrete.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| medication_id | uuid FK → med_medications | — |
| user_id | uuid FK → cus_users | — |
| status | text | `sent`, `confirmed`, `missed_pending`, `missed_notified`, `ignored` |
| reminder_count | int | 1 = primeiro envio, 2 = reenvio |
| scheduled_at | timestamptz | Momento do disparo |
| confirmed_at | timestamptz | Quando confirmou (se confirmou) |

#### `fam_relatives`
Familiares/cuidadores vinculados a um idoso.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | Idoso ao qual está vinculado |
| name | text | — |
| email | text | Para receber relatórios e alertas |
| access_token | uuid | Token de acesso ao portal do cuidador |
| token_created_at | timestamptz | — |
| report_enabled | bool | Se recebe relatório semanal |

#### `alr_alerts`
Alertas de bem-estar detectados.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| user_id | uuid FK → cus_users | — |
| message_id | uuid FK → msg_conversations | Mensagem que originou o alerta |
| type | text | `loneliness`, `sadness`, `depression`, `aggression`, `danger` |
| severity | text | `low`, `medium`, `high` |
| notified_family | bool | Se o familiar já foi notificado |
| resolved | bool | Se o alerta foi resolvido |
| created_at | timestamptz | — |

#### `cfg_llm_config`
Configuração ativa do LLM (trocável sem redeploy).

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| active_provider | text | `claude`, `openai`, `gemini` |
| active_model | text | Ex: `claude-sonnet-4-6`, `gpt-4o-mini` |
| temperature | float | 0.0–1.0 |
| max_tokens | int | Limite de tokens na resposta |
| system_prompt | text | System prompt customizado (substitui o default) |

#### `adm_audit_log`
Log de ações do sistema e do admin.

| Coluna | Tipo | Descrição |
|---|---|---|
| id | uuid PK | — |
| action | text | Ex: `alert_created` |
| target_table | text | Tabela afetada |
| target_id | uuid | ID do registro afetado |
| admin_user | text | Quem executou (`system` ou email do admin) |
| created_at | timestamptz | — |

---

## 5. APIs Externas

### Evolution API
- **Função:** Gateway WhatsApp — recebe mensagens e envia respostas
- **Autenticação:** header `apikey: EVOLUTION_API_KEY`
- **Endpoints usados:**
  - `POST /message/sendText/:instance` — envia texto
  - `POST /message/sendMedia/:instance` — envia áudio (base64 OGG/Opus)
  - `POST /chat/sendPresence/:instance` — indicador "digitando..."
  - `POST /chat/getBase64FromMediaMessage/:instance` — obtém mídia descriptografada

### OpenAI
- **Modelos usados:**
  - `gpt-4o-mini` — intent classifier, extração de nome no onboarding, memórias, needsSearch, confirmação de medicamento
  - `gpt-4o-search-preview` — busca web quando provider=openai
  - `whisper-1` — transcrição de áudio (STT)
  - Qualquer modelo via `cfg_llm_config.active_model` quando provider=openai
- **Autenticação:** `OPENAI_API_KEY`

### Anthropic Claude
- **Modelos usados:**
  - `claude-sonnet-4-6` — LLM principal por padrão
  - `claude-haiku-4-5-20251001` — geração do resumo semanal no cron
  - Qualquer modelo via `cfg_llm_config.active_model`
- **Autenticação:** `ANTHROPIC_API_KEY`

### Google Gemini
- **Modelos usados:**
  - `gemini-2.0-flash` — LLM quando provider=gemini; busca web com Google Search
- **Autenticação:** `GOOGLE_AI_API_KEY`

### ElevenLabs
- **Função:** Text-to-speech para responder em áudio
- **Modelo:** `eleven_multilingual_v2`
- **Voz:** configurável via `ELEVENLABS_VOICE_ID`
- **Autenticação:** `ELEVENLABS_API_KEY`

### Tavily
- **Função:** Busca web fallback (quando GPT-search e Gemini+Google falham)
- **Autenticação:** `TAVILY_API_KEY`

### Resend
- **Função:** Disparo de e-mails transacionais
- **E-mails enviados:** alerta de bem-estar, relatório semanal, link do cuidador
- **Autenticação:** `RESEND_API_KEY`; remetente via `EMAIL_FROM`

### Stripe
- **Função:** Processamento de pagamentos (endpoint `/webhook/stripe` existe mas retorna 200 vazio — integração pendente)
- **Autenticação:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## 6. Sistema de LLM — Router

**Arquivo:** `backend/src/llm/router.js`

O sistema é completamente plugável. A decisão de qual provider usar vem da tabela `cfg_llm_config` no Supabase — pode ser trocada em produção sem redeploy.

**Fluxo:**
1. `callLLM()` lê `cfg_llm_config` (ou usa config passada como parâmetro)
2. Seleciona o provider: `claude`, `openai` ou `gemini`
3. Chama o provider escolhido
4. Se falhar e não for Claude → fallback automático para Claude
5. Se Claude falhar → lança erro

**Providers:**
- `claude.js` — usa `Anthropic SDK`, monta array `messages` + `system`
- `openai.js` — usa `OpenAI SDK`, monta array com `{role:'system', content}` na frente; detecta modelos `-search` e omite `temperature`
- `gemini.js` — usa `GoogleGenerativeAI`, converte `assistant` para `model` no histórico

**Parâmetros configuráveis via DB:**
- `active_provider` — qual provider usar
- `active_model` — modelo específico
- `temperature` — criatividade da resposta
- `max_tokens` — limite de tokens
- `system_prompt` — substitui o DEFAULT_SYSTEM_PROMPT completamente

---

## 7. Sistema de Áudio

**Arquivo:** `backend/src/services/audio.js`

### STT — Speech-to-Text (Whisper)

**Função:** `transcribeAudio(data)`

O WhatsApp criptografa mídias com AES-256-CBC. O fluxo de transcrição:

1. Extrai `mediaUrl` e `mediaKey` do payload (`data.message.audioMessage`)
2. **Tentativa 1:** download da URL com header `apikey` (Evolution)
3. **Tentativa 2:** download da URL sem headers
4. **Tentativa 3:** `getBase64FromMediaMessage` via Evolution API (já retorna descriptografado)
5. Se veio via tentativa 1 ou 2 (criptografado) e `mediaKey` existe → chama `decryptWhatsAppMedia()`
6. Salva em `/tmp/audio_lina_${Date.now()}.ogg` (nome único para evitar conflito)
7. Envia para `whisper-1` com `toFile()`
8. Remove o arquivo tmp no `finally`
9. Retorna `null` se transcrição vier vazia

**Descriptografia WhatsApp (`decryptWhatsAppMedia`):**
- Aceita `mediaKey` em 4 formatos: string base64, Buffer, Uint8Array, objeto `{0:59, 1:95, ...}`
- Usa `crypto.hkdfSync` (Node nativo) com info `"WhatsApp Audio Keys"` para derivar 112 bytes
- IV = bytes 0–15, cipherKey = bytes 16–47
- Remove 10 bytes de MAC do final do arquivo antes de decifrar
- AES-256-CBC via `crypto.createDecipheriv`

### TTS — Text-to-Speech (ElevenLabs)

**Função:** `generateAudio(text)`

- Chama `eleven_multilingual_v2` com a voz configurada
- Parâmetros: `stability: 0.6`, `similarity_boost: 0.75`, `style: 0.3`, `use_speaker_boost: true`
- Retorna `Buffer` com o áudio OGG
- Só é chamada se `user.audio_mode === true`

---

## 8. Sistema de Memória

**Arquivo:** `backend/src/services/memory.js`

### Extração — `extractAndSaveMemories(userId, recentMessages)`

Chamada em background após cada resposta (não bloqueia o envio). Recebe as últimas 8 mensagens e envia para GPT-4o-mini com prompt que pede:
- `content` — o fato extraído
- `context` — contexto emocional
- `relevance_tags` — array de tags para busca futura

Antes de salvar, verifica se já existe memória com prefixo similar (primeiros 20 chars). Evita duplicatas.

### Busca — `fetchRelevantMemories(userId, currentMessage)`

1. Busca até 50 memórias mais recentes do usuário no Supabase
2. Envia lista para GPT-4o-mini com a mensagem atual e pede quais IDs são relevantes
3. Timeout de 2 segundos — se não responder, retorna `[]`
4. Filtra e retorna até 5 memórias mais relevantes
5. Injetadas no system prompt como `MEMÓRIAS RELEVANTES DE {nome}`

---

## 9. Sistema de Busca Web

**Arquivo:** `backend/src/services/search.js`

### Decisão — `needsSearch(message, provider)`

GPT-4o-mini (ou Gemini quando provider=gemini) decide com `SIM`/`NÃO` se a mensagem precisa de informação atualizada da internet. Timeout de 3 segundos com fallback `NÃO`.

**Critérios para SIM:** preços, cotações, clima, previsão do tempo, notícias, resultados de jogos, eventos recentes.

**Critérios para NÃO:** relato pessoal, conversa cotidiana, sentimentos, receitas, conselhos gerais.

### Busca — `searchWeb(query, provider)`

- **provider=openai:** usa `gpt-4o-search-preview`
- **provider=gemini:** usa `gemini-2.0-flash` com `googleSearch` tool
- **provider=claude (default):** tenta openai search, cai no fallback
- **Fallback:** Tavily via `news.js`

O resultado é injetado no system prompt como `[CONTEXTO ATUALIZADO DA INTERNET]`.

---

## 10. Sistema de Alertas

**Arquivo:** `backend/src/services/alerts.js`

### Detecção

O LLM é instruído a incluir tags internas ao final de cada resposta:
```
[SENTIMENT: neutral|sad|anxious|happy|alert]
[FLAG: true|false]
[FLAG_REASON: motivo]
```

`parseSentiment()` extrai essas tags e limpa o texto antes de enviar ao usuário.

### Criação de Alerta

`createAlert(userId, messageId, flagReason)`:
1. Classifica tipo e severidade baseado em keywords no `flagReason`:
   - `loneliness` / `sadness` / `depression` / `aggression` / `danger`
   - Severity: `low`, `medium`, `high`
2. Insere em `alr_alerts`
3. Registra em `adm_audit_log`
4. Se `severity === 'high'` → `notifyFamilyAlert()`

### Notificação Familiar

`notifyFamilyAlert(userId, alertType, flagReason)`:
- Busca todos os familiares com `report_enabled: true`
- Envia e-mail via Resend para cada um com tipo e contexto do alerta
- Marca `notified_family: true` no banco

---

## 11. Cron Jobs

**Arquivo:** `backend/src/jobs/cron.js`
**Timezone:** `America/Sao_Paulo` em todos os jobs

### Job 1 — Medicação
**Agendamento:** `* * * * *` (a cada minuto)

Executa 3 funções em sequência:
1. `checkAndSendReminders()` — verifica se algum medicamento tem horário = agora e dia = hoje; envia lembrete; cria log com status `sent`
2. `checkAndResendReminders()` — busca logs `sent` com `reminder_count=1` entre 30 e 60 minutos atrás; reenvia e atualiza `reminder_count=2`
3. `markIgnoredReminders()` — marca como `ignored` todos os logs `sent` com mais de 60 minutos

### Job 2 — Reengajamento
**Agendamento:** `0 10 * * *` (diariamente às 10h)

Busca usuários `active` com `last_interaction` há mais de 3 dias e envia mensagem calorosa: *"Oi {nome}! 💚 Estava com saudade de você! Tem alguma novidade pra me contar?"*

### Job 3 — Relatório Semanal
**Agendamento:** `0 8 * * 1` (segunda-feira às 8h)

Para cada familiar com `report_enabled: true`:
1. Coleta stats da semana: total de mensagens, dias ativos, remédios confirmados/total, sinais de tristeza
2. Gera resumo narrativo via `claude-haiku-4-5-20251001` (máx 150 tokens)
3. Envia e-mail HTML via Resend

---

## 12. Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `SUPABASE_SERVICE_KEY` | ✅ | Chave de serviço do Supabase (bypass RLS) |
| `EVOLUTION_API_URL` | ✅ | URL base da Evolution API |
| `EVOLUTION_API_KEY` | ✅ | Chave de autenticação da Evolution API |
| `EVOLUTION_INSTANCE` | ✅ | Nome da instância WhatsApp na Evolution |
| `ANTHROPIC_API_KEY` | ✅ | Chave da API Anthropic (Claude) |
| `OPENAI_API_KEY` | ✅ | Chave da API OpenAI (GPT + Whisper) |
| `GOOGLE_AI_API_KEY` | ✅ | Chave da API Google AI (Gemini) |
| `ELEVENLABS_API_KEY` | ✅ | Chave da API ElevenLabs (TTS) |
| `ELEVENLABS_VOICE_ID` | ✅ | ID da voz configurada no ElevenLabs |
| `TAVILY_API_KEY` | ✅ | Chave da API Tavily (busca web fallback) |
| `RESEND_API_KEY` | ✅ | Chave da API Resend (e-mail) |
| `EMAIL_FROM` | ✅ | Endereço remetente dos e-mails |
| `STRIPE_SECRET_KEY` | — | Chave secreta Stripe (integração pendente) |
| `STRIPE_WEBHOOK_SECRET` | — | Secret do webhook Stripe |
| `ADMIN_SECRET` | ✅ | Bearer token para rotas admin |
| `BASE_URL` | — | URL base do portal do cuidador (padrão: http://localhost:8082) |
| `PORT` | — | Porta do servidor Express (padrão: 3000) |
| `NODE_ENV` | — | `development` ou `production` |

---

## 13. Deploy

### Backend — Railway
- Plataforma: Railway
- Comando de start: `node src/index.js`
- Redeploys são forçados via commits com mensagem `trigger: força redeploy railway`
- Variáveis de ambiente configuradas no painel do Railway

### Frontend / Portais — Vercel (planejado)
| Aplicação | Diretório | Status |
|---|---|---|
| Landing page | `landing/` | Planejado |
| Admin panel | `admin/` | Planejado |
| Portal do cuidador | Portal web | Planejado |

> **Nota:** Os frontends (`admin/`, `landing/`) estão planejados mas não estão no repositório atual. O backend já expõe a API REST para o portal do cuidador em `/caregiver/:token`.
