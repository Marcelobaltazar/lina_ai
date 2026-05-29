# LINA.AI — Documentação de Produto

---

## 1. O que é a Lina

A Lina é uma companheira virtual para idosos que funciona direto no WhatsApp — sem precisar baixar nenhum aplicativo novo. Ela conversa como uma amiga, lembra o idoso de tomar os remédios nos horários certos, escuta áudios e responde, e fica disponível 24 horas por dia, todos os dias.

Para a família, a Lina funciona como uma extensão dos cuidados: envia um resumo semanal por e-mail sobre como o familiar esteve, avisa quando detecta sinais de tristeza ou bem-estar reduzido, e disponibiliza um portal web onde o cuidador pode acompanhar medicamentos e histórico.

A proposta não é substituir o contato humano — é preencher os espaços entre as ligações, as visitas e os cuidados do dia a dia.

---

## 2. Públicos

### Idoso
O usuário principal. Interage exclusivamente pelo WhatsApp, sem precisar instalar nada. A comunicação é sempre simples, curta e calorosa. Pode mandar texto ou áudio.

### Familiar / Cuidador
Acessa o portal web via link enviado por e-mail. Acompanha o bem-estar do idoso, gerencia medicamentos e recebe relatórios semanais e alertas de atenção.

### Operador (Marcelo)
Acessa o painel Admin. Gerencia todos os usuários, configura o modelo de LLM, edita o system prompt, gera links de cuidador e monitora alertas e assinaturas.

---

## 3. Canais

| Canal | Público | Tecnologia |
|---|---|---|
| WhatsApp | Idoso | Evolution API + número WhatsApp |
| Portal do cuidador | Familiar | API REST (`/caregiver/:token`) |
| Admin panel | Operador | Planejado — React |
| E-mail | Familiar | Resend |

---

## 4. Fluxo Completo do Idoso

### 4.1 Primeiro contato e onboarding

1. Idoso manda a primeira mensagem para o número da Lina no WhatsApp
2. A Lina identifica que é um usuário novo e cria um registro no banco
3. Responde: *"Oi! Que bom ter você aqui! 😊 Eu sou a Lina, sua nova companheira. Como posso te chamar?"*
4. O idoso responde com o nome (pode ser texto livre: "Sou a Dona Maria", "Pode me chamar de Zé")
5. A Lina usa GPT-4o-mini para extrair apenas o primeiro nome da mensagem
   - Se não conseguir identificar um nome → pede novamente: *"Desculpa, não entendi bem seu nome 😊 Como posso te chamar?"*
   - Se identificar → salva o nome e responde: *"Que nome lindo! Prazer, Maria! 💚 Pode me contar qualquer coisa — estou aqui pra isso."*

### 4.2 Conversa normal

Após o onboarding, todas as mensagens de texto ou áudio entram no fluxo normal:

- A Lina entende o contexto completo (quem é o idoso, seus familiares, hobbies, histórias de vida)
- Usa as últimas 8 mensagens como memória de curto prazo
- Usa memórias salvas de conversas anteriores quando são relevantes
- Pesquisa na internet quando a pergunta precisa de informação atualizada (ex: "como está o tempo hoje?", "o Flamengo ganhou ontem?")
- Responde sempre em linguagem simples, frases curtas, tom caloroso
- Nunca menciona IA, sistema, tecnologia ou recursos internos

**Sobre áudio:** quando o idoso manda um áudio, a Lina transcreve automaticamente e responde normalmente. Se não conseguir entender o áudio, simplesmente não responde (não envia mensagem de erro).

**Sobre imagem:** quando o idoso manda uma foto, a Lina analisa e comenta naturalmente.

**Delay humanizado:** antes de responder, a Lina aguarda entre 10 e 12 segundos (simulando uma pessoa digitando), com o indicador "digitando..." ativo no WhatsApp.

### 4.3 Cadastro de lembrete de medicamento pelo WhatsApp

O idoso pode cadastrar um lembrete conversando naturalmente. A Lina detecta quando a intenção é sobre remédio e inicia um fluxo de 2 perguntas:

