-- Lina.AI — RAG da base de conhecimento sobre diabetes
-- Habilita pgvector e cria a tabela de chunks + busca semântica.

-- Habilita pgvector
create extension if not exists vector;

-- Tabela de chunks do PDF
create table if not exists lina_knowledge (
  id uuid primary key default gen_random_uuid(),
  source text default 'guia_diabetes',
  chunk_index integer,
  content text,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Index para busca semântica
create index if not exists lina_knowledge_embedding_idx
on lina_knowledge
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Função de busca semântica
create or replace function match_knowledge(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from lina_knowledge
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
