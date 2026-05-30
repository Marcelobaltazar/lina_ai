import 'dotenv/config';
import OpenAI from 'openai';
// Importa o lib interno direto — o entry principal do pdf-parse roda código
// de teste quando executado como módulo principal.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import getSupabase from '../src/lib/supabase.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const SOURCE = 'guia_diabetes';
const CHUNK_TARGET_WORDS = 500; // ~500 tokens
const CHUNK_OVERLAP_WORDS = 50; // overlap de ~50 tokens

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Divide o texto em chunks de ~500 palavras com overlap de ~50.
 * Agrupa por parágrafo até atingir o alvo; ao fechar um chunk, leva
 * as últimas ~50 palavras para o próximo (overlap).
 */
function chunkText(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join(' '));
    current = current.slice(-CHUNK_OVERLAP_WORDS); // mantém overlap
  };

  for (const para of paragraphs) {
    const words = para.split(' ');
    for (const w of words) {
      current.push(w);
      if (current.length >= CHUNK_TARGET_WORDS) flush();
    }
  }

  // último chunk (só se tiver conteúdo além do overlap herdado)
  if (current.length > CHUNK_OVERLAP_WORDS || (chunks.length === 0 && current.length > 0)) {
    chunks.push(current.join(' '));
  }

  return chunks;
}

async function embed(text) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

async function main() {
  const bucketPath = process.env.PDF_BUCKET_PATH;
  if (!bucketPath) {
    throw new Error('[ingest] PDF_BUCKET_PATH é obrigatório (formato: bucket/caminho/arquivo.pdf)');
  }

  const [bucket, ...rest] = bucketPath.split('/');
  const filePath = rest.join('/');
  if (!bucket || !filePath) {
    throw new Error(`[ingest] PDF_BUCKET_PATH inválido: '${bucketPath}'. Use 'bucket/arquivo.pdf'`);
  }

  const supabase = getSupabase();

  console.log(`[ingest] baixando '${filePath}' do bucket '${bucket}'...`);
  const { data: file, error: dlErr } = await supabase.storage.from(bucket).download(filePath);
  if (dlErr) throw new Error(`[ingest] falha ao baixar PDF: ${dlErr.message}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  console.log(`[ingest] PDF baixado (${(buffer.length / 1024).toFixed(0)} KB). Extraindo texto...`);

  const parsed = await pdfParse(buffer);
  const text = (parsed.text || '').trim();
  if (!text) throw new Error('[ingest] PDF sem texto extraível');

  const chunks = chunkText(text);
  console.log(`[ingest] texto dividido em ${chunks.length} chunks.`);

  // Limpa ingestões anteriores desta mesma fonte para evitar duplicação
  const { error: delErr } = await supabase.from('lina_knowledge').delete().eq('source', SOURCE);
  if (delErr) console.error('[ingest] aviso ao limpar chunks antigos:', delErr.message);

  let saved = 0;
  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const embedding = await embed(content);

    const { error: insErr } = await supabase.from('lina_knowledge').insert({
      source: SOURCE,
      chunk_index: i,
      content,
      embedding,
    });
    if (insErr) {
      console.error(`[ingest] erro ao salvar chunk ${i}:`, insErr.message);
    } else {
      saved++;
    }
    console.log(`Chunk ${i + 1}/${chunks.length} processado`);
  }

  console.log(`Ingestão completa: ${saved} chunks salvos`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
