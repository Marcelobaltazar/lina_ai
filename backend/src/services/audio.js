import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';

function decryptWhatsAppMedia(encryptedBuffer, mediaKeyBase64) {
  const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
  if (mediaKey.length !== 32) {
    throw new Error(`mediaKey inválida, esperava 32 bytes, recebeu ${mediaKey.length}`);
  }

  const derived = Buffer.from(
    crypto.hkdfSync('sha256', mediaKey, Buffer.alloc(0), Buffer.from('WhatsApp Audio Keys'), 112)
  );
  const iv = derived.subarray(0, 16);
  const cipherKey = derived.subarray(16, 48);

  const encBuf = Buffer.from(encryptedBuffer);
  const ciphertext = encBuf.subarray(0, encBuf.length - 10);

  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function transcribeAudio(data) {
  const tmpPath = `/tmp/audio_lina_${Date.now()}.ogg`;
  try {
    const mediaUrl = data?.message?.audioMessage?.url;
    const mediaKey = data?.message?.audioMessage?.mediaKey;
    console.log('[audio] iniciando transcrição, url:', mediaUrl?.slice(0, 80));
    console.log('[audio] mediaKey presente:', !!mediaKey);

    let buffer = null;
    let needsDecrypt = false;

    // Tentativa 1: URL direta com apikey (vem criptografado)
    if (mediaUrl?.startsWith('http')) {
      try {
        console.log('[audio] tentativa 1: download com apikey...');
        const res = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          headers: { apikey: process.env.EVOLUTION_API_KEY },
        });
        buffer = res.data;
        needsDecrypt = true;
        console.log('[audio] tentativa 1 ok, tamanho:', buffer.byteLength, 'bytes');
      } catch (e) {
        console.log('[audio] tentativa 1 falhou:', e.message);
      }
    }

    // Tentativa 2: URL direta sem headers (vem criptografado)
    if (!buffer && mediaUrl?.startsWith('http')) {
      try {
        console.log('[audio] tentativa 2: download sem headers...');
        const res = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        buffer = res.data;
        needsDecrypt = true;
        console.log('[audio] tentativa 2 ok, tamanho:', buffer.byteLength, 'bytes');
      } catch (e) {
        console.log('[audio] tentativa 2 falhou:', e.message);
      }
    }

    // Tentativa 3: getBase64FromMediaMessage (Evolution já descriptografa)
    if (!buffer) {
      console.log('[audio] tentativa 3: getBase64FromMediaMessage...');
      const evolutionUrl = `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`;
      const { data: mediaData } = await axios.post(
        evolutionUrl,
        { message: { key: data.key, message: data.message }, convertToMp4: false },
        { headers: { apikey: process.env.EVOLUTION_API_KEY } },
      );
      const base64 = mediaData?.base64;
      if (!base64) throw new Error('base64 vazio na resposta da Evolution API');
      buffer = Buffer.from(base64, 'base64');
      needsDecrypt = false;
      console.log('[audio] tentativa 3 ok, tamanho:', buffer.byteLength, 'bytes');
    }

    console.log('[audio] arquivo baixado, tamanho:', buffer.byteLength, 'bytes');
    console.log('[audio] primeiros bytes (hex):', Buffer.from(buffer).subarray(0, 8).toString('hex'));

    // Descriptografa se veio direto da URL do WhatsApp (.enc)
    if (needsDecrypt && mediaKey) {
      console.log('[audio] descriptografando com mediaKey...');
      buffer = decryptWhatsAppMedia(buffer, mediaKey);
      console.log('[audio] descriptografado, tamanho:', buffer.byteLength, 'bytes');
      console.log('[audio] primeiros bytes pós-decrypt (hex):', buffer.subarray(0, 8).toString('hex'));
    } else if (needsDecrypt && !mediaKey) {
      console.log('[audio] aviso: arquivo veio criptografado mas mediaKey ausente');
    }

    fs.writeFileSync(tmpPath, Buffer.from(buffer));
    console.log('[audio] arquivo salvo em:', tmpPath);

    const file = await toFile(fs.createReadStream(tmpPath), 'audio.ogg', { type: 'audio/ogg' });
    const result = await getClient().audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });

    const text = result.text?.trim() || '';
    console.log('[audio] transcrição obtida:', text.slice(0, 100));

    if (!text) {
      console.log('[audio] transcrição vazia');
      return null;
    }

    return text;
  } catch (err) {
    console.error('[audio] transcribeAudio erro:', err.message);
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

export async function generateAudio(text) {
  try {
    const key = process.env.ELEVENLABS_API_KEY || '';
    console.log('[audio] elevenlabs key length:', key.length, '| início:', key.slice(0, 6), '| fim:', key.slice(-4));
    console.log('[audio] voice_id:', process.env.ELEVENLABS_VOICE_ID);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;
    const response = await axios.post(url, {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
    }, {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  } catch (err) {
    const body = err.response?.data ? Buffer.from(err.response.data).toString('utf8') : '';
    console.error('[audio] generateAudio erro:', err.message, '| body:', body);
    return null;
  }
}
