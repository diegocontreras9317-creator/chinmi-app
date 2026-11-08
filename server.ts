import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware para permitir peticiones tanto desde la web como desde la App Móvil Android (Capacitor)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configuración opcional de firma de confirmación de ePayco (P_CUST_ID_CLIENTE y P_KEY)
const EPAYCO_P_CUST_ID_CLIENTE = process.env.EPAYCO_P_CUST_ID_CLIENTE || '';
const EPAYCO_P_KEY = process.env.EPAYCO_P_KEY || '';

// Almacén en memoria para estado de confirmaciones de ePayco
const epaycoTransactionStore: Record<string, {
  x_ref_payco: string;
  x_id_invoice: string;
  x_description: string;
  x_amount: string | number;
  x_tax: string | number;
  x_tax_ico: string | number;
  x_tax_base: string | number;
  x_currency_code: string;
  x_cod_response: number;
  x_response: string;
  x_response_reason_text?: string;
  x_transaction_id?: string;
  x_extra1?: string;
  x_extra2?: string;
  x_extra3?: string;
  updatedAt: string;
}> = {};


// Almacén multi-tienda en memoria para sincronización en tiempo real aislada por cuenta de restaurante
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
  } catch (e) {
    // ignore
  }
  return null;
}

function mergeServerState(local: any, remote: any): any {
  if (!remote || !Array.isArray(remote.tables)) return local;
  if (!local || !Array.isArray(local.tables)) return remote;

  const mergedTablesMap = new Map<string, any>();

  local.tables.forEach((tbl: any) => {
    mergedTablesMap.set(tbl.id, { ...tbl });
  });

  remote.tables.forEach((remoteTbl: any) => {
    const localTbl = mergedTablesMap.get(remoteTbl.id);
    if (!localTbl) {
      mergedTablesMap.set(remoteTbl.id, { ...remoteTbl });
      return;
    }

    const localTblTime = new Date(localTbl.updatedAt || 0).getTime();
    const remoteTblTime = new Date(remoteTbl.updatedAt || 0).getTime();

    // 1. Waiter Call Merging
    let mergedWaiterCall = localTbl.waiterCall;
    const localCall = localTbl.waiterCall;
    const remoteCall = remoteTbl.waiterCall;

    if (localCall && remoteCall) {
      const localCallTime = new Date(localCall.requestedAt).getTime() || 0;
      const remoteCallTime = new Date(remoteCall.requestedAt).getTime() || 0;
      mergedWaiterCall = remoteCallTime >= localCallTime ? remoteCall : localCall;
    } else if (remoteCall) {
      const remoteCallTime = new Date(remoteCall.requestedAt).getTime() || 0;
      if (remoteCallTime >= localTblTime - 5000) {
        mergedWaiterCall = remoteCall;
      } else {
        mergedWaiterCall = null;
      }
    } else if (localCall) {
      const localCallTime = new Date(localCall.requestedAt).getTime() || 0;
      if (localCallTime >= remoteTblTime - 5000) {
        mergedWaiterCall = localCall;
      } else {
        mergedWaiterCall = null;
      }
    } else {
      mergedWaiterCall = null;
    }

    // 2. Order Items Merging
    const localCheckoutTime = (localTbl.status === 'libre' && !localTbl.order) ? localTblTime : 0;
    const remoteCheckoutTime = (remoteTbl.status === 'libre' && !remoteTbl.order) ? remoteTblTime : 0;
    const maxCheckoutTime = Math.max(localCheckoutTime, remoteCheckoutTime);

    let mergedOrder: any = undefined;
    const mergedItemsMap = new Map<string, any>();

    if (localTbl.order && localTbl.order.items) {
      localTbl.order.items.forEach((it: any) => {
        const itemTime = new Date(it.addedAt || localTbl.order?.openedAt || 0).getTime();
        if (itemTime >= maxCheckoutTime) {
          mergedItemsMap.set(it.id, it);
        }
      });
    }

    if (remoteTbl.order && remoteTbl.order.items) {
      remoteTbl.order.items.forEach((it: any) => {
        const itemTime = new Date(it.addedAt || remoteTbl.order?.openedAt || 0).getTime();
        if (itemTime >= maxCheckoutTime) {
          if (!mergedItemsMap.has(it.id)) {
            mergedItemsMap.set(it.id, it);
          } else {
            const existing = mergedItemsMap.get(it.id);
            mergedItemsMap.set(it.id, {
              ...existing,
              ...it,
              quantity: Math.max(existing.quantity || 1, it.quantity || 1)
            });
          }
        }
      });
    }

    const items = Array.from(mergedItemsMap.values());
    if (items.length > 0) {
      const baseOrder = (localTbl.order && remoteTbl.order)
        ? (new Date(remoteTbl.order.lastUpdatedAt || 0).getTime() > new Date(localTbl.order.lastUpdatedAt || 0).getTime() ? remoteTbl.order : localTbl.order)
        : (localTbl.order || remoteTbl.order!);

      mergedOrder = {
        ...baseOrder,
        items,
        lastUpdatedAt: new Date().toISOString()
      };
    } else {
      mergedOrder = undefined;
    }

    // 3. Status Determination
    let status = localTbl.status;
    if (mergedWaiterCall?.type === 'bill' || localTbl.status === 'cuenta' || remoteTbl.status === 'cuenta') {
      status = 'cuenta';
    } else if (mergedOrder && mergedOrder.items && mergedOrder.items.length > 0) {
      status = 'ocupada';
    } else {
      status = 'libre';
    }

    const newestUpdatedAt = [
      localTbl.updatedAt,
      remoteTbl.updatedAt,
      mergedWaiterCall?.requestedAt,
      mergedOrder?.lastUpdatedAt
    ].filter(Boolean).sort().pop() || new Date().toISOString();

    mergedTablesMap.set(remoteTbl.id, {
      ...localTbl,
      ...remoteTbl,
      waiterCall: mergedWaiterCall,
      order: mergedOrder,
      status,
      updatedAt: newestUpdatedAt
    });
  });

  const productsMap = new Map<string, any>();
  (local.products || []).forEach((p: any) => productsMap.set(p.id, p));
  (remote.products || []).forEach((p: any) => {
    if (!productsMap.has(p.id)) productsMap.set(p.id, p);
  });

  const salesMap = new Map<string, any>();
  (local.sales || []).forEach((s: any) => salesMap.set(s.id, s));
  (remote.sales || []).forEach((s: any) => salesMap.set(s.id, s));

  const perishablesMap = new Map<string, any>();
  (local.perishables || []).forEach((p: any) => perishablesMap.set(p.id, p));
  (remote.perishables || []).forEach((p: any) => {
    if (!perishablesMap.has(p.id)) perishablesMap.set(p.id, p);
  });

  return {
    version: 2,
    lastModified: new Date().toISOString(),
    tables: Array.from(mergedTablesMap.values()),
    products: Array.from(productsMap.values()),
    sales: Array.from(salesMap.values()),
    perishables: Array.from(perishablesMap.values())
  };
}

