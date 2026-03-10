import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { mediaRouter } from './telegram-media.js';

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(express.static('.'));
app.use('/api/media', mediaRouter);

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`[Flow] Server running on http://localhost:${PORT}`);
});