**Exemplo de conversa:**
> Idoso: "Lina, me lembra de tomar o remédio da pressão"
> Lina: "Claro! 💊 Que horas você toma?"
> Idoso: "Às 8 da manhã e às 8 da noite"
> Lina: "É todo dia ou só alguns dias da semana?"
> Idoso: "Todo dia"
> Lina: "Pronto, Maria! ✅ Todo dia às 8h e às 20h vou te lembrar do remédio da pressão 💊"

A Lina entende variações naturais de horário ("oito da manhã", "20h", "oito e meia da noite") e de dias ("todo dia", "dias úteis", "segunda e quarta").

O cuidador também pode cadastrar medicamentos com mais detalhes (nome genérico, dosagem, médico, etc.) pelo portal web.

### 4.4 Recebimento de lembrete e confirmação

No horário cadastrado, a Lina envia automaticamente:
> *"💊 Hora do remédio! Está na hora de tomar o remédio da pressão, Maria! Já tomou? Me responde aqui 😊"*

O idoso pode responder de 3 formas, e a Lina entende todas:
- **Tomou:** "Sim!", "Já tomei", "Tomei sim" → Lina confirma e registra
- **Esqueceu:** "Ai, esqueci" → Lina registra como pendente
- **Avisou alguém:** "Falei pro meu filho" → Lina registra e encerra

### 4.5 Reenvio após 30 minutos e marcação como ignorado

- Se o idoso não responder em 30 minutos → Lina reenvia uma vez: *"Oi Maria! 😊 Só passando pra lembrar do remédio da pressão — você conseguiu tomar? Me conta!"*
- Se ainda não responder em 60 minutos do envio original → lembrete é marcado como "ignorado" no sistema

### 4.6 Modelo freemium

| Evento | Ação |
|---|---|
| Mensagens 1–12 | Conversa normalmente, sem aviso |
| Mensagem 13 | Aviso: *"Maria, que bom que você está aqui! 😊 Só pra te avisar — nossas mensagens gratuitas estão quase no fim. Mas não se preocupe, continuar é muito simples! Me manda 'quero continuar' quando quiser e eu te explico tudo 💚"* |
| Mensagem 15 | Paywall: *"Maria, adorei conversar com você! 😊 Minhas mensagens gratuitas acabaram por hoje. Para continuar é só me falar 'quero continuar' que eu te ajudo com tudo! 💚"* |
| Idoso digita "quero continuar" (ou similar) | Lina responde com informações de pagamento (R$29,90/mês, Pix ou cartão) |

---

## 5. Fluxo Completo do Familiar / Cuidador

### 5.1 Como acessa o portal

1. O operador (ou o próprio sistema) gera um link de acesso pelo painel admin
2. O familiar recebe um e-mail com o link personalizado: *"Seu link exclusivo para acompanhar e cuidar de Maria pela Lina"*
3. Clica no link e acessa o portal — sem cadastro, sem senha

O link é baseado em um token UUID único e pode ser regenerado a qualquer momento.

### 5.2 O que vê e pode fazer no portal

**Painel principal:**
- Nome e dados do familiar idoso
- Stats da semana: total de mensagens enviadas, dias ativos, remédios confirmados vs total, sinais de atenção

**Medicamentos:**
- Lista todos os medicamentos cadastrados
- Pode adicionar novos medicamentos com informações detalhadas: nome, nome genérico, fabricante, dosagem, forma, horários, dias, médico responsável, instruções especiais
- Pode editar medicamentos existentes
- Pode desativar medicamentos (soft delete — mantém histórico)

### 5.3 Relatório semanal por e-mail

Todo Monday às 8h (horário de Brasília), o familiar com relatório ativado recebe um e-mail com:
- Total de mensagens que o idoso trocou com a Lina na semana
- Quantos dias esteve ativo
- Quantos remédios foram confirmados vs total de lembretes
- Um parágrafo gerado por IA descrevendo como foi a semana em linguagem calorosa
- Aviso em destaque se houve sinais de momentos mais delicados (tristeza, solidão)

### 5.4 Alertas de bem-estar

