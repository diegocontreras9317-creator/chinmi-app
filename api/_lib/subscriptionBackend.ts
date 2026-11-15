import express, { type Express, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  calculateNextBillingExpiry,
  deriveSubscriptionState,
  FREE_MAX_PRODUCTS,
  FREE_MAX_TABLES,
  getProtectedProductIds,
  GRACE_PERIOD_MS,
  isMasterAdminEmail,
  isSubscriptionDegradationEnabled,
  isTableProtected,
  parseTimestampMs,
  validateActiveSelection,
} from '../../src/utils/subscription.ts';
import type { BillingFrequency, Product, Table } from '../../src/types/index.ts';

export const EXPECTED_PLAN_AMOUNTS: Record<BillingFrequency, number> = {
  monthly: 89000,
  quarterly: 240300,
  annual: 854400,
};

export interface VerifiedCaller {
  uid: string;
  email: string;
}

export interface EpaycoIntentRecord {
  invoice: string;
  uid: string;
  email: string;
  planId: BillingFrequency;
  expectedAmount: number;
  currency: string;
  mode: 'test' | 'live';
  status: 'created' | 'approved' | 'rejected' | 'pending';
  createdAt: string;
  updatedAt?: string;
}

export interface EpaycoTransactionRecord {
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
  x_test_request?: string | boolean;
  x_customer_email?: string;
  x_extra1?: string;
  x_extra2?: string;
  x_extra3?: string;
  updatedAt: string;
}

export interface SubscriptionBackendDeps {
  now?: () => number;
  adminDb?: Firestore | null;
  adminAuth?: Auth | null;
  epaycoPublicCustId?: string;
  epaycoPrivateKey?: string;
  epaycoTestMode?: boolean;
  degradationEnabled?: boolean;
  firebaseApiKey?: string;
  epaycoFetcher?: (refPayco: string) => Promise<any>;
  verifyTokenOverride?: (token: string) => Promise<VerifiedCaller | null>;
  durableStorePath?: string;
}

interface LocalDurableState {
  intents: Record<string, EpaycoIntentRecord>;
  transactions: Record<string, EpaycoTransactionRecord>;
  payments: Record<string, any>;
  users: Record<string, any>;
  tablesByUser: Record<string, Table[]>;
  productsByUser: Record<string, Product[]>;
  promoCodes: Record<string, any>;
  auditLogs: Array<any>;
}

const DEFAULT_DURABLE_STORE_PATH = '/tmp/chinmi_subscription_store.json';

