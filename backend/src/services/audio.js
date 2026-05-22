import fs from 'fs';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function transcribeAudio(data) {
  const tmpPath = `/tmp/audio_lina_${Date.now()}.ogg`;
  try {
    const mediaUrl = data?.message?.audioMessage?.url;
    console.log('[audio] iniciando transcrição, url:', mediaUrl?.slice(0, 80));

    let buffer = null;

    // Tentativa 1: URL direta com apikey
    if (mediaUrl?.startsWith('http')) {
      try {
        console.log('[audio] tentativa 1: download com apikey...');
        const res = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          headers: { apikey: process.env.EVOLUTION_API_KEY },
        });
        buffer = res.data;
        console.log('[audio] tentativa 1 ok, tamanho:', buffer.byteLength, 'bytes');
      } catch (e) {
        console.log('[audio] tentativa 1 falhou:', e.message);
      }
    }

    // Tentativa 2: URL direta sem headers
    if (!buffer && mediaUrl?.startsWith('http')) {
      try {
        console.log('[audio] tentativa 2: download sem headers...');
        const res = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
        buffer = res.data;
        console.log('[audio] tentativa 2 ok, tamanho:', buffer.byteLength, 'bytes');
      } catch (e) {
        console.log('[audio] tentativa 2 falhou:', e.message);
      }
    }

    // Tentativa 3: getBase64FromMediaMessage via Evolution API
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
      console.log('[audio] tentativa 3 ok, tamanho:', buffer.byteLength, 'bytes');
    }

    console.log('[audio] arquivo baixado, tamanho:', buffer.byteLength, 'bytes');
    console.log('[audio] primeiros bytes (hex):', Buffer.from(buffer).slice(0, 8).toString('hex'));

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
