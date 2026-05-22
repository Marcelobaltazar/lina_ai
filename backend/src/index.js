import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { evolutionWebhook } from './webhooks/evolution.js';
import caregiverRouter from './routes/caregiver.js';
import './jobs/cron.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.post('/webhook/evolution', evolutionWebhook);
app.use('/caregiver', caregiverRouter);

app.post('/webhook/stripe', (_req, res) => res.sendStatus(200));

app.listen(PORT, () => {
  console.log(`[lina] backend running on port ${PORT}`);
});