function loadAppletConfig(): { projectId?: string; firestoreDatabaseId?: string; apiKey?: string } {
  try {
    const raw = fs.readFileSync(new URL('../../firebase-applet-config.json', import.meta.url), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

let cachedAdminApp: App | null | undefined;
let cachedAdminDb: Firestore | null | undefined;
let cachedAdminAuth: Auth | null | undefined;

export function getFirebaseAdminContext(): { app: App | null; db: Firestore | null; auth: Auth | null } {
  if (cachedAdminApp !== undefined) {
    return { app: cachedAdminApp, db: cachedAdminDb ?? null, auth: cachedAdminAuth ?? null };
  }

  const appletCfg = loadAppletConfig();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    appletCfg.projectId ||
    '';
  const databaseId =
    process.env.FIREBASE_DATABASE_ID ||
    appletCfg.firestoreDatabaseId ||
    '(default)';

  try {
    let app: App | null = getApps()[0] ?? null;
    if (!app) {
      const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (saJson) {
        const parsed = JSON.parse(saJson);
        app = initializeApp({
          credential: cert(parsed),
          projectId: parsed.project_id || projectId,
        });
      } else if (projectId && clientEmail && privateKey) {
        app = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
          projectId,
        });
      }
    }

    if (!app) {
      cachedAdminApp = null;
      cachedAdminDb = null;
      cachedAdminAuth = null;
      return { app: null, db: null, auth: null };
    }

    cachedAdminApp = app;
    cachedAdminAuth = getAuth(app);
    cachedAdminDb = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
    return { app: cachedAdminApp, db: cachedAdminDb, auth: cachedAdminAuth };
  } catch (err) {
    console.warn('[SubscriptionBackend] No se pudo inicializar Firebase Admin:', err);
    cachedAdminApp = null;
    cachedAdminDb = null;
    cachedAdminAuth = null;
    return { app: null, db: null, auth: null };
  }
}

export function computeEpaycoSignature(params: {
  custId: string;
  pKey: string;
  refPayco: string;
  transactionId: string;
  amount: string | number;
  currencyCode: string;
}): string {
  const raw = `${params.custId}^${params.pKey}^${params.refPayco}^${params.transactionId}^${params.amount}^${params.currencyCode}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function createLocalDurableStore(storePath: string) {
  let cache: LocalDurableState | null = null;

  const read = (): LocalDurableState => {
    if (cache) return cache;
    try {
      if (fs.existsSync(storePath)) {
        const raw = fs.readFileSync(storePath, 'utf8');
        if (raw) {
          cache = JSON.parse(raw);
          return cache!;
        }
      }
    } catch {
      // ignore
    }
    cache = {
      intents: {},
      transactions: {},
      payments: {},
      users: {},
      tablesByUser: {},
      productsByUser: {},
      promoCodes: {},
      auditLogs: [],
    };
    return cache;
  };

  const write = (next: LocalDurableState) => {
    cache = next;
    try {
      fs.writeFileSync(storePath, JSON.stringify(next), 'utf8');
    } catch {
      // ignore read-only fs errors
    }
  };

  return { read, write };
}

function getBearerToken(req: Request): string {
  const authHeader = String(req.headers.authorization || req.headers.Authorization || '');
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

async function defaultVerifyTokenWithApiKey(token: string, apiKey: string): Promise<VerifiedCaller | null> {
  if (!token || !apiKey) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      }
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    const firstUser = Array.isArray(json?.users) ? json.users[0] : null;
    if (!firstUser?.localId) return null;
    return {
      uid: String(firstUser.localId),
      email: String(firstUser.email || '').toLowerCase(),
    };
  } catch {
    return null;
  }
}

function normalizeEpaycoDecision(tx: any) {
  const rawCod = tx?.x_cod_response ?? tx?.x_cod_transaction_state ?? tx?.cod_response;
  const codResponse = Number(rawCod);
  const responseText = String(tx?.x_response || tx?.x_transaction_state || tx?.estado || '')
    .toLowerCase()
    .trim();

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
    responseText === '01';

  const isPending =
    !isApproved &&
    (codResponse === 3 ||
      responseText === 'pendiente' ||
      responseText === 'pendientes' ||
      responseText === 'pending' ||
      responseText === 'por aprobar' ||
      responseText === '3' ||
      responseText === '03');

  const isTest =
    tx?.x_test_request === 'TRUE' ||
    tx?.x_test_request === 'true' ||
    tx?.x_test_request === true ||
    tx?.x_test_request === '1' ||
    tx?.x_test_request === 1;

  return { codResponse, responseText, isApproved, isPending, isTest };
}

function getStoreFilePath(storeId: string): string {
  const safeId = (storeId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `/tmp/gastrobar_state_${safeId}.json`;
}

export function mergeServerState(local: any, remote: any): any {
  if (!remote || !Array.isArray(remote.tables)) return local;
  if (!local || !Array.isArray(local.tables)) return remote;

  const mergedTablesMap = new Map<string, any>();
  local.tables.forEach((tbl: any) => mergedTablesMap.set(tbl.id, { ...tbl }));

  remote.tables.forEach((remoteTbl: any) => {
    const localTbl = mergedTablesMap.get(remoteTbl.id);
    if (!localTbl) {
      mergedTablesMap.set(remoteTbl.id, { ...remoteTbl });
      return;
    }

    const localTblTime = new Date(localTbl.updatedAt || 0).getTime();
    const remoteTblTime = new Date(remoteTbl.updatedAt || 0).getTime();

    let mergedWaiterCall = localTbl.waiterCall;
    const localCall = localTbl.waiterCall;
    const remoteCall = remoteTbl.waiterCall;

    if (localCall && remoteCall) {
      const localCallTime = new Date(localCall.requestedAt).getTime() || 0;
      const remoteCallTime = new Date(remoteCall.requestedAt).getTime() || 0;
      mergedWaiterCall = remoteCallTime >= localCallTime ? remoteCall : localCall;
    } else if (remoteCall) {
      const remoteCallTime = new Date(remoteCall.requestedAt).getTime() || 0;
      mergedWaiterCall = remoteCallTime >= localTblTime - 5000 ? remoteCall : null;
    } else if (localCall) {
      const localCallTime = new Date(localCall.requestedAt).getTime() || 0;
      mergedWaiterCall = localCallTime >= remoteTblTime - 5000 ? localCall : null;
    } else {
      mergedWaiterCall = null;
    }

    const localCheckoutTime = localTbl.status === 'libre' && !localTbl.order ? localTblTime : 0;
    const remoteCheckoutTime = remoteTbl.status === 'libre' && !remoteTbl.order ? remoteTblTime : 0;
    const maxCheckoutTime = Math.max(localCheckoutTime, remoteCheckoutTime);

    let mergedOrder: any = undefined;
    const mergedItemsMap = new Map<string, any>();

    if (localTbl.order?.items) {
      localTbl.order.items.forEach((it: any) => {
        const itemTime = new Date(it.addedAt || localTbl.order?.openedAt || 0).getTime();
        if (itemTime >= maxCheckoutTime) mergedItemsMap.set(it.id, it);
      });
    }

    if (remoteTbl.order?.items) {
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
              quantity: Math.max(existing.quantity || 1, it.quantity || 1),
            });
          }
        }
      });
    }

    const items = Array.from(mergedItemsMap.values());
    if (items.length > 0) {
      const baseOrder =
        localTbl.order && remoteTbl.order
          ? new Date(remoteTbl.order.lastUpdatedAt || 0).getTime() >
            new Date(localTbl.order.lastUpdatedAt || 0).getTime()
            ? remoteTbl.order
            : localTbl.order
          : localTbl.order || remoteTbl.order!;
      mergedOrder = { ...baseOrder, items, lastUpdatedAt: new Date().toISOString() };
    }

    let status = localTbl.status;
    if (mergedWaiterCall?.type === 'bill' || localTbl.status === 'cuenta' || remoteTbl.status === 'cuenta') {
      status = 'cuenta';
    } else if (mergedOrder?.items?.length > 0) {
      status = 'ocupada';
    } else {
      status = 'libre';
    }

    const newestUpdatedAt =
      [localTbl.updatedAt, remoteTbl.updatedAt, mergedWaiterCall?.requestedAt, mergedOrder?.lastUpdatedAt]
        .filter(Boolean)
        .sort()
        .pop() || new Date().toISOString();

    mergedTablesMap.set(remoteTbl.id, {
      ...localTbl,
      ...remoteTbl,
      waiterCall: mergedWaiterCall,
      order: mergedOrder,
      status,
      updatedAt: newestUpdatedAt,
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
    perishables: Array.from(perishablesMap.values()),
  };
}

export function createSubscriptionApp(deps: SubscriptionBackendDeps = {}): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  const appletCfg = loadAppletConfig();
  const adminCtx =
    deps.adminDb !== undefined || deps.adminAuth !== undefined
      ? { db: deps.adminDb ?? null, auth: deps.adminAuth ?? null }
      : getFirebaseAdminContext();

  const adminDb = adminCtx.db;
  const adminAuth = adminCtx.auth;
  const firebaseApiKey = deps.firebaseApiKey ?? process.env.VITE_FIREBASE_API_KEY ?? appletCfg.apiKey ?? '';
  const epaycoCustId = deps.epaycoPublicCustId ?? process.env.EPAYCO_P_CUST_ID_CLIENTE ?? '';
  const epaycoPKey = deps.epaycoPrivateKey ?? process.env.EPAYCO_P_KEY ?? '';
  const isTestEnv =
    deps.epaycoTestMode ??
    ((process.env.VITE_EPAYCO_TEST_MODE || 'true').toString().toLowerCase() === 'true');
  const getNowMs = deps.now ?? (() => Date.now());
  const degradationEnabled = isSubscriptionDegradationEnabled(deps.degradationEnabled);
  const localStore = createLocalDurableStore(deps.durableStorePath || DEFAULT_DURABLE_STORE_PATH);
  const storeStateMap: Record<string, any> = {};

  const epaycoFetcher =
    deps.epaycoFetcher ??
    (async (refPayco: string) => {
      const epaycoRes = await fetch(
        `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(refPayco)}`
      );
      if (!epaycoRes.ok) return null;
      return epaycoRes.json();
    });

  async function verifyCaller(req: Request): Promise<VerifiedCaller | null> {
    const token = getBearerToken(req);
    if (!token) return null;
    if (deps.verifyTokenOverride) {
      return deps.verifyTokenOverride(token);
    }
    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        return {
          uid: decoded.uid,
          email: String(decoded.email || '').toLowerCase(),
        };
      } catch {
        return null;
      }
    }
    if (firebaseApiKey) {
      return defaultVerifyTokenWithApiKey(token, firebaseApiKey);
    }
    return null;
  }

  async function writeAuditLog(uid: string, entry: Record<string, any>) {
    const payload = {
      ...entry,
      uid,
      createdAt: new Date(getNowMs()).toISOString(),
    };
    if (adminDb) {
      try {
        await adminDb.collection('users').doc(uid).collection('subscription_audit').add(payload);
        return;
      } catch (err) {
        console.warn('[SubscriptionBackend] No se pudo escribir audit log en Firestore:', err);
      }
    }
    const state = localStore.read();
    state.auditLogs.push(payload);
    localStore.write(state);
  }

  async function saveIntent(intent: EpaycoIntentRecord) {
    if (adminDb) {
      await adminDb.collection('subscription_intents').doc(intent.invoice).set(intent, { merge: true });
    } else {
      const state = localStore.read();
      state.intents[intent.invoice] = intent;
      localStore.write(state);
    }
  }

  async function getIntent(invoice: string): Promise<EpaycoIntentRecord | null> {
    if (!invoice) return null;
    if (adminDb) {
      const snap = await adminDb.collection('subscription_intents').doc(invoice).get();
      return snap.exists ? (snap.data() as EpaycoIntentRecord) : null;
    }
    const state = localStore.read();
    return state.intents[invoice] || null;
  }

  async function saveTransaction(record: EpaycoTransactionRecord) {
    if (adminDb) {
      if (record.x_id_invoice) {
        await adminDb.collection('epayco_transactions').doc(record.x_id_invoice).set(record, { merge: true });
      }
      if (record.x_ref_payco) {
        await adminDb.collection('epayco_transactions').doc(record.x_ref_payco).set(record, { merge: true });
      }
    } else {
      const state = localStore.read();
      if (record.x_id_invoice) state.transactions[record.x_id_invoice] = record;
      if (record.x_ref_payco) state.transactions[record.x_ref_payco] = record;
      localStore.write(state);
    }
  }

  async function getStoredTransaction(refOrInvoice: string): Promise<EpaycoTransactionRecord | null> {
    if (!refOrInvoice) return null;
    if (adminDb) {
      const snap = await adminDb.collection('epayco_transactions').doc(refOrInvoice).get();
      return snap.exists ? (snap.data() as EpaycoTransactionRecord) : null;
    }
    const state = localStore.read();
    return state.transactions[refOrInvoice] || null;
  }

  async function reactivateOverLimitItemsFirestore(uid: string) {
    if (!adminDb) {
      const state = localStore.read();
      state.tablesByUser[uid] = (state.tablesByUser[uid] || []).map((t) =>
        t.inactivatedReason === 'free_over_limit'
          ? { ...t, active: true, inactivatedReason: null }
          : t
      );
      state.productsByUser[uid] = (state.productsByUser[uid] || []).map((p) =>
        p.inactivatedReason === 'free_over_limit'
          ? { ...p, active: true, inactivatedReason: null }
          : p
      );
      localStore.write(state);
      return;
    }

    const [tablesSnap, menuSnap, prodsSnap] = await Promise.all([
      adminDb.collection('users').doc(uid).collection('mesas').get(),
      adminDb.collection('users').doc(uid).collection('menu').get(),
      adminDb.collection('users').doc(uid).collection('productos').get(),
    ]);

    const batch = adminDb.batch();
    let ops = 0;

    tablesSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.inactivatedReason === 'free_over_limit' || data.active === false) {
        if (data.inactivatedReason === 'free_over_limit') {
          batch.set(docSnap.ref, { active: true, inactivatedReason: null }, { merge: true });
          ops++;
        }
      }
    });

    [...menuSnap.docs, ...prodsSnap.docs].forEach((docSnap) => {
      const data = docSnap.data();
      if (data.inactivatedReason === 'free_over_limit') {
        batch.set(docSnap.ref, { active: true, inactivatedReason: null }, { merge: true });
        ops++;
      }
    });

    if (ops > 0) await batch.commit();
  }

  async function activateProIdempotent(params: {
    uid: string;
    email?: string;
    planId?: BillingFrequency;
    customDays?: number;
    paymentKey: string;
    refPayco: string;
    invoice?: string;
    billedAmount: number;
    isTest: boolean;
    source: 'epayco' | 'promo_code';
    promoCode?: string;
  }): Promise<{ alreadyProcessed: boolean; expiresAtIso: string }> {
    const nowMs = getNowMs();
    const nowIso = new Date(nowMs).toISOString();

    if (adminDb) {
      const paymentRef = adminDb.collection('epayco_payments').doc(params.paymentKey);
      const userRef = adminDb.collection('users').doc(params.uid);

      const txResult = await adminDb.runTransaction(async (tx) => {
        const paymentSnap = await tx.get(paymentRef);
        const userSnap = await tx.get(userRef);

        if (paymentSnap.exists) {
          const existing = paymentSnap.data() || {};
          return {
            alreadyProcessed: true,
            expiresAtIso: String(existing.expiresAtIso || userSnap.data()?.planExpiresAt || nowIso),
          };
        }

        const userData = userSnap.exists ? userSnap.data() || {} : {};
        const currentExpiryMs = parseTimestampMs(userData.planExpiresAt ?? userData.plan_expira);
        const activeOrGraceExpiry =
          currentExpiryMs && currentExpiryMs + GRACE_PERIOD_MS > nowMs ? currentExpiryMs : null;

        const nextExpiry = calculateNextBillingExpiry({
          nowMs,
          currentExpiryMs: activeOrGraceExpiry,
          frequency: params.planId || 'monthly',
          customDays: params.customDays ?? null,
        });
        const expiresAtIso = nextExpiry.toISOString();

        tx.set(paymentRef, {
          uid: params.uid,
          email: params.email || userData.email || '',
          planId: params.planId || 'monthly',
          billedAmount: params.billedAmount,
          refPayco: params.refPayco,
          invoice: params.invoice || null,
          isTest: params.isTest,
          source: params.source,
          promoCode: params.promoCode || null,
          processedAt: nowIso,
          expiresAtIso,
        });

        tx.set(
          userRef,
          {
            plan: 'pro',
            subscriptionStatus: 'pro_active',
            billingFrequency: params.planId || userData.billingFrequency || 'monthly',
            planExpiresAt: expiresAtIso,
            plan_expira: Timestamp.fromDate(nextExpiry),
            graceEndsAt: null,
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            isTestSubscription: params.isTest,
            planMode: params.source === 'promo_code' ? 'promo' : params.isTest ? 'test' : 'live',
            lastPaymentRef: params.refPayco,
            subscriptionId: params.invoice || params.paymentKey,
            lastQuotaReconciliationAt: nowIso,
          },
          { merge: true }
        );

        if (params.invoice) {
          tx.set(
            adminDb.collection('subscription_intents').doc(params.invoice),
            { status: 'approved', updatedAt: nowIso, refPayco: params.refPayco },
            { merge: true }
          );
        }

        return { alreadyProcessed: false, expiresAtIso };
      });

      if (!txResult.alreadyProcessed) {
        await reactivateOverLimitItemsFirestore(params.uid);
        await writeAuditLog(params.uid, {
          action: params.source === 'promo_code' ? 'promo_redeemed' : 'pro_activated',
          planId: params.planId || 'monthly',
          paymentKey: params.paymentKey,
          refPayco: params.refPayco,
          billedAmount: params.billedAmount,
          isTest: params.isTest,
          expiresAtIso: txResult.expiresAtIso,
        });
      }

      return txResult;
    }

    // Local durable store fallback (tests & unconfigured local preview)
    const state = localStore.read();
    if (state.payments[params.paymentKey]) {
      return {
        alreadyProcessed: true,
        expiresAtIso: String(state.payments[params.paymentKey].expiresAtIso || nowIso),
      };
    }

    const userData = state.users[params.uid] || {};
    const currentExpiryMs = parseTimestampMs(userData.planExpiresAt ?? userData.plan_expira);
    const activeOrGraceExpiry =
      currentExpiryMs && currentExpiryMs + GRACE_PERIOD_MS > nowMs ? currentExpiryMs : null;

    const nextExpiry = calculateNextBillingExpiry({
      nowMs,
      currentExpiryMs: activeOrGraceExpiry,
      frequency: params.planId || 'monthly',
      customDays: params.customDays ?? null,
    });
    const expiresAtIso = nextExpiry.toISOString();

    state.payments[params.paymentKey] = {
      uid: params.uid,
      email: params.email || userData.email || '',
      planId: params.planId || 'monthly',
      billedAmount: params.billedAmount,
      refPayco: params.refPayco,
      invoice: params.invoice || null,
      isTest: params.isTest,
      source: params.source,
      processedAt: nowIso,
      expiresAtIso,
    };

    state.users[params.uid] = {
      ...userData,
      id: params.uid,
      email: params.email || userData.email || '',
      plan: 'pro',
      subscriptionStatus: 'pro_active',
      billingFrequency: params.planId || userData.billingFrequency || 'monthly',
      planExpiresAt: expiresAtIso,
      graceEndsAt: null,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      isTestSubscription: params.isTest,
      planMode: params.source === 'promo_code' ? 'promo' : params.isTest ? 'test' : 'live',
      lastPaymentRef: params.refPayco,
      subscriptionId: params.invoice || params.paymentKey,
      lastQuotaReconciliationAt: nowIso,
    };

    if (params.invoice && state.intents[params.invoice]) {
      state.intents[params.invoice] = {
        ...state.intents[params.invoice],
        status: 'approved',
        updatedAt: nowIso,
      };
    }

    localStore.write(state);
    await reactivateOverLimitItemsFirestore(params.uid);
    await writeAuditLog(params.uid, {
      action: params.source === 'promo_code' ? 'promo_redeemed' : 'pro_activated',
      planId: params.planId || 'monthly',
      paymentKey: params.paymentKey,
      refPayco: params.refPayco,
      billedAmount: params.billedAmount,
      isTest: params.isTest,
      expiresAtIso,
    });

    return { alreadyProcessed: false, expiresAtIso };
  }

  async function reconcileUserSubscription(uid: string, email: string) {
    const nowMs = getNowMs();
    const nowIso = new Date(nowMs).toISOString();

    let userData: any = null;
    let tables: Table[] = [];
    let products: Product[] = [];

    if (adminDb) {
      const [userSnap, tablesSnap, menuSnap] = await Promise.all([
        adminDb.collection('users').doc(uid).get(),
        adminDb.collection('users').doc(uid).collection('mesas').get(),
        adminDb.collection('users').doc(uid).collection('menu').get(),
      ]);
      userData = userSnap.exists ? userSnap.data() : { id: uid, email, plan: 'free' };
      tables = tablesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      products = menuSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    } else {
      const state = localStore.read();
      userData = state.users[uid] || { id: uid, email, plan: 'free' };
      tables = state.tablesByUser[uid] || [];
      products = state.productsByUser[uid] || [];
    }

    const planExpiresAtIso =
      parseTimestampMs(userData.planExpiresAt ?? userData.plan_expira) !== null
        ? new Date(parseTimestampMs(userData.planExpiresAt ?? userData.plan_expira)!).toISOString()
        : null;
    const graceEndsAtIso =
      parseTimestampMs(userData.graceEndsAt) !== null
        ? new Date(parseTimestampMs(userData.graceEndsAt)!).toISOString()
        : null;

    const derived = deriveSubscriptionState({
      user: {
        ...userData,
        id: uid,
        email: email || userData.email || '',
        planExpiresAt: planExpiresAtIso,
        graceEndsAt: graceEndsAtIso,
      },
      serverNowMs: nowMs,
      tables,
      products,
      degradationEnabled,
    });

    // Persist authoritative transitions when needed
    const prevPlan = userData.plan || 'free';
    const prevStatus = userData.subscriptionStatus || (prevPlan === 'pro' ? 'pro_active' : 'free');
    const needsGraceWrite =
      !isMasterAdminEmail(email || userData.email) &&
      prevPlan === 'pro' &&
      derived.status === 'pro_grace' &&
      (prevStatus !== 'pro_grace' || !userData.graceEndsAt);
    const needsDowngradeWrite =
      !isMasterAdminEmail(email || userData.email) &&
      prevPlan === 'pro' &&
      (derived.status === 'free' || derived.status === 'free_over_limit');
    const needsOverLimitSync =
      prevPlan === 'free' && prevStatus !== derived.status;

    if (needsGraceWrite) {
      const targetGraceIso = new Date(derived.graceEndsAtMs || nowMs + GRACE_PERIOD_MS).toISOString();
      const patch = {
        subscriptionStatus: 'pro_grace',
        graceEndsAt: targetGraceIso,
        lastQuotaReconciliationAt: nowIso,
      };
      if (adminDb) {
        await adminDb.collection('users').doc(uid).set(patch, { merge: true });
      } else {
        const state = localStore.read();
        state.users[uid] = { ...(state.users[uid] || userData), ...patch };
        localStore.write(state);
      }
      await writeAuditLog(uid, {
        action: 'entered_grace_period',
        graceEndsAt: targetGraceIso,
        planExpiresAt: planExpiresAtIso,
      });
    } else if (needsDowngradeWrite || needsOverLimitSync) {
      const patch = {
        plan: 'free',
        subscriptionStatus: derived.status,
        planExpiresAt: null,
        plan_expira: null,
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        lastQuotaReconciliationAt: nowIso,
      };
      if (adminDb) {
        await adminDb.collection('users').doc(uid).set(patch, { merge: true });
      } else {
        const state = localStore.read();
        state.users[uid] = { ...(state.users[uid] || userData), ...patch };
        localStore.write(state);
      }
      if (needsDowngradeWrite) {
        await writeAuditLog(uid, {
          action: 'downgraded_after_grace',
          newStatus: derived.status,
          totalTables: tables.length,
          totalProducts: products.length,
        });
      }
    }

    return {
      plan: derived.effectivePlan,
      rawPlan: needsDowngradeWrite ? 'free' : prevPlan,
      status: derived.status,
      planExpiresAt: needsDowngradeWrite ? null : planExpiresAtIso,
      graceEndsAt:
        derived.status === 'pro_grace' && derived.graceEndsAtMs
          ? new Date(derived.graceEndsAtMs).toISOString()
          : null,
      cancelAtPeriodEnd: Boolean(userData.cancelAtPeriodEnd && !needsDowngradeWrite),
      derived,
    };
  }

  // =========================================================================
  // 1. REAL-TIME SYNC (MESA / CARTA <-> POS)
  // =========================================================================
  app.get('/api/sync/state', (req: Request, res: Response) => {
    const storeId = (req.query.storeId as string) || 'default';
    let current = storeStateMap[storeId];
    if (!current) {
      try {
        const filePath = getStoreFilePath(storeId);
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf8');
          if (data) {
            current = JSON.parse(data);
            storeStateMap[storeId] = current;
          }
        }
      } catch {
        // ignore
      }
    }
    if (!current) return res.status(200).json({ empty: true });
    return res.json(current);
  });

  app.post('/api/sync/state', (req: Request, res: Response) => {
    try {
      const payload = req.body;
      if (!payload || !Array.isArray(payload.tables)) {
        return res.status(400).json({ error: 'Formato de estado de aplicación inválido' });
      }
      const storeId = (req.query.storeId as string) || payload.storeId || 'default';
      let current = storeStateMap[storeId];
      if (!current) {
        try {
          const filePath = getStoreFilePath(storeId);
          if (fs.existsSync(filePath)) current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch {
          // ignore
        }
      }
      const merged = current && Array.isArray(current.tables) ? mergeServerState(current, payload) : payload;
      storeStateMap[storeId] = { ...merged, storeId, lastModified: new Date().toISOString() };
      try {
        fs.writeFileSync(getStoreFilePath(storeId), JSON.stringify(storeStateMap[storeId]), 'utf8');
      } catch {
        // ignore
      }
      return res.json({ success: true, state: storeStateMap[storeId] });
    } catch {
      return res.status(500).json({ error: 'Error sincronizando estado de restaurante' });
    }
  });

  // =========================================================================
  // 2. SERVER CLOCK & AUTHORITATIVE SUBSCRIPTION STATUS
  // =========================================================================
  app.get('/api/subscription/status', async (req: Request, res: Response) => {
    const nowMs = getNowMs();
    const caller = await verifyCaller(req);
    const capabilities = {
      adminConfigured: Boolean(adminDb && adminAuth),
      epaycoSignatureConfigured: Boolean(epaycoCustId && epaycoPKey),
      epaycoMode: isTestEnv ? 'test' : 'live',
      degradationEnabled,
    };

    if (!caller) {
      return res.json({
        serverNowMs: nowMs,
        serverIso: new Date(nowMs).toISOString(),
        authenticated: false,
        capabilities,
      });
    }

    try {
      const subscription = await reconcileUserSubscription(caller.uid, caller.email);
      return res.json({
        serverNowMs: nowMs,
        serverIso: new Date(nowMs).toISOString(),
        authenticated: true,
        uid: caller.uid,
        capabilities,
        subscription,
      });
    } catch (err) {
      console.error('[Subscription Status] Error:', err);
      return res.status(500).json({ error: 'Error consultando estado de suscripción' });
    }
  });

  // =========================================================================
  // 3. CREATE AUTHORITATIVE EPAYCO CHECKOUT INTENT
  // =========================================================================
  app.post('/api/epayco/create-intent', async (req: Request, res: Response) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Debes iniciar sesión para iniciar un pago de suscripción.' });
    }

    const planId = String(req.body?.planId || '').trim().toLowerCase() as BillingFrequency;
    if (!EXPECTED_PLAN_AMOUNTS[planId]) {
      return res.status(400).json({ error: 'Plan de suscripción inválido.' });
    }

    const nowMs = getNowMs();
    const expectedAmount = EXPECTED_PLAN_AMOUNTS[planId];
    const invoice = `SUB-PRO-${planId.toUpperCase()}-${nowMs}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const intent: EpaycoIntentRecord = {
      invoice,
      uid: caller.uid,
      email: caller.email || String(req.body?.email || '').toLowerCase(),
      planId,
      expectedAmount,
      currency: 'COP',
      mode: isTestEnv ? 'test' : 'live',
      status: 'created',
      createdAt: new Date(nowMs).toISOString(),
    };

    try {
      await saveIntent(intent);
      return res.json({
        invoice: intent.invoice,
        planId: intent.planId,
        expectedAmount: intent.expectedAmount,
        currency: intent.currency,
        mode: intent.mode,
      });
    } catch (err) {
      console.error('[EPAYCO INTENT] Error guardando intent:', err);
      return res.status(500).json({ error: 'No se pudo registrar la intención de pago.' });
    }
  });

  // =========================================================================
  // 4. EPAYCO CONFIRMATION WEBHOOK
  // =========================================================================
  app.all('/api/epayco/confirmation', async (req: Request, res: Response) => {
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
        x_test_request = '',
        x_customer_email = '',
        x_extra1 = '',
        x_extra2 = '',
        x_extra3 = '',
      } = payload;

      if (!x_id_invoice && !x_ref_payco) {
        return res.status(400).json({ error: 'Payload de confirmación de ePayco incompleto' });
      }

      const signatureKeysConfigured = Boolean(epaycoCustId && epaycoPKey);
      if (signatureKeysConfigured) {
        if (!x_signature) {
          return res.status(400).json({ error: 'Firma x_signature obligatoria y no fue enviada' });
        }
        const expectedSig = computeEpaycoSignature({
          custId: epaycoCustId,
          pKey: epaycoPKey,
          refPayco: String(x_ref_payco),
          transactionId: String(x_transaction_id),
          amount: String(x_amount),
          currencyCode: String(x_currency_code),
        });
        if (expectedSig.toLowerCase() !== String(x_signature).toLowerCase()) {
          return res.status(400).json({ error: 'Firma de seguridad x_signature inválida' });
        }
      } else if (!isTestEnv) {
        return res.status(500).json({
          error: 'Configuración de seguridad ePayco incompleta en servidor para modo producción',
        });
      }

      const codResponse = Number(x_cod_response);
      const record: EpaycoTransactionRecord = {
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
        x_test_request: String(x_test_request),
        x_customer_email: String(x_customer_email),
        x_extra1: String(x_extra1),
        x_extra2: String(x_extra2),
        x_extra3: String(x_extra3),
        updatedAt: new Date(getNowMs()).toISOString(),
      };

      await saveTransaction(record);

      // Si el pago fue aprobado y coincide con un intent persistido, activar atómicamente desde el webhook
      const decision = normalizeEpaycoDecision(record);
      const invoiceKey = String(x_id_invoice || x_extra2 || '').trim();
      if (decision.isApproved && invoiceKey) {
        const intent = await getIntent(invoiceKey);
        if (intent) {
          const amountOk = Number(record.x_amount) >= intent.expectedAmount;
          const currencyOk = String(record.x_currency_code || 'COP').toUpperCase() === intent.currency;
          const modeOk = isTestEnv || !decision.isTest;
          if (amountOk && currencyOk && modeOk) {
            const paymentKey = String(record.x_transaction_id || record.x_ref_payco || invoiceKey);
            await activateProIdempotent({
              uid: intent.uid,
              email: intent.email,
              planId: intent.planId,
              paymentKey,
              refPayco: record.x_ref_payco || paymentKey,
              invoice: intent.invoice,
              billedAmount: Number(record.x_amount) || intent.expectedAmount,
              isTest: decision.isTest || intent.mode === 'test',
              source: 'epayco',
            });
          }
        }
      }

      return res.status(200).json({
        success: true,
        invoice: x_id_invoice,
        cod_response: codResponse,
      });
    } catch (error) {
      console.error('[EPAYCO WEBHOOK] Error procesando confirmación:', error);
      return res.status(500).json({ error: 'Error procesando webhook de confirmación ePayco' });
    }
  });

  app.get('/api/epayco/status/:invoiceOrRef', async (req: Request, res: Response) => {
    const tx = await getStoredTransaction(req.params.invoiceOrRef);
    if (tx) return res.json({ found: true, transaction: tx });
    return res.status(404).json({ found: false });
  });

  app.get('/api/epayco/validate/:refPayco', async (req: Request, res: Response) => {
    const { refPayco } = req.params;
    try {
      const data = await epaycoFetcher(refPayco);
      if (!data) {
        return res.status(502).json({ success: false, error: 'Error validando referencia con ePayco' });
      }
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({ success: false, error: 'Error validando referencia con ePayco' });
    }
  });

  // =========================================================================
  // 5. SECURE SERVER-SIDE SUBSCRIPTION VERIFICATION & ACTIVATION
  // =========================================================================
  app.post('/api/epayco/verify-subscription', async (req: Request, res: Response) => {
    try {
      const caller = await verifyCaller(req);
      if (!caller) {
        return res.status(401).json({
          verified: false,
          error: 'Autenticación requerida para verificar y activar la suscripción.',
        });
      }

      const { refPayco, invoice: bodyInvoice, planId: bodyPlanId } = req.body || {};
      const cleanRef = String(refPayco || '').trim();
      const requestedInvoice = String(bodyInvoice || '').trim();

      if (!cleanRef && !requestedInvoice) {
        return res.status(400).json({ verified: false, error: 'Referencia ePayco (refPayco) no proporcionada' });
      }

      // 1. Buscar en confirmaciones persistidas por webhook (por refPayco o invoice)
      let tx: any =
        (cleanRef ? await getStoredTransaction(cleanRef) : null) ||
        (requestedInvoice ? await getStoredTransaction(requestedInvoice) : null);

      // 2. Consultar API oficial de ePayco si no ha llegado webhook todavía
      if (!tx && cleanRef) {
        try {
          const json = await epaycoFetcher(cleanRef);
          if (json?.success && json?.data) {
            tx = json.data;
          }
        } catch {
          // ignore network errors; handled cleanly below
        }
      }

      // NUNCA aprobar automáticamente si no existe transacción verificada (prohibido fallback ciego de pruebas)
      if (!tx) {
        return res.status(404).json({
          verified: false,
          status: 'not_found',
          message:
            'No se encontró confirmación verificada de ePayco para esta referencia. Si pagaste por PSE o transferencia, espera unos segundos mientras ePayco confirma la operación.',
          refPayco: cleanRef || requestedInvoice,
        });
      }

      const decision = normalizeEpaycoDecision(tx);
      if (!decision.isApproved) {
        if (decision.isPending) {
          return res.json({
            verified: false,
            status: 'pending',
            message:
              'La transacción se encuentra en proceso de validación bancaria. Se activará automáticamente al confirmarse.',
            refPayco: cleanRef,
          });
        }
        return res.status(400).json({
          verified: false,
          status: 'rejected',
          message:
            tx?.x_response_reason_text || 'La transacción fue rechazada o no aprobada por la pasarela.',
          refPayco: cleanRef,
        });
      }

      // 3. Validar pertenencia, plan real y monto contra intent persistido (NUNCA confiar en body.planId si existe intent)
      const invoiceKey = String(tx?.x_id_invoice || tx?.x_extra2 || requestedInvoice || '').trim();
      const intent = invoiceKey ? await getIntent(invoiceKey) : null;

      if (intent && intent.uid !== caller.uid) {
        return res.status(403).json({
          verified: false,
          status: 'forbidden',
          error: 'Esta transacción pertenece a otra cuenta de restaurante.',
        });
      }

      if (!intent && tx?.x_extra1 && String(tx.x_extra1).trim() !== caller.uid) {
        return res.status(403).json({
          verified: false,
          status: 'forbidden',
          error: 'El usuario de la transacción no coincide con la sesión actual.',
        });
      }

      const resolvedPlanId: BillingFrequency =
        intent?.planId ||
        (tx?.x_extra3 && EXPECTED_PLAN_AMOUNTS[String(tx.x_extra3) as BillingFrequency]
          ? (String(tx.x_extra3) as BillingFrequency)
          : EXPECTED_PLAN_AMOUNTS[String(bodyPlanId || 'monthly') as BillingFrequency]
          ? (String(bodyPlanId || 'monthly') as BillingFrequency)
          : 'monthly');

      const expectedAmount = intent?.expectedAmount ?? EXPECTED_PLAN_AMOUNTS[resolvedPlanId];
      const txAmount = Number(tx?.x_amount ?? 0);
      const txCurrency = String(tx?.x_currency_code || tx?.x_currency || 'COP').toUpperCase().trim();

      if (!Number.isFinite(txAmount) || txAmount < expectedAmount) {
        return res.status(400).json({
          verified: false,
          status: 'amount_mismatch',
          error: `El monto pagado (${txAmount}) no coincide con el plan ${resolvedPlanId} (${expectedAmount} COP).`,
        });
      }

      if (txCurrency !== 'COP') {
        return res.status(400).json({
          verified: false,
          status: 'currency_mismatch',
          error: `Moneda inválida (${txCurrency}). Solo se aceptan pagos en COP.`,
        });
      }

      if (!isTestEnv && decision.isTest) {
        return res.status(400).json({
          verified: false,
          status: 'test_tx_in_live_mode',
          error: 'Se rechazó una transacción de pruebas en entorno de producción.',
        });
      }

      const paymentKey = String(tx?.x_transaction_id || tx?.x_ref_payco || cleanRef);
      const activation = await activateProIdempotent({
        uid: caller.uid,
        email: caller.email,
        planId: resolvedPlanId,
        paymentKey,
        refPayco: String(tx?.x_ref_payco || cleanRef),
        invoice: invoiceKey || undefined,
        billedAmount: txAmount,
        isTest: Boolean(decision.isTest || intent?.mode === 'test' || isTestEnv),
        source: 'epayco',
      });

      return res.json({
        verified: true,
        status: 'approved',
        alreadyProcessed: activation.alreadyProcessed,
        planId: resolvedPlanId,
        billedAmount: txAmount,
        refPayco: String(tx?.x_ref_payco || cleanRef),
        transactionId: paymentKey,
        isTest: Boolean(decision.isTest || intent?.mode === 'test' || isTestEnv),
        planExpiresAt: activation.expiresAtIso,
        userId: caller.uid,
        userEmail: caller.email,
      });
    } catch (err) {
      console.error('[EPAYCO VERIFY] Error verificando suscripción:', err);
      return res.status(500).json({
        verified: false,
        error: 'Error interno en la verificación del pago de suscripción',
      });
    }
  });

  // =========================================================================
  // 6. CANCELAR RENOVACIÓN (MANTIENE PRO HASTA FIN DEL PERÍODO PAGADO)
  // =========================================================================
  app.post('/api/subscription/cancel', async (req: Request, res: Response) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Sesión no autenticada.' });
    }

    const nowMs = getNowMs();
    const nowIso = new Date(nowMs).toISOString();

    try {
      if (adminDb) {
        const userRef = adminDb.collection('users').doc(caller.uid);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        await userRef.set(
          {
            cancelAtPeriodEnd: true,
            cancelledAt: nowIso,
            lastQuotaReconciliationAt: nowIso,
          },
          { merge: true }
        );
        await writeAuditLog(caller.uid, {
          action: 'subscription_cancelled_at_period_end',
          planExpiresAt: userData.planExpiresAt || null,
        });
        return res.json({
          success: true,
          cancelAtPeriodEnd: true,
          cancelledAt: nowIso,
          planExpiresAt: userData.planExpiresAt || null,
        });
      }

      const state = localStore.read();
      const userData = state.users[caller.uid] || { id: caller.uid, email: caller.email };
      state.users[caller.uid] = {
        ...userData,
        cancelAtPeriodEnd: true,
        cancelledAt: nowIso,
        lastQuotaReconciliationAt: nowIso,
      };
      localStore.write(state);
      await writeAuditLog(caller.uid, {
        action: 'subscription_cancelled_at_period_end',
        planExpiresAt: userData.planExpiresAt || null,
      });

      return res.json({
        success: true,
        cancelAtPeriodEnd: true,
        cancelledAt: nowIso,
        planExpiresAt: userData.planExpiresAt || null,
      });
    } catch (err) {
      console.error('[Subscription Cancel] Error:', err);
      return res.status(500).json({ error: 'No se pudo cancelar la suscripción.' });
    }
  });

  // =========================================================================
  // 7. CANJE SEGURO DE CÓDIGO PROMOCIONAL EN BACKEND
  // =========================================================================
  app.post('/api/subscription/redeem-code', async (req: Request, res: Response) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Debes iniciar sesión para canjear un código.' });
    }

    const cleanCode = String(req.body?.code || '').trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ error: 'Por favor ingresa un código promocional.' });
    }

    const nowMs = getNowMs();
    const nowIso = new Date(nowMs).toISOString();

    try {
      let dias = 30;
      if (adminDb) {
        const promoRef = adminDb.collection('codigos_promocionales').doc(cleanCode);
        const userRef = adminDb.collection('users').doc(caller.uid);

        const result = await adminDb.runTransaction(async (tx) => {
          const promoSnap = await tx.get(promoRef);
          if (!promoSnap.exists) {
            throw new Error('PROMO_NOT_FOUND');
          }
          const promo = promoSnap.data() || {};
          if (promo.activo !== true) {
            throw new Error('PROMO_INACTIVE');
          }
          const expMs = parseTimestampMs(promo.expira_en ?? promo.expiresAt);
          if (expMs !== null && expMs < nowMs) {
            throw new Error('PROMO_EXPIRED');
          }
          const redeemedBy: string[] = Array.isArray(promo.redimido_por) ? promo.redimido_por : [];
          if (redeemedBy.includes(caller.uid)) {
            throw new Error('PROMO_ALREADY_REDEEMED');
          }
          if (promo.uso_unico === true && redeemedBy.length > 0) {
            throw new Error('PROMO_EXHAUSTED');
          }

          dias = Number(promo.dias_premium) || 30;
          const userSnap = await tx.get(userRef);
          const userData = userSnap.exists ? userSnap.data() || {} : {};
          const currentExpiryMs = parseTimestampMs(userData.planExpiresAt ?? userData.plan_expira);
          const activeOrGraceExpiry =
            currentExpiryMs && currentExpiryMs + GRACE_PERIOD_MS > nowMs ? currentExpiryMs : null;

          const nextExpiry = calculateNextBillingExpiry({
            nowMs,
            currentExpiryMs: activeOrGraceExpiry,
            customDays: dias,
          });
          const expiresAtIso = nextExpiry.toISOString();

          tx.set(
            promoRef,
            {
              redimido_por: [...redeemedBy, caller.uid],
              ultimo_canje: nowIso,
            },
            { merge: true }
          );

          tx.set(
            userRef,
            {
              plan: 'pro',
              subscriptionStatus: 'pro_active',
              planExpiresAt: expiresAtIso,
              plan_expira: Timestamp.fromDate(nextExpiry),
              graceEndsAt: null,
              cancelAtPeriodEnd: false,
              cancelledAt: null,
              planMode: 'promo',
              codigo_canjeado: cleanCode,
              fecha_canje: nowIso,
              lastQuotaReconciliationAt: nowIso,
            },
            { merge: true }
          );

          return { dias, expiresAtIso };
        });

        await reactivateOverLimitItemsFirestore(caller.uid);
        await writeAuditLog(caller.uid, {
          action: 'promo_redeemed',
          code: cleanCode,
          dias: result.dias,
          expiresAtIso: result.expiresAtIso,
        });

        return res.json({
          success: true,
          code: cleanCode,
          dias: result.dias,
          planExpiresAt: result.expiresAtIso,
        });
      }

      // Local store fallback (tests & local preview)
      const state = localStore.read();
      const promo = state.promoCodes[cleanCode];
      if (!promo) return res.status(404).json({ error: 'El código ingresado no existe o no es válido.' });
      if (promo.activo !== true) return res.status(400).json({ error: 'Este código promocional ya no está activo.' });
      const redeemedBy: string[] = Array.isArray(promo.redimido_por) ? promo.redimido_por : [];
      if (redeemedBy.includes(caller.uid)) {
        return res.status(400).json({ error: 'Ya has canjeado este código promocional.' });
      }
      if (promo.uso_unico === true && redeemedBy.length > 0) {
        return res.status(400).json({ error: 'Este código ya fue utilizado.' });
      }
      dias = Number(promo.dias_premium) || 30;
      promo.redimido_por = [...redeemedBy, caller.uid];
      localStore.write(state);

      const activation = await activateProIdempotent({
        uid: caller.uid,
        email: caller.email,
        customDays: dias,
        paymentKey: `PROMO-${cleanCode}-${caller.uid}`,
        refPayco: `PROMO-${cleanCode}`,
        billedAmount: 0,
        isTest: false,
        source: 'promo_code',
        promoCode: cleanCode,
      });

      return res.json({
        success: true,
        code: cleanCode,
        dias,
        planExpiresAt: activation.expiresAtIso,
      });
    } catch (err: any) {
      const msgMap: Record<string, { code: number; msg: string }> = {
        PROMO_NOT_FOUND: { code: 404, msg: 'El código ingresado no existe o no es válido.' },
        PROMO_INACTIVE: { code: 400, msg: 'Este código promocional ya no está activo o caducó.' },
        PROMO_EXPIRED: { code: 400, msg: 'Este código promocional ha expirado.' },
        PROMO_ALREADY_REDEEMED: { code: 400, msg: 'Ya has canjeado este código en tu cuenta.' },
        PROMO_EXHAUSTED: { code: 400, msg: 'Este código promocional de uso único ya fue redimido.' },
      };
      const mapped = msgMap[err?.message];
      if (mapped) return res.status(mapped.code).json({ error: mapped.msg });
      console.error('[Redeem Code] Error:', err);
      return res.status(500).json({ error: 'Ocurrió un error validando el código promocional.' });
    }
  });

  // =========================================================================
  // 8. SELECCIÓN EXPLÍCITA DE MESAS Y PRODUCTOS ACTIVOS AL PASAR A GRATIS
  // =========================================================================
  app.post('/api/subscription/selection', async (req: Request, res: Response) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: 'Sesión no autenticada.' });
    }

    const activeTableIds: string[] = Array.isArray(req.body?.activeTableIds)
      ? req.body.activeTableIds
      : [];
    const activeProductIds: string[] = Array.isArray(req.body?.activeProductIds)
      ? req.body.activeProductIds
      : [];
    const nowIso = new Date(getNowMs()).toISOString();

    try {
      let tables: Table[] = [];
      let products: Product[] = [];

      if (adminDb) {
        const [tablesSnap, menuSnap] = await Promise.all([
          adminDb.collection('users').doc(caller.uid).collection('mesas').get(),
          adminDb.collection('users').doc(caller.uid).collection('menu').get(),
        ]);
        tables = tablesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        products = menuSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      } else {
        const state = localStore.read();
        tables = state.tablesByUser[caller.uid] || [];
        products = state.productsByUser[caller.uid] || [];
      }

      const protectedTableIds = new Set(tables.filter(isTableProtected).map((t) => t.id));
      const protectedProductIds = getProtectedProductIds(tables);

      const tableValidation = validateActiveSelection({
        selectedIds: activeTableIds,
        items: tables,
        maxAllowed: FREE_MAX_TABLES,
        protectedIds: protectedTableIds,
        entityLabel: 'mesas',
      });
      if (!tableValidation.valid) {
        return res.status(400).json({ error: tableValidation.error });
      }

      const productValidation = validateActiveSelection({
        selectedIds: activeProductIds,
        items: products,
        maxAllowed: FREE_MAX_PRODUCTS,
        protectedIds: protectedProductIds,
        entityLabel: 'productos',
      });
      if (!productValidation.valid) {
        return res.status(400).json({ error: productValidation.error });
      }

      const activeTableSet = new Set(tableValidation.normalizedIds);
      const activeProductSet = new Set(productValidation.normalizedIds);

      if (adminDb) {
        const batch = adminDb.batch();
        const userRef = adminDb.collection('users').doc(caller.uid);

        tables.forEach((t) => {
          const isActive = activeTableSet.has(t.id);
          batch.set(
            userRef.collection('mesas').doc(t.id),
            { active: isActive, inactivatedReason: isActive ? null : 'free_over_limit' },
            { merge: true }
          );
        });

        products.forEach((p) => {
          const isActive = activeProductSet.has(p.id);
          const patch = { active: isActive, inactivatedReason: isActive ? null : 'free_over_limit' };
          batch.set(userRef.collection('menu').doc(p.id), patch, { merge: true });
          batch.set(userRef.collection('productos').doc(p.id), patch, { merge: true });
        });

        batch.set(
          userRef,
          {
            subscriptionSelection: {
              activeTableIds: tableValidation.normalizedIds,
              activeProductIds: productValidation.normalizedIds,
              updatedAt: nowIso,
            },
            lastQuotaReconciliationAt: nowIso,
          },
          { merge: true }
        );

        await batch.commit();
      } else {
        const state = localStore.read();
        state.tablesByUser[caller.uid] = tables.map((t) => {
          const isActive = activeTableSet.has(t.id);
          return { ...t, active: isActive, inactivatedReason: isActive ? null : 'free_over_limit' };
        });
        state.productsByUser[caller.uid] = products.map((p) => {
          const isActive = activeProductSet.has(p.id);
          return { ...p, active: isActive, inactivatedReason: isActive ? null : 'free_over_limit' };
        });
        state.users[caller.uid] = {
          ...(state.users[caller.uid] || { id: caller.uid, email: caller.email }),
          subscriptionSelection: {
            activeTableIds: tableValidation.normalizedIds,
            activeProductIds: productValidation.normalizedIds,
            updatedAt: nowIso,
          },
        };
        localStore.write(state);
      }

      await writeAuditLog(caller.uid, {
        action: 'over_limit_selection_saved',
        activeTableCount: tableValidation.normalizedIds.length,
        activeProductCount: productValidation.normalizedIds.length,
      });

      return res.json({
        success: true,
        activeTableIds: tableValidation.normalizedIds,
        activeProductIds: productValidation.normalizedIds,
        updatedAt: nowIso,
      });
    } catch (err) {
      console.error('[Subscription Selection] Error:', err);
      return res.status(500).json({ error: 'No se pudo guardar tu selección de mesas y productos activos.' });
    }
  });

  return app;
}