// =========================================================================
// API ENDPOINTS DE SINCRONIZACIÓN EN TIEMPO REAL (CLIENTE <-> POS)
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
      return res.status(400).json({ error: 'Formato de estado de aplicación inválido' });
    }

    const storeId = (req.query.storeId as string) || payload.storeId || 'default';
    const current = loadStateFromDisk(storeId);
    let merged = payload;
    if (current && Array.isArray(current.tables)) {
      merged = mergeServerState(current, payload);
    }

    storeStateMap[storeId] = {
      ...merged,
      storeId,
      lastModified: new Date().toISOString()
    };

    try {
      const filePath = getStoreFilePath(storeId);
      fs.writeFileSync(filePath, JSON.stringify(storeStateMap[storeId]), 'utf8');
    } catch (e) {
      // ignore
    }

    return res.json({ success: true, state: storeStateMap[storeId] });
  } catch (err) {
    console.error('[SYNC SERVER] Error actualizando estado:', err);
    return res.status(500).json({ error: 'Error sincronizando estado de restaurante' });
  }
});

// =========================================================================
// API ENDPOINTS DE EPAYCO (CONFIRMACIÓN WEBHOOK Y VALIDACIÓN)
// =========================================================================

/**
 * a) WEBHOOK DE CONFIRMACIÓN DE EPAYCO (/api/epayco/confirmation)
 * Recibe la notificación servidor a servidor de ePayco y valida x_signature si se configuraron P_CUST_ID_CLIENTE y P_KEY.
 */
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

    // Validar firma SHA-256 oficial de ePayco si las llaves privadas están configuradas
    if (EPAYCO_P_CUST_ID_CLIENTE && EPAYCO_P_KEY && x_signature) {
      const rawSignature = `${EPAYCO_P_CUST_ID_CLIENTE}^${EPAYCO_P_KEY}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`;
      const expectedSignature = crypto
        .createHash('sha256')
        .update(rawSignature, 'utf8')
        .digest('hex');

      if (expectedSignature.toLowerCase() !== String(x_signature).toLowerCase()) {
        console.warn('[EPAYCO WEBHOOK] Firma x_signature inválida');
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
    console.error('[EPAYCO WEBHOOK] Error procesando confirmación:', error);
    return res.status(500).json({ error: 'Error procesando webhook de confirmación ePayco' });
  }
});

