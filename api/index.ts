import express, { Request, Response } from 'express';
import crypto from 'crypto';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || 'pub_test_Q5y1A13a48e718105740360a8274640d';
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || 'test_integrity_SecretKeySample';
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || 'test_events_SecretKeySample';

const transactionStore: Record<string, {
  id: string;
  reference: string;
  status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'PENDING' | 'ERROR';
  amountInCents: number;
  currency: string;
  paymentMethodType?: string;
  updatedAt: string;
}> = {};

import fs from 'fs';

let globalAppStateStore: any = null;
const TMP_SYNC_FILE = '/tmp/gastrobar_state.json';

// Helper to load state from disk if lambda cold starts
function loadStateFromDisk() {
  if (globalAppStateStore) return globalAppStateStore;
  try {
    if (fs.existsSync(TMP_SYNC_FILE)) {
      const data = fs.readFileSync(TMP_SYNC_FILE, 'utf8');
      if (data) {
        globalAppStateStore = JSON.parse(data);
        return globalAppStateStore;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// =========================================================================
// 1. SINCRONIZACIÓN EN TIEMPO REAL (MESA / CARTA <-> POS)
// =========================================================================

app.get('/api/sync/state', (_req: Request, res: Response) => {
  const current = loadStateFromDisk();
  if (!current) {
    return res.status(200).json({ empty: true });
  }
  return res.json(current);
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

    try {
      fs.writeFileSync(TMP_SYNC_FILE, JSON.stringify(globalAppStateStore), 'utf8');
    } catch (e) {
      // ignore write errors on read-only environments
    }

    return res.json({ success: true, state: globalAppStateStore });
  } catch (err) {
    return res.status(500).json({ error: 'Error interno de sincronización' });
  }
});

// =========================================================================
// 2. WOMPI PASARELA DE PAGOS (FIRMA, WEBHOOK Y CONSULTAS)
// =========================================================================

// a) Generar firma de integridad Wompi
app.post('/api/wompi/signature', (req: Request, res: Response) => {
  try {
    const { reference, amountInCents, currency = 'COP' } = req.body;

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

// b) Webhook Wompi
app.post('/api/wompi-webhook', (req: Request, res: Response) => {
  try {
    const eventBody = req.body;
    if (!eventBody || !eventBody.data || !eventBody.data.transaction) {
      return res.status(400).json({ error: 'Estructura de evento Wompi inválida' });
    }

    const { transaction } = eventBody.data;
    const { signature, timestamp } = eventBody;

    if (signature && signature.properties && signature.checksum) {
      const properties: string[] = signature.properties;
      let concatenatedValues = '';

      for (const prop of properties) {
        const pathParts = prop.split('.');
        let val: any = eventBody.data;
        for (const part of pathParts) {
          if (val) val = val[part];
        }
        concatenatedValues += val !== undefined && val !== null ? val : '';
      }

      concatenatedValues += `${timestamp}${WOMPI_EVENTS_SECRET}`;

      const calculatedChecksum = crypto.createHash('sha256').update(concatenatedValues, 'utf8').digest('hex');

      if (calculatedChecksum.toLowerCase() !== signature.checksum.toLowerCase()) {
        return res.status(400).json({ error: 'Checksum de seguridad no coincide' });
      }
    }

    const reference = transaction.reference;
    const status = transaction.status;

    transactionStore[reference] = {
      id: transaction.id || `trans_${Date.now()}`,
      reference: reference,
      status: status,
      amountInCents: transaction.amount_in_cents || 0,
      currency: transaction.currency || 'COP',
      paymentMethodType: transaction.payment_method_type,
      updatedAt: new Date().toISOString()
    };

    return res.status(200).json({
      status: 'success',
      message: 'Evento webhook procesado correctamente',
      reference,
      transactionStatus: status
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error procesando webhook de Wompi' });
  }
});

// c) Consulta de estado de transacción Wompi
app.get('/api/wompi/transaction-status/:idOrRef', async (req: Request, res: Response) => {
  const { idOrRef } = req.params;

  let record = Object.values(transactionStore).find(
    t => t.id === idOrRef || t.reference === idOrRef
  );

  if (record) {
    return res.json(record);
  }

  try {
    const wompiRes = await fetch(`https://sandbox.wompi.co/v1/transactions/${idOrRef}`);
    if (wompiRes.ok) {
      const wompiData: any = await wompiRes.json();
      const tx = wompiData?.data;
      if (tx) {
        return res.json({
          id: tx.id,
          reference: tx.reference,
          status: tx.status,
          amountInCents: tx.amount_in_cents,
          currency: tx.currency,
          paymentMethodType: tx.payment_method_type,
          updatedAt: tx.created_at
        });
      }
    }
  } catch (err) {
    // ignore
  }

  return res.status(404).json({
    status: 'PENDING',
    reference: idOrRef,
    message: 'Transacción no encontrada o pendiente'
  });
});

// d) Simulación de aprobación Wompi
app.post('/api/wompi/simulate-approval', (req: Request, res: Response) => {
  const { reference, transactionId } = req.body;
  if (!reference) {
    return res.status(400).json({ error: 'Se requiere "reference"' });
  }

  const txId = transactionId || `wompi_sim_${Date.now()}`;
  transactionStore[reference] = {
    id: txId,
    reference,
    status: 'APPROVED',
    amountInCents: 85440000,
    currency: 'COP',
    paymentMethodType: 'NEQUI',
    updatedAt: new Date().toISOString()
  };

  return res.json({
    success: true,
    message: 'Aprobación de transacción simulada con éxito',
    transaction: transactionStore[reference]
  });
});

export default app;
