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

const EPAYCO_P_CUST_ID_CLIENTE = process.env.EPAYCO_P_CUST_ID_CLIENTE || '';
const EPAYCO_P_KEY = process.env.EPAYCO_P_KEY || '';

const epaycoTransactionStore: Record<string, any> = {};

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
// 2. EPAYCO PASARELA DE PAGOS (WEBHOOK DE CONFIRMACIÓN Y VALIDACIÓN)
// =========================================================================

app.all('/api/epayco/confirmation', (req: Request, res: Response) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };
    const {
      x_ref_payco = '',
      x_transaction_id = '',
      x_amount = '0',
      x_currency_code = 'COP',
      x_signature = '',
      x_cod_response,
      x_response = '',
      x_response_reason_text = '',
      x_id_invoice = '',
      x_description = '',
      x_tax = '0',
      x_tax_ico = '0',
      x_tax_base = '0',
      x_extra1 = '',
      x_extra2 = '',
      x_extra3 = ''
    } = payload;

    if (!x_id_invoice && !x_ref_payco) {
      return res.status(400).json({ error: 'Payload de confirmación de ePayco incompleto' });
    }

    if (EPAYCO_P_CUST_ID_CLIENTE && EPAYCO_P_KEY && x_signature) {
      const rawSignature = `${EPAYCO_P_CUST_ID_CLIENTE}^${EPAYCO_P_KEY}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`;
      const expectedSignature = crypto
        .createHash('sha256')
        .update(rawSignature, 'utf8')
        .digest('hex');

      if (expectedSignature.toLowerCase() !== String(x_signature).toLowerCase()) {
        return res.status(400).json({ error: 'Firma de seguridad x_signature inválida' });
      }
    }

    const codResponse = Number(x_cod_response);
    const record = {
      x_ref_payco: String(x_ref_payco),
      x_id_invoice: String(x_id_invoice),
      x_description: String(x_description),
      x_amount: String(x_amount),
      x_tax: String(x_tax),
      x_tax_ico: String(x_tax_ico),
      x_tax_base: String(x_tax_base),
      x_currency_code: String(x_currency_code),
      x_cod_response: codResponse,
      x_response: String(x_response),
      x_response_reason_text: String(x_response_reason_text),
      x_transaction_id: String(x_transaction_id),
      x_extra1: String(x_extra1),
      x_extra2: String(x_extra2),
      x_extra3: String(x_extra3),
      updatedAt: new Date().toISOString()
    };

    if (x_id_invoice) {
      epaycoTransactionStore[String(x_id_invoice)] = record;
    }
    if (x_ref_payco) {
      epaycoTransactionStore[String(x_ref_payco)] = record;
    }

    return res.status(200).json({
      success: true,
      invoice: x_id_invoice,
      cod_response: codResponse
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error procesando webhook de ePayco' });
  }
});

app.get('/api/epayco/status/:invoiceOrRef', (req: Request, res: Response) => {
  const { invoiceOrRef } = req.params;
  const tx = epaycoTransactionStore[invoiceOrRef];
  if (tx) {
    return res.json({ found: true, transaction: tx });
  }
  return res.status(404).json({ found: false });
});

app.get('/api/epayco/validate/:refPayco', async (req: Request, res: Response) => {
  const { refPayco } = req.params;
  try {
    const epaycoRes = await fetch(
      `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(refPayco)}`
    );
    const data = await epaycoRes.json();
    return res.status(epaycoRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ success: false, error: 'Error validando referencia con ePayco' });
  }
});

export default app;
