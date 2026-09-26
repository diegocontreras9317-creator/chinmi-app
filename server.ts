import express, { Request, Response } from 'express';
import crypto from 'crypto';
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

// Configuración de credenciales de Wompi (Pruebas / Producción)
const WOMPI_PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || 'pub_test_Q5y1A13a48e718105740360a8274640d';
const WOMPI_INTEGRITY_SECRET = process.env.WOMPI_INTEGRITY_SECRET || 'test_integrity_SecretKeySample';
const WOMPI_EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || 'test_events_SecretKeySample';

// Almacén en memoria para estado de transacciones (en producción se guarda en base de datos)
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

// Almacén global en memoria para sincronización en tiempo real entre la carta digital del cliente y el POS
let globalAppStateStore: any = null;
const TMP_SYNC_FILE = '/tmp/gastrobar_state.json';

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
      return res.status(400).json({ error: 'Formato de estado de aplicación inválido' });
    }

    const current = loadStateFromDisk();
    let merged = payload;
    if (current && Array.isArray(current.tables)) {
      merged = mergeServerState(current, payload);
    }

    globalAppStateStore = {
      ...merged,
      lastModified: new Date().toISOString()
    };

    try {
      fs.writeFileSync(TMP_SYNC_FILE, JSON.stringify(globalAppStateStore), 'utf8');
    } catch (e) {
      // ignore
    }

    return res.json({ success: true, state: globalAppStateStore });
  } catch (err) {
    console.error('[SYNC SERVER] Error actualizando estado:', err);
    return res.status(500).json({ error: 'Error sincronizando estado de restaurante' });
  }
});

// =========================================================================
// API ENDPOINTS DE WOMPI (BACKEND)
// =========================================================================

/**
 * a) GENERAR FIRMA DE INTEGRIDAD DE WOMPI
 * Fórmula oficial de Wompi: SHA256(reference + amountInCents + currency + integritySecret)
 */
app.post('/api/wompi/signature', (req: Request, res: Response) => {
  try {
    const { reference, amountInCents, currency = 'COP' } = req.body;

    if (!reference || amountInCents === undefined) {
      return res.status(400).json({
        error: 'Se requieren "reference" y "amountInCents" para generar la firma.'
      });
    }

    const parsedAmount = Math.round(Number(amountInCents));
    const rawString = `${reference}${parsedAmount}${currency}${WOMPI_INTEGRITY_SECRET}`;

    // Hash SHA-256 en formato hexadecimal
    const signature = crypto
      .createHash('sha256')
      .update(rawString, 'utf8')
      .digest('hex');

    console.log(`[WOMPI BACKEND] Firma generada para referencia ${reference}: ${signature}`);

    return res.json({
      signature,
      reference,
      amountInCents: parsedAmount,
      currency,
      publicKey: WOMPI_PUBLIC_KEY,
      testMode: WOMPI_PUBLIC_KEY.startsWith('pub_test_')
    });
  } catch (error) {
    console.error('[WOMPI BACKEND] Error generando firma:', error);
    return res.status(500).json({ error: 'Error interno generando firma de integridad Wompi' });
  }
});

/**
 * b) WEBHOOK DE WOMPI (/api/wompi-webhook)
 * Escucha eventos transaction.updated, verifica la suma de comprobación (checksum),
 * e identifica cuando el estado es APPROVED para actualizar el estado del usuario/compra.
 */
app.post('/api/wompi-webhook', (req: Request, res: Response) => {
  try {
    const eventBody = req.body;
    console.log('[WOMPI WEBHOOK] Evento recibido:', JSON.stringify(eventBody, null, 2));

    if (!eventBody || !eventBody.data || !eventBody.data.transaction) {
      return res.status(400).json({ error: 'Estructura de evento Wompi inválida' });
    }

    const { transaction } = eventBody.data;
    const { signature, timestamp } = eventBody;

    // Verificar Suma de Comprobación (Checksum) de Wompi
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

      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(concatenatedValues, 'utf8')
        .digest('hex');

      if (calculatedChecksum.toLowerCase() !== signature.checksum.toLowerCase()) {
        console.warn('[WOMPI WEBHOOK] Checksum inválido. Posible manipulación de datos.');
        return res.status(400).json({ error: 'Checksum de seguridad no coincide' });
      }

      console.log('[WOMPI WEBHOOK] Checksum de firma verificado exitosamente ✓');
    }

    // Actualizar estado en el sistema
    const reference = transaction.reference;
    const status = transaction.status; // 'APPROVED', 'DECLINED', 'VOIDED', 'PENDING'

    transactionStore[reference] = {
      id: transaction.id || `trans_${Date.now()}`,
      reference: reference,
      status: status,
      amountInCents: transaction.amount_in_cents || 0,
      currency: transaction.currency || 'COP',
      paymentMethodType: transaction.payment_method_type,
      updatedAt: new Date().toISOString()
    };

    if (status === 'APPROVED') {
      console.log(`[WOMPI WEBHOOK] ¡TRANSACCIÓN APROBADA! Compra/Suscripción activada para referencia: ${reference}`);
    } else {
      console.log(`[WOMPI WEBHOOK] Estado de transacción para ${reference}: ${status}`);
    }

    return res.status(200).json({
      status: 'success',
      message: 'Evento webhook procesado correctamente',
      reference,
      transactionStatus: status
    });
  } catch (error) {
    console.error('[WOMPI WEBHOOK] Error procesando webhook:', error);
    return res.status(500).json({ error: 'Error procesando webhook de Wompi' });
  }
});

/**
 * CONSULTA DE ESTADO DE TRANSACCIÓN POR REFERENCIA O ID
 */
app.get('/api/wompi/transaction-status/:idOrRef', async (req: Request, res: Response) => {
  const { idOrRef } = req.params;

  // Buscar en almacén local
  let record = Object.values(transactionStore).find(
    t => t.id === idOrRef || t.reference === idOrRef
  );

  if (record) {
    return res.json(record);
  }

  // Si no está localmente y es un ID de transacción real de Wompi, intentar consultar API Wompi Sandbox
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
    console.warn('[WOMPI BACKEND] No se pudo consultar API externa de Wompi:', err);
  }

  return res.status(404).json({
    status: 'PENDING',
    reference: idOrRef,
    message: 'Transacción no encontrada o pendiente de confirmación'
  });
});

/**
 * SIMULACIÓN DE APROBACIÓN DE WEBHOOK (MODO PRUEBAS / DEMO)
 */
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

  console.log(`[WOMPI SIMULATOR] Transacción ${txId} aprobada manualmente para ${reference}`);
  return res.json({
    success: true,
    message: 'Aprobación de transacción simulada con éxito',
    transaction: transactionStore[reference]
  });
});

// =========================================================================
// MONTAJE DE VITE SERVER MIDDLEWARE
// =========================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Servidor Hostelería con backend Wompi ejecutándose en http://localhost:${PORT}`);
  });
}

startServer();
