import fs from 'fs';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function transcribeAudio(data) {
  const tmpPath = '/tmp/audio_temp.ogg';
  try {
    // Evolution API returns encrypted audio at the message URL.
    // The correct way to get the decrypted media is via getBase64FromMediaMessage.
    const evolutionUrl = `${process.env.EVOLUTION_API_URL}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE}`;
    const { data: mediaData } = await axios.post(
      evolutionUrl,
      { message: { key: data.key, message: data.message }, convertToMp4: false },
      { headers: { apikey: process.env.EVOLUTION_API_KEY } },
    );

    const base64 = mediaData?.base64;
    if (!base64) throw new Error('base64 vazio na resposta da Evolution API');

    console.log('[audio] base64 recebido, tamanho:', base64.length);

    const buffer = Buffer.from(base64, 'base64');
    console.log('[audio] primeiros bytes:', buffer.slice(0, 16).toString('hex'));
    fs.writeFileSync(tmpPath, buffer);

    const file = await toFile(fs.createReadStream(tmpPath), 'audio.ogg', { type: 'audio/ogg' });
    const result = await getClient().audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });

    return result.text;
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
