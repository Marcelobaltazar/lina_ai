import fs from 'fs';
import axios from 'axios';
import OpenAI, { toFile } from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

export async function transcribeAudio(mediaUrl) {
  const tmpPath = '/tmp/audio_temp.ogg';
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });
    fs.writeFileSync(tmpPath, Buffer.from(response.data));
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
    console.error('[audio] generateAudio erro:', err.message);
    return null;
  }
}
