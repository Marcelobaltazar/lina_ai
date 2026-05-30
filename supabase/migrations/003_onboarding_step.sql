-- Adiciona controle de etapa do onboarding à tabela cus_users
-- Etapas: 'awaiting_name' → 'awaiting_diagnosis' → 'awaiting_try' → 'awaiting_payment' → 'done'
ALTER TABLE cus_users
  ADD COLUMN IF NOT EXISTS onboarding_step TEXT;
