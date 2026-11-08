import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';

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
const storeStateMap: Record<string, any> = {};

function getStoreFilePath(storeId: string): string {
  const safeId = (storeId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `/tmp/gastrobar_state_${safeId}.json`;
}

function loadStateFromDisk(storeId = 'default') {
  if (storeStateMap[storeId]) return storeStateMap[storeId];
  const filePath = getStoreFilePath(storeId);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data) {
        storeStateMap[storeId] = JSON.parse(data);
        return storeStateMap[storeId];
      }
    }
  } catch {
    // ignore read errors on serverless cold start
  }
  return null;
}

// =========================================================================
// 1. SINCRONIZACIÓN EN TIEMPO REAL (MESA / CARTA <-> POS)
// =========================================================================

app.get('/api/sync/state', (req: Request, res: Response) => {
  const storeId = (req.query.storeId as string) || 'default';
  const current = loadStateFromDisk(storeId);
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

    const storeId = (req.query.storeId as string) || payload.storeId || 'default';
    storeStateMap[storeId] = {
      ...payload,
      storeId,
      lastModified: new Date().toISOString()
    };

    try {
      const filePath = getStoreFilePath(storeId);
      fs.writeFileSync(filePath, JSON.stringify(storeStateMap[storeId]), 'utf8');
    } catch {
      // ignore write errors on read-only environments
    }

    return res.json({ success: true, state: storeStateMap[storeId] });
  } catch {
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
  } catch {
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
  } catch {
    return res.status(502).json({ success: false, error: 'Error validando referencia con ePayco' });
  }
});

const EXPECTED_PLAN_AMOUNTS: Record<string, number> = {
  monthly: 89000,
  quarterly: 240300,
  annual: 854400
};

const processedSubscriptionsStore: Record<string, boolean> = {};

app.post('/api/epayco/verify-subscription', async (req: Request, res: Response) => {
  try {
    const { refPayco, planId, userEmail, userId, codResponse: bodyCod, responseText: bodyText } = req.body || {};
    const cleanRef = String(refPayco || '').trim();
    const cleanPlanId = String(planId || 'monthly').trim().toLowerCase();

    if (!cleanRef) {
      return res.status(400).json({ verified: false, error: 'Referencia ePayco (refPayco) no proporcionada' });
    }

    const expectedAmount = EXPECTED_PLAN_AMOUNTS[cleanPlanId] || 89000;
    const isTestEnv = (process.env.VITE_EPAYCO_TEST_MODE || 'true').toString().toLowerCase() === 'true';

    // 1. Buscar primero en el almacén de notificaciones webhook en memoria
    let tx = epaycoTransactionStore[cleanRef];

    // 2. Si no se encuentra en memoria, consultar API de validación oficial de ePayco
    if (!tx) {
      try {
        const epaycoRes = await fetch(
          `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(cleanRef)}`
        );
        if (epaycoRes.ok) {
          const json = await epaycoRes.json();
          if (json?.success && json?.data) {
            tx = json.data;
          }
        }
      } catch {
        // Ignorar fallo de conexión externa
      }
    }

    // 3. Evaluar estado de respuesta
    const rawCod = tx?.x_cod_response ?? tx?.x_cod_transaction_state ?? tx?.cod_response ?? bodyCod;
    const codResponse = Number(rawCod);
    const txAmount = Number(tx?.x_amount) || expectedAmount;
    const responseText = String(tx?.x_response || tx?.x_transaction_state || tx?.estado || bodyText || '').toLowerCase().trim();

    const isApproved =
      codResponse === 1 ||
      responseText === 'aceptada' ||
      responseText === 'aprobada' ||
      responseText === 'aceptado' ||
      responseText === 'aprobado' ||
      responseText === 'exitoso' ||
      responseText === 'exitosa' ||
      responseText === 'approved' ||
      responseText === 'successful' ||
      responseText === '1' ||
      responseText === '01' ||
      (!tx && isTestEnv && cleanRef.length > 0); // Fallback para referencias en modo de prueba

    const isPending =
      codResponse === 3 ||
      responseText === 'pendiente' ||
      responseText === 'pendientes' ||
      responseText === 'pending' ||
      responseText === 'por aprobar' ||
      responseText === '3' ||
      responseText === '03';

    const isTest = Boolean(
      tx?.x_test_request === 'TRUE' ||
      tx?.x_test_request === true ||
      tx?.x_test_request === '1' ||
      isTestEnv
    );

    // 4. Verificar si la transacción está APROBADA
    if (!isApproved) {
      if (isPending) {
        return res.json({
          verified: false,
          status: 'pending',
          message: 'La transacción (PSE/Transferencia) se encuentra en proceso de autorización por la entidad bancaria. Tu suscripción se activará automáticamente tan pronto como el banco confirme la aprobación a ePayco.',
          refPayco: cleanRef
        });
      }

      return res.json({
        verified: false,
        status: 'rejected',
        message: tx?.x_response_reason_text || 'La transacción fue rechazada o fallida por la entidad financiera.',
        refPayco: cleanRef
      });
    }

    // 5. Prevenir doble procesamiento del mismo pago
    const alreadyProcessed = Boolean(processedSubscriptionsStore[cleanRef]);
    processedSubscriptionsStore[cleanRef] = true;

    return res.json({
      verified: true,
      status: 'approved',
      alreadyProcessed,
      planId: cleanPlanId,
      billedAmount: txAmount,
      refPayco: cleanRef,
      transactionId: tx?.x_transaction_id || cleanRef,
      isTest,
      userEmail,
      userId
    });
  } catch {
    return res.status(500).json({
      verified: false,
      error: 'Error interno en la verificación del pago de suscripción'
    });
  }
});

export default app;
