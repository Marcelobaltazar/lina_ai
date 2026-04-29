import fs from 'fs';
import axios from 'axios';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TMP_PATH = '/tmp/audio_temp.ogg';

/**
 * Downloads audio from mediaUrl, saves to /tmp, transcribes via Whisper.
 * @param {string} mediaUrl
 * @returns {Promise<string|null>}
 */
export async function transcribeAudio(mediaUrl) {
  try {
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      headers: { apikey: process.env.EVOLUTION_API_KEY },
    });

    fs.writeFileSync(TMP_PATH, Buffer.from(response.data));

    const result = await openai.audio.transcriptions.create({
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

/**
 * Generates speech from text via ElevenLabs REST API.
 * Never throws — returns null on any failure so caller can fall back to text.
 * @param {string} text
 * @returns {Promise<Buffer|null>}
 */
export async function generateAudio(text) {
  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`;

    const response = await axios.post(
      url,
      {
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.6,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      },
    );

    return Buffer.from(response.data);
  } catch (err) {
    console.error('[audio] generateAudio', err.message);
    return null;
  }
}