Quando a Lina detecta sinais preocupantes em tempo real (tristeza profunda, solidão extrema, risco de queda, saúde crítica), ela:
1. Registra internamente
2. Envia um e-mail imediato ao familiar: *"A Lina identificou um possível momento que merece atenção nas conversas de Maria hoje"* — com o tipo e contexto do alerta
3. Inclui um aviso: *"Isso é apenas um indício, não um diagnóstico. Pode valer uma ligadinha carinhosa. 💚"*

Alertas são classificados por severidade. Apenas alertas de alta severidade disparam notificação imediata por e-mail.

---

## 6. Fluxo do Operador (Admin Panel)

O painel admin está planejado. O backend já tem a API e middleware de autenticação (`ADMIN_SECRET`). O que está especificado para o painel:

### 6.1 Dashboard
- Total de usuários ativos
- Mensagens nas últimas 24h / 7 dias
- Alertas abertos
- Receita do mês

### 6.2 Gerenciamento de usuários
- Listar todos os usuários com status, mensagens usadas, data de cadastro
- Ver histórico de conversas de um usuário
- Bloquear / desbloquear usuário
- Alterar status (trial → active)

### 6.3 Configuração do LLM (sem redeploy)
A troca de modelo de IA é feita diretamente pelo painel, via tabela `cfg_llm_config`. O operador pode:
- Trocar o provider: Claude, OpenAI ou Gemini
- Trocar o modelo específico (ex: `claude-sonnet-4-6` → `claude-opus-4-7`)
- Ajustar temperatura e limite de tokens
- Editar o system prompt que define a personalidade da Lina

A mudança tem efeito imediato — a próxima mensagem já usa o novo modelo.

### 6.4 Geração de link do cuidador
- Selecionar um familiar cadastrado
- Gerar token de acesso
- Sistema envia e-mail automático com o link

---

## 7. Sistema de Memória — Explicado em Linguagem de Produto

A Lina tem dois tipos de memória:

**Memória de curto prazo (8 mensagens):** a Lina lembra do que foi dito na conversa atual e nas últimas mensagens recentes. Funciona como qualquer conversa normal.

**Memória de longo prazo (memórias permanentes):** a cada conversa, a Lina automaticamente anota os fatos importantes que aprendeu sobre o idoso — que a Maria gosta de fazer bolo, que o José tem um neto chamado Pedro, que a Dona Ana passou por uma cirurgia. Esses fatos ficam salvos e são usados nas próximas conversas quando fazem sentido.

Exemplo: se na segunda-feira o idoso conta que vai à missa com a neta, e na quarta-feira começa a conversa com "hoje foi um dia diferente", a Lina pode perguntar naturalmente como foi a missa — porque lembrou.

Isso faz a conversa parecer com a de alguém que realmente conhece e se importa com o idoso, não um chatbot que esquece tudo a cada mensagem.

---

## 8. Busca na Internet — Explicado em Linguagem de Produto

A Lina sabe quando precisa de informação atualizada para responder bem. Se o idoso perguntar "como está o tempo hoje?", "o Flamengo ganhou ontem?" ou "quanto está o dólar?", a Lina busca na internet antes de responder — e traz a informação de forma natural, sem mencionar que pesquisou.

Para perguntas sobre o dia a dia, sentimentos, histórias e conversas, a Lina responde direto da sua própria memória e contexto, sem precisar buscar nada.

---

## 9. Modelos de LLM Disponíveis

| Provider | Modelos típicos | Melhor para |
|---|---|---|
| **Claude (padrão)** | `claude-sonnet-4-6`, `claude-opus-4-7` | Conversas mais naturais, melhor compreensão de nuances em português |
| **OpenAI** | `gpt-4o-mini`, `gpt-4o`, `gpt-4o-search-preview` | Classificações internas, extração de dados, busca web |
| **Gemini** | `gemini-2.0-flash` | Alternativa econômica; busca web via Google Search nativo |

O modelo padrão em produção é `claude-sonnet-4-6`. A troca é feita pelo painel admin sem redeploy.

Para tarefas internas (classificar intenção, extrair nome, avaliar memórias), o sistema sempre usa `gpt-4o-mini` independente do modelo principal — é mais rápido e barato para decisões binárias.

---

## 10. Planos e Preços

