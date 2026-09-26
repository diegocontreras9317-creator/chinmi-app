import express, { Request, Response } from 'express';
import crypto from 'crypto';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

let globalAppStateStore: any = null;

app.get('/api/sync/state', (_req: Request, res: Response) => {
  if (!globalAppStateStore) {
    return res.status(404).json({ message: 'Sin estado previo en servidor' });
  }
  return res.json(globalAppStateStore);
});

app.post('/api/sync/state', (req: Request, res: Response) => {
  try {
    const payload = req.body;
    if (!payload || !Array.isArray(payload.tables)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    globalAppStateStore = {
      ...payload,
      lastModified: new Date().toISOString()
    };

    return res.json({ success: true, state: globalAppStateStore });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno de sincronización' });
  }
});

// Wompi Signature
app.post('/api/wompi/signature', (req: Request, res: Response) => {
  try {
    const { reference, amountInCents, currency = 'COP' } = req.body;
    const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || 'pub_test_Q5y1A13a48e718105740360a8274640d';
    const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || 'test_integrity_SecretKeySample';

    if (!reference || amountInCents === undefined) {
      return res.status(400).json({ error: 'Se requieren "reference" y "amountInCents"' });
    }

    const parsedAmount = Math.round(Number(amountInCents));
    const rawString = `${reference}${parsedAmount}${currency}${WOMPI_INTEGRITY_SECRET}`;
    const signature = crypto.createHash('sha256').update(rawString, 'utf8').digest('hex');

    return res.json({
      signature,
      reference,
      amountInCents: parsedAmount,
      currency,
      publicKey: WOMPI_PUBLIC_KEY,
      testMode: WOMPI_PUBLIC_KEY.startsWith('pub_test_')
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error generando firma Wompi' });
  }
});

export default app;