/**
 * b) CONSULTA DE ESTADO REGISTRADO POR WEBHOOK (/api/epayco/status/:invoiceOrRef)
 */
app.get('/api/epayco/status/:invoiceOrRef', (req: Request, res: Response) => {
  const { invoiceOrRef } = req.params;
  const tx = epaycoTransactionStore[invoiceOrRef];
  if (tx) {
    return res.json({ found: true, transaction: tx });
  }
  return res.status(404).json({ found: false });
});

/**
 * c) PROXY DE VALIDACIÓN DE REFERENCIA EPAYCO (/api/epayco/validate/:refPayco)
 */
app.get('/api/epayco/validate/:refPayco', async (req: Request, res: Response) => {
  const { refPayco } = req.params;
  try {
    const epaycoRes = await fetch(
      `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(refPayco)}`
    );
    const data = await epaycoRes.json();
    return res.status(epaycoRes.status).json(data);
  } catch (err) {
    console.error('[EPAYCO VALIDATE] Error consultando referencia:', err);
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
    const rawCod = (tx as any)?.x_cod_response ?? (tx as any)?.x_cod_transaction_state ?? (tx as any)?.cod_response ?? bodyCod;
    const codResponse = Number(rawCod);
    const txAmount = Number((tx as any)?.x_amount) || expectedAmount;
    const responseText = String((tx as any)?.x_response || (tx as any)?.x_transaction_state || (tx as any)?.estado || bodyText || '').toLowerCase().trim();

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
      (tx as any)?.x_test_request === 'TRUE' ||
      (tx as any)?.x_test_request === true ||
      (tx as any)?.x_test_request === '1' ||
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
        message: (tx as any)?.x_response_reason_text || 'La transacción fue rechazada o fallida por la entidad financiera.',
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
      transactionId: (tx as any)?.x_transaction_id || cleanRef,
      isTest,
      userEmail,
      userId
    });
  } catch (err) {
    console.error('[EPAYCO VERIFY] Error verificando suscripción:', err);
    return res.status(500).json({
      verified: false,
      error: 'Error interno en la verificación del pago de suscripción'
    });
  }
});

// =========================================================================
// MONTAJE DE VITE SERVER MIDDLEWARE
// =========================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        forwardConsole: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');

    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), {
        immutable: true,
        maxAge: '1y',
      })
    );

    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (
            base === 'index.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest' ||
            base === 'manifest.json'
          ) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );

    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/') || /\.[a-zA-Z0-9]{1,8}$/.test(req.path)) {
        return res.status(404).end();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Servidor Hostelería con pasarela ePayco ejecutándose en http://localhost:${PORT}`);
  });
}

startServer();
