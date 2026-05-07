import fs from 'fs';
import axios from 'axios';
import OpenAI from 'openai';

let _client = null;
const getClient = () => (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

const TMP_PATH = '/tmp/audio_temp.mp3';

export async function transcribeAudio(mediaUrl) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });

    fs.writeFileSync(TMP_PATH, Buffer.from(response.data));

    const result = await getClient().audio.transcriptions.create({
      file: fs.createReadStream(TMP_PATH),
      model: 'whisper-1',
      language: 'pt',
    });

    return result.text;
  } catch (err) {
    console.error('[audio] transcribeAudio', err);
    return null;
  } finally {
    try { fs.unlinkSync(TMP_PATH); } catch (_) {}
  }
}

export async function generateAudio(text) {
  try {
    console.log('[audio] elevenlabs key:', process.env.ELEVENLABS_API_KEY ? 'presente' : 'AUSENTE');
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;

    const response = await axios.post(
      url,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.6, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true },
      },
      {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        responseType: 'arraybuffer',
      },
    );

    return Buffer.from(response.data);
  } catch (err) {
    console.error('[audio] generateAudio', err.message);
    return null;
  }
}