| Plano | Preço | Detalhes |
|---|---|---|
| Gratuito (trial) | R$0 | 15 mensagens; após isso, paywall |
| Mensal | R$29,90/mês | Mensagens ilimitadas; Pix ou cartão |

A integração de pagamento com Stripe está estruturada no backend mas ainda não está ativa. O fluxo atual de conversão mostra as informações de pagamento manualmente quando o idoso diz que quer continuar.

---

## 11. O que está funcionando hoje vs o que está pendente

### Funcionando em produção

- ✅ Receber mensagens de texto do WhatsApp e responder via LLM
- ✅ Receber e transcrever áudios do WhatsApp (Whisper)
- ✅ Analisar imagens enviadas pelo idoso (Claude Vision)
- ✅ Onboarding com extração inteligente de nome
- ✅ Memória de longo prazo (extração e busca semântica)
- ✅ Busca web quando necessário (GPT-search, Gemini+Google, Tavily)
- ✅ Lembretes de medicamento com reenvio e marcação de ignorado
- ✅ Fluxo conversacional de cadastro de remédio pelo WhatsApp
- ✅ Confirmação de medicamento tomado / esquecido / avisou alguém
- ✅ Detecção de alertas de bem-estar e notificação por e-mail
- ✅ Relatório semanal por e-mail para familiares
- ✅ Reengajamento automático após 3 dias sem conversa
- ✅ Controle freemium (15 mensagens grátis, aviso na 13ª, paywall na 15ª)
- ✅ Sistema de LLM plugável — troca de modelo sem redeploy
- ✅ API REST para portal do cuidador (gerenciamento de medicamentos)
- ✅ Delay humanizado antes de responder (simula digitação)

### Pendente / em desenvolvimento

- ⏳ Integração de pagamento Stripe (endpoint existe, não processa)
- ⏳ Admin panel (React) — backend pronto, frontend não existe
- ⏳ Portal do cuidador (interface web) — API pronta, frontend não existe
- ⏳ Landing page
- ⏳ Resposta em áudio via ElevenLabs (`audio_mode` existe mas não está ativado por padrão)
- ⏳ Notificações push para o cuidador
- ⏳ Relatórios mais detalhados no portal

---

## 12. Riscos Conhecidos e Mitigações

### Risco: áudio não transcrito
- **Problema:** arquivo de áudio do WhatsApp vem criptografado; a descriptografia pode falhar
- **Mitigação:** 3 tentativas em cascata (URL com auth, URL sem auth, Evolution API); se tudo falhar, salva `[áudio não transcrito]` e não responde — o idoso pode reenviar ou mandar por texto

### Risco: LLM fora do ar
- **Problema:** provider principal pode falhar ou ter timeout
- **Mitigação:** fallback automático para Claude se outro provider falhar; erros de API externa nunca travam o fluxo principal — sempre há try/catch

### Risco: nome errado no onboarding
- **Problema:** idoso pode responder de forma confusa ("sou eu sim, pode me chamar de qualquer coisa")
- **Mitigação:** GPT-4o-mini extrai o nome com temperatura 0; se não encontrar um nome claro, retorna `null` e a Lina pede novamente sem salvar nada

### Risco: falso alerta para familiar
- **Problema:** LLM pode interpretar errado e acionar alerta desnecessário
- **Mitigação:** e-mail de alerta explicitamente diz *"isso é apenas um indício, não um diagnóstico"*; apenas alertas `high` disparam e-mail imediato

### Risco: lembrete enviado em horário errado (timezone)
- **Problema:** servidor pode estar em UTC mas horários do idoso são em São Paulo
- **Mitigação:** função `nowInSaoPaulo()` usa `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'`; todos os cron jobs também têm `timezone: 'America/Sao_Paulo'`

### Risco: mensagem duplicada de lembrete
- **Problema:** cron roda a cada minuto; poderia enviar lembrete múltiplas vezes no mesmo minuto
- **Mitigação:** antes de enviar, verifica se já existe um log com `scheduled_at` no último minuto para aquele medicamento

### Risco: payload grande de áudio travando o servidor
- **Problema:** áudio em base64 pode ser muito grande
- **Mitigação:** body parser configurado com limite de 50mb (`express.json({ limit: '50mb' })`)
