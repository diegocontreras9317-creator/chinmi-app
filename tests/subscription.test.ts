import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import {
  addCalendarMonths,
  calculateNextBillingExpiry,
  deriveSubscriptionState,
  FREE_MAX_PRODUCTS,
  FREE_MAX_TABLES,
  getProtectedProductIds,
  GRACE_PERIOD_MS,
  isProductOperationalForNewOrders,
  isTableOperationalForNewOrders,
  isTableProtected,
  validateActiveSelection,
} from '../src/utils/subscription.ts';
import {
  computeEpaycoSignature,
  createSubscriptionApp,
  EXPECTED_PLAN_AMOUNTS,
} from '../api/_lib/subscriptionBackend.ts';
import { PLAN_DIFFERENCES } from '../src/config/pricingPlans.ts';
import type { Order, Product, Table, User } from '../src/types/index.ts';

function makeTables(count: number, opts?: { activeCount?: number; openOrderIndices?: number[] }): Table[] {
  const openSet = new Set(opts?.openOrderIndices || []);
  return Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    const id = `tbl-${n}`;
    const hasOpenOrder = openSet.has(idx);
    const active = opts?.activeCount === undefined ? true : idx < opts.activeCount;
    const order: Order | undefined = hasOpenOrder
      ? {
          id: `ord-${n}`,
          tableId: id,
          tableName: `Mesa ${n}`,
          items: [
            {
              id: `it-${n}`,
              productId: `prod-1`,
              name: `Producto 1`,
              unitPrice: 25000,
              quantity: 1,
              addedAt: '2026-11-01T12:00:00.000Z',
            },
          ],
          discountPercent: 0,
          taxPercent: 8,
          tipAmount: 0,
          openedAt: '2026-11-01T12:00:00.000Z',
          lastUpdatedAt: '2026-11-01T12:05:00.000Z',
          status: 'activa',
          estado: 'activa',
          closed: false,
        }
      : undefined;

    return {
      id,
      number: String(n),
      name: `Mesa ${n}`,
      seats: 4,
      zone: 'Salón Principal',
      status: hasOpenOrder ? 'ocupada' : 'libre',
      active,
      inactivatedReason: active ? null : 'free_over_limit',
      order,
    };
  });
}

function makeProducts(count: number, opts?: { activeCount?: number }): Product[] {
  return Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    const active = opts?.activeCount === undefined ? true : idx < opts.activeCount;
    return {
      id: `prod-${n}`,
      name: `Producto ${n}`,
      sku: `SKU-${n}`,
      category: 'Platos Principales',
      price: 25000,
      cost: 10000,
      stock: 20,
      minStock: 2,
      imageUrl: 'https://example.com/p.jpg',
      active,
      inactivatedReason: active ? null : 'free_over_limit',
    };
  });
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id || 'user-rest-1',
    name: overrides.name || 'Restaurante Prueba',
    email: overrides.email || 'gerente@restaurante.co',
    role: 'gerente',
    plan: overrides.plan || 'free',
    avatar: overrides.avatar || '',
    createdAt: overrides.createdAt || '2026-01-01T00:00:00.000Z',
    businessName: 'Restaurante Prueba',
    ...overrides,
  };
}

async function startTestServer(params: {
  initialState?: Record<string, any>;
  epaycoTestMode?: boolean;
  degradationEnabled?: boolean;
  epaycoPublicCustId?: string;
  epaycoPrivateKey?: string;
  epaycoFetcher?: (ref: string) => Promise<any>;
  nowRef?: { current: number };
}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chinmi-sub-test-'));
  const storePath = path.join(tmpDir, 'store.json');

  const baseState = {
    intents: {},
    transactions: {},
    payments: {},
    users: {},
    tablesByUser: {},
    productsByUser: {},
    promoCodes: {},
    auditLogs: [],
    ...(params.initialState || {}),
  };
  fs.writeFileSync(storePath, JSON.stringify(baseState), 'utf8');

  const nowRef = params.nowRef || { current: Date.parse('2026-11-10T12:00:00.000Z') };

  const app = createSubscriptionApp({
    adminDb: null,
    adminAuth: null,
    durableStorePath: storePath,
    now: () => nowRef.current,
    epaycoTestMode: params.epaycoTestMode ?? true,
    degradationEnabled: params.degradationEnabled ?? true,
    epaycoPublicCustId: params.epaycoPublicCustId ?? 'CUST_TEST_123',
    epaycoPrivateKey: params.epaycoPrivateKey ?? 'PKEY_TEST_SECRET',
    epaycoFetcher: params.epaycoFetcher,
    verifyTokenOverride: async (token: string) => {
      if (token === 'token-user-1') return { uid: 'user-rest-1', email: 'gerente@restaurante.co' };
      if (token === 'token-user-2') return { uid: 'user-rest-2', email: 'otro@restaurante.co' };
      return null;
    },
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    storePath,
    nowRef,
    readStore: () => JSON.parse(fs.readFileSync(storePath, 'utf8')),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

async function runTests() {
  const results: string[] = [];
  const test = async (name: string, fn: () => void | Promise<void>) => {
    await fn();
    results.push(`PASS: ${name}`);
  };

  const baseNow = Date.parse('2026-11-10T12:00:00.000Z');

  // 1. Usuario Free intenta crear 7ª mesa -> bloqueado
  await test('1. Usuario Free intenta crear 7ª mesa -> bloqueado', () => {
    const user = makeUser({ plan: 'free' });
    const tables5 = makeTables(5);
    const tables6 = makeTables(6);
    assert.equal(deriveSubscriptionState({ user, serverNowMs: baseNow, tables: tables5, products: [], degradationEnabled: true }).canCreateTable, true);
    const st6 = deriveSubscriptionState({ user, serverNowMs: baseNow, tables: tables6, products: [], degradationEnabled: true });
    assert.equal(st6.canCreateTable, false);
    assert.equal(FREE_MAX_TABLES, 6);
  });

  // 2. Usuario Free intenta crear 16º producto -> bloqueado
  await test('2. Usuario Free intenta crear 16º producto -> bloqueado', () => {
    const user = makeUser({ plan: 'free' });
    const prods14 = makeProducts(14);
    const prods15 = makeProducts(15);
    assert.equal(deriveSubscriptionState({ user, serverNowMs: baseNow, tables: [], products: prods14, degradationEnabled: true }).canCreateProduct, true);
    const st15 = deriveSubscriptionState({ user, serverNowMs: baseNow, tables: [], products: prods15, degradationEnabled: true });
    assert.equal(st15.canCreateProduct, false);
    assert.equal(FREE_MAX_PRODUCTS, 15);
  });

  // 3. Usuario PRO crea 65 mesas y 250 productos -> permitido
  await test('3. Usuario PRO crea 65 mesas y 250 productos -> permitido', () => {
    const proUser = makeUser({
      plan: 'pro',
      planExpiresAt: new Date(baseNow + 20 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const st = deriveSubscriptionState({
      user: proUser,
      serverNowMs: baseNow,
      tables: makeTables(65),
      products: makeProducts(250),
      degradationEnabled: true,
    });
    assert.equal(st.status, 'pro_active');
    assert.equal(st.hasProAccess, true);
    assert.equal(st.canCreateTable, true);
    assert.equal(st.canCreateProduct, true);
    assert.equal(st.isOverLimit, false);
  });

  // 4 & 5. Vencimiento PRO -> período de gracia 72h y operación completa
  await test('4 & 5. Suscripción PRO vence -> entra en gracia de 72h manteniendo operación completa', async () => {
    const expiryMs = baseNow - 60 * 60 * 1000; // Venció hace 1 hora
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'pro',
            subscriptionStatus: 'pro_active',
            planExpiresAt: new Date(expiryMs).toISOString(),
          },
        },
        tablesByUser: { 'user-rest-1': makeTables(65) },
        productsByUser: { 'user-rest-1': makeProducts(250) },
      },
    });

    try {
      const res = await fetch(`${srv.baseUrl}/api/subscription/status`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.subscription.status, 'pro_grace');
      assert.equal(body.subscription.derived.hasProAccess, true);
      assert.equal(body.subscription.derived.warningMilestone, 'grace');
      assert.equal(body.subscription.derived.hoursRemainingInGrace, 71);
      assert.equal(body.subscription.derived.canCreateTable, true);
      assert.equal(body.subscription.derived.canCreateProduct, true);

      const store = srv.readStore();
      assert.equal(store.users['user-rest-1'].subscriptionStatus, 'pro_grace');
      assert.ok(store.auditLogs.some((l: any) => l.action === 'entered_grace_period'));
    } finally {
      await srv.close();
    }
  });

  // 6, 7, 8, 9. Terminan las 72h -> free_over_limit sin borrar nada, permite cobrar abiertas, no selecciona silenciosamente
  await test('6, 7, 8 & 9. Tras 72h pasa a free_over_limit, conserva 65 mesas y 250 productos, protege abiertas y exige selección explícita', async () => {
    const expiryMs = baseNow - GRACE_PERIOD_MS - 1000; // Terminó gracia hace 1s
    const tables65 = makeTables(65, { openOrderIndices: [59] }); // Mesa 60 con pedido abierto
    const prods250 = makeProducts(250);

    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'pro',
            subscriptionStatus: 'pro_grace',
            planExpiresAt: new Date(expiryMs).toISOString(),
            graceEndsAt: new Date(expiryMs + GRACE_PERIOD_MS).toISOString(),
          },
        },
        tablesByUser: { 'user-rest-1': tables65 },
        productsByUser: { 'user-rest-1': prods250 },
      },
    });

    try {
      const res = await fetch(`${srv.baseUrl}/api/subscription/status`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.subscription.status, 'free_over_limit');
      assert.equal(body.subscription.rawPlan, 'free');
      assert.equal(body.subscription.derived.needsTableSelection, true);
      assert.equal(body.subscription.derived.needsProductSelection, true);
      assert.equal(body.subscription.derived.needsOverLimitSelection, true);
      assert.equal(body.subscription.derived.totalTablesCount, 65);
      assert.equal(body.subscription.derived.totalProductsCount, 250);

      // Conserva las 65 mesas y 250 productos sin borrado
      const store = srv.readStore();
      assert.equal(store.tablesByUser['user-rest-1'].length, 65);
      assert.equal(store.productsByUser['user-rest-1'].length, 250);
      assert.ok(store.auditLogs.some((l: any) => l.action === 'downgraded_after_grace'));

      // Mesa 60 con pedido abierto sigue siendo operable para cobrar/cerrar, incluso si estuviera inactiva
      const closedAndInactive = { ...tables65[59], active: false };
      assert.equal(isTableProtected(closedAndInactive), true);
      assert.equal(isTableOperationalForNewOrders(closedAndInactive, body.subscription.derived), true);

      // Despensa, Zonas, QR y Excel/CSV siguen incluidos en Gratis
      const unlockedInFree = PLAN_DIFFERENCES.filter((d) => /despensa|zonas|qr|exportación/i.test(d.feature));
      assert.ok(unlockedInFree.length >= 4);
      assert.ok(unlockedInFree.every((d) => /^Incluido/i.test(d.freeText)));
    } finally {
      await srv.close();
    }
  });

  // 10 & 11 & 12. Selección manual de 6 mesas y 15 productos, rechazo al desactivar pedido abierto, bloqueo en QR y nuevos ítems
  await test('10, 11 & 12. Selección manual 6 mesas/15 productos, protege pedidos abiertos y bloquea operaciones nuevas en inactivas', async () => {
    const tables65 = makeTables(65, { openOrderIndices: [59] }); // Mesa 60 (tbl-60) tiene pedido abierto con prod-1
    const prods250 = makeProducts(250);

    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'free',
            subscriptionStatus: 'free_over_limit',
          },
        },
        tablesByUser: { 'user-rest-1': tables65 },
        productsByUser: { 'user-rest-1': prods250 },
      },
    });

    try {
      // 11a. Intento excluir Mesa 60 con pedido abierto -> rechazado (400)
      const failTableRes = await fetch(`${srv.baseUrl}/api/subscription/selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          activeTableIds: ['tbl-1', 'tbl-2', 'tbl-3', 'tbl-4', 'tbl-5', 'tbl-6'],
          activeProductIds: Array.from({ length: 15 }, (_, i) => `prod-${i + 1}`),
        }),
      });
      assert.equal(failTableRes.status, 400);

      // 11b. Intento excluir Producto 1 presente en comanda abierta -> rechazado (400)
      const failProdRes = await fetch(`${srv.baseUrl}/api/subscription/selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          activeTableIds: ['tbl-1', 'tbl-2', 'tbl-3', 'tbl-4', 'tbl-5', 'tbl-60'],
          activeProductIds: Array.from({ length: 15 }, (_, i) => `prod-${i + 2}`),
        }),
      });
      assert.equal(failProdRes.status, 400);

      // 10. Selección válida que incluye tbl-60 y prod-1 -> éxito (200)
      const okRes = await fetch(`${srv.baseUrl}/api/subscription/selection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token-user-1',
        },
        body: JSON.stringify({
          activeTableIds: ['tbl-1', 'tbl-2', 'tbl-3', 'tbl-4', 'tbl-5', 'tbl-60'],
          activeProductIds: Array.from({ length: 15 }, (_, i) => `prod-${i + 1}`),
        }),
      });
      assert.equal(okRes.status, 200);

      const store = srv.readStore();
      const updatedTables: Table[] = store.tablesByUser['user-rest-1'];
      const updatedProds: Product[] = store.productsByUser['user-rest-1'];
      assert.equal(updatedTables.filter((t) => t.active !== false).length, 6);
      assert.equal(updatedTables.filter((t) => t.active === false).length, 59);
      assert.equal(updatedProds.filter((p) => p.active !== false).length, 15);
      assert.equal(updatedProds.filter((p) => p.active === false).length, 235);

      const derivedAfter = deriveSubscriptionState({
        user: store.users['user-rest-1'],
        serverNowMs: baseNow,
        tables: updatedTables,
        products: updatedProds,
        degradationEnabled: true,
      });
      assert.equal(derivedAfter.needsOverLimitSelection, false);
      assert.equal(derivedAfter.canCreateTable, false);
      assert.equal(derivedAfter.canCreateProduct, false);

      // 12. Mesa inactiva sin pedido abierto y producto inactivo no admiten nuevos pedidos
      const pausedTable = updatedTables.find((t) => t.id === 'tbl-10')!;
      const pausedProd = updatedProds.find((p) => p.id === 'prod-50')!;
      const protectedProds = getProtectedProductIds(updatedTables);
      assert.equal(isTableOperationalForNewOrders(pausedTable, derivedAfter), false);
      assert.equal(isProductOperationalForNewOrders(pausedProd, derivedAfter, protectedProds), false);

      // Validar que firestore.rules y submitQrOrderTransaction bloquean QR sobre mesa inactiva sin orden abierta
      const fsStorageCode = fs.readFileSync(path.join(process.cwd(), 'src/services/firestoreUserStorage.ts'), 'utf8');
      assert.ok(fsStorageCode.includes('tableData.active === false && !activeOrder'));
    } finally {
      await srv.close();
    }
  });

  // 13. Al volver a pagar PRO -> todas las 65 mesas y 250 productos recuperan active: true automáticamente
  await test('13. Al volver a pagar PRO reactiva automáticamente las 65 mesas y 250 productos sin perder historia', async () => {
    const tables65 = makeTables(65, { activeCount: 6 });
    tables65[64] = { ...tables65[64], active: false, inactivatedReason: 'manual' }; // 1 inactiva manual no debe reactivarse a la fuerza
    const prods250 = makeProducts(250, { activeCount: 15 });

    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'free',
            subscriptionStatus: 'free_over_limit',
          },
        },
        tablesByUser: { 'user-rest-1': tables65 },
        productsByUser: { 'user-rest-1': prods250 },
      },
      epaycoFetcher: async (ref) => ({
        success: true,
        data: {
          x_ref_payco: ref,
          x_transaction_id: 'TX-REACTIVATE-001',
          x_id_invoice: lastInvoice,
          x_amount: 89000,
          x_currency_code: 'COP',
          x_cod_response: 1,
          x_response: 'Aceptada',
          x_test_request: 'TRUE',
          x_extra1: 'user-rest-1',
          x_extra3: 'monthly',
        },
      }),
    });

    let lastInvoice = '';
    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'monthly' }),
      });
      const intentData = await intentRes.json();
      lastInvoice = intentData.invoice;

      const verifyRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-REACT-1', invoice: lastInvoice, planId: 'monthly' }),
      });
      assert.equal(verifyRes.status, 200);
      const verifyBody = await verifyRes.json();
      assert.equal(verifyBody.verified, true);

      const store = srv.readStore();
      assert.equal(store.users['user-rest-1'].plan, 'pro');
      // 64 mesas recuperan active: true, mientras la manualmente pausada sigue manual
      assert.equal(store.tablesByUser['user-rest-1'].filter((t: Table) => t.active === true).length, 64);
      assert.equal(store.tablesByUser['user-rest-1'][64].inactivatedReason, 'manual');
      // 250 productos quedan todos activos
      assert.equal(store.productsByUser['user-rest-1'].filter((p: Product) => p.active === true).length, 250);
    } finally {
      await srv.close();
    }
  });

  // 14, 15, 16. Alertas preventivas 7 días, 3 días y 1 día
  await test('14, 15 & 16. Alertas preventivas a 7, 3 y 1 día del vencimiento', () => {
    const proAt = (daysFromNow: number) =>
      makeUser({
        plan: 'pro',
        planExpiresAt: new Date(baseNow + daysFromNow * 24 * 60 * 60 * 1000).toISOString(),
      });

    const d7 = deriveSubscriptionState({ user: proAt(6.5), serverNowMs: baseNow, degradationEnabled: true });
    assert.equal(d7.warningMilestone, '7d');
    assert.equal(d7.daysUntilExpiry, 7);

    const d3 = deriveSubscriptionState({ user: proAt(2.8), serverNowMs: baseNow, degradationEnabled: true });
    assert.equal(d3.warningMilestone, '3d');
    assert.equal(d3.daysUntilExpiry, 3);

    const d1 = deriveSubscriptionState({ user: proAt(0.75), serverNowMs: baseNow, degradationEnabled: true });
    assert.equal(d1.warningMilestone, '1d');
    assert.equal(d1.daysUntilExpiry, 1);

    const d15 = deriveSubscriptionState({ user: proAt(15), serverNowMs: baseNow, degradationEnabled: true });
    assert.equal(d15.warningMilestone, null);
  });

  // 17. Ciclos reales mensual, trimestral, anual + meses de 28/29/30/31 días + bisiestos
  await test('17. Ciclos reales +1/+3/+12 meses calendario (fin de mes y bisiestos)', () => {
    const jan31NonLeap = new Date('2026-01-31T15:00:00.000Z');
    assert.equal(addCalendarMonths(jan31NonLeap, 1).toISOString(), '2026-02-28T15:00:00.000Z');

    const jan31Leap = new Date('2024-01-31T15:00:00.000Z');
    assert.equal(addCalendarMonths(jan31Leap, 1).toISOString(), '2024-02-29T15:00:00.000Z');

    const feb29Leap = new Date('2024-02-29T10:00:00.000Z');
    assert.equal(addCalendarMonths(feb29Leap, 12).toISOString(), '2025-02-28T10:00:00.000Z');

    const nov30 = Date.parse('2025-11-30T12:00:00.000Z');
    assert.equal(
      calculateNextBillingExpiry({ nowMs: nov30, frequency: 'quarterly' }).toISOString(),
      '2026-02-28T12:00:00.000Z'
    );

    const may15 = Date.parse('2026-05-15T08:30:00.000Z');
    assert.equal(
      calculateNextBillingExpiry({ nowMs: may15, frequency: 'monthly' }).toISOString(),
      '2026-06-15T08:30:00.000Z'
    );
    assert.equal(
      calculateNextBillingExpiry({ nowMs: may15, frequency: 'annual' }).toISOString(),
      '2027-05-15T08:30:00.000Z'
    );
  });

  // 18. Renovación estando en PRO activo o en gracia suma sobre fecha vigente sin perder días restantes
  await test('18. Renovación estando en PRO activo acumula sobre vencimiento vigente sin perder días', async () => {
    const remainingExpiryIso = '2026-11-25T12:00:00.000Z'; // 15 días restantes desde baseNow
    let invoice = '';
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'pro',
            subscriptionStatus: 'pro_active',
            planExpiresAt: remainingExpiryIso,
          },
        },
      },
      epaycoFetcher: async (ref) => ({
        success: true,
        data: {
          x_ref_payco: ref,
          x_transaction_id: 'TX-STACK-1',
          x_id_invoice: invoice,
          x_amount: 89000,
          x_currency_code: 'COP',
          x_cod_response: 1,
          x_response: 'Aceptada',
          x_test_request: 'TRUE',
          x_extra1: 'user-rest-1',
          x_extra3: 'monthly',
        },
      }),
    });

    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'monthly' }),
      });
      invoice = (await intentRes.json()).invoice;

      const verifyRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-STACK-1', invoice }),
      });
      const body = await verifyRes.json();
      assert.equal(body.verified, true);
      // 2026-11-25 + 1 mes calendario = 2026-12-25
      assert.equal(body.planExpiresAt, '2026-12-25T12:00:00.000Z');
    } finally {
      await srv.close();
    }
  });

  // 19. Cancelación voluntaria mantiene PRO hasta fin del período pagado
  await test('19. Cancelación voluntaria marca cancelAtPeriodEnd=true y mantiene PRO hasta vencimiento', async () => {
    const expiryIso = new Date(baseNow + 10 * 24 * 60 * 60 * 1000).toISOString();
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'pro',
            subscriptionStatus: 'pro_active',
            planExpiresAt: expiryIso,
          },
        },
      },
    });

    try {
      const cancelRes = await fetch(`${srv.baseUrl}/api/subscription/cancel`, {
        method: 'POST',
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(cancelRes.status, 200);
      const cancelBody = await cancelRes.json();
      assert.equal(cancelBody.cancelAtPeriodEnd, true);

      const statusRes = await fetch(`${srv.baseUrl}/api/subscription/status`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      const statusBody = await statusRes.json();
      assert.equal(statusBody.subscription.status, 'pro_active');
      assert.equal(statusBody.subscription.cancelAtPeriodEnd, true);
      assert.equal(statusBody.subscription.derived.hasProAccess, true);
    } finally {
      await srv.close();
    }
  });

  // 20. Pago duplicado / replay webhook es idempotente
  await test('20. Pago duplicado y replay de webhook es estrictamente idempotente', async () => {
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoPublicCustId: 'CUST_99',
      epaycoPrivateKey: 'PKEY_99',
    });

    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'monthly' }),
      });
      const { invoice } = await intentRes.json();

      const sig = computeEpaycoSignature({
        custId: 'CUST_99',
        pKey: 'PKEY_99',
        refPayco: 'REF-IDEMP-1',
        transactionId: 'TX-IDEMP-1',
        amount: '89000',
        currencyCode: 'COP',
      });

      const webhookBody = {
        x_ref_payco: 'REF-IDEMP-1',
        x_transaction_id: 'TX-IDEMP-1',
        x_id_invoice: invoice,
        x_amount: '89000',
        x_currency_code: 'COP',
        x_cod_response: 1,
        x_response: 'Aceptada',
        x_signature: sig,
      };

      const w1 = await fetch(`${srv.baseUrl}/api/epayco/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookBody),
      });
      assert.equal(w1.status, 200);
      const firstExpiry = srv.readStore().users['user-rest-1'].planExpiresAt;

      // Replay webhook + verify-subscription
      const w2 = await fetch(`${srv.baseUrl}/api/epayco/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookBody),
      });
      assert.equal(w2.status, 200);

      const v2 = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-IDEMP-1', invoice }),
      });
      const v2Body = await v2.json();
      assert.equal(v2Body.alreadyProcessed, true);
      assert.equal(srv.readStore().users['user-rest-1'].planExpiresAt, firstExpiry);
    } finally {
      await srv.close();
    }
  });

  // 21. Monto insuficiente o manipulado contra intent -> rechazado
  await test('21. Monto insuficiente o manipulado contra subscription_intent -> rechazado (400)', async () => {
    let invoice = '';
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoFetcher: async (ref) => ({
        success: true,
        data: {
          x_ref_payco: ref,
          x_transaction_id: 'TX-UNDERPAY',
          x_id_invoice: invoice,
          x_amount: EXPECTED_PLAN_AMOUNTS.monthly, // 89000 en lugar de 854400
          x_currency_code: 'COP',
          x_cod_response: 1,
          x_response: 'Aceptada',
          x_extra1: 'user-rest-1',
        },
      }),
    });

    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'annual' }),
      });
      invoice = (await intentRes.json()).invoice;

      const verifyRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-UNDERPAY', invoice, planId: 'monthly' }), // intento spoofing
      });
      assert.equal(verifyRes.status, 400);
      const body = await verifyRes.json();
      assert.equal(body.status, 'amount_mismatch');
      assert.equal(srv.readStore().users['user-rest-1']?.plan, undefined);
    } finally {
      await srv.close();
    }
  });

  // 22. Pago rechazado / pendiente PSE -> no activa PRO
  await test('22. Pago rechazado o pendiente PSE no activa PRO', async () => {
    let currentCod = 3;
    let invoice = '';
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoFetcher: async (ref) => ({
        success: true,
        data: {
          x_ref_payco: ref,
          x_transaction_id: `TX-${currentCod}`,
          x_id_invoice: invoice,
          x_amount: 89000,
          x_currency_code: 'COP',
          x_cod_response: currentCod,
          x_response: currentCod === 3 ? 'Pendiente' : 'Rechazada',
        },
      }),
    });

    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'monthly' }),
      });
      invoice = (await intentRes.json()).invoice;

      currentCod = 3;
      const pendRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-PSE-PEND', invoice }),
      });
      const pendBody = await pendRes.json();
      assert.equal(pendBody.verified, false);
      assert.equal(pendBody.status, 'pending');

      currentCod = 2;
      const rejRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-CARD-REJ', invoice }),
      });
      assert.equal(rejRes.status, 400);
      assert.equal((await rejRes.json()).status, 'rejected');
      assert.equal(srv.readStore().users['user-rest-1']?.plan, undefined);
    } finally {
      await srv.close();
    }
  });

  // 23. Referencia falsa en modo pruebas -> rechazada (no auto-aprobada)
  await test('23. Referencia falsa o inexistente en modo pruebas es rechazada (sin fallback ciego)', async () => {
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoTestMode: true,
      epaycoFetcher: async () => ({ success: false }),
    });

    try {
      const res = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'FAKE-REF-9999', planId: 'annual' }),
      });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.equal(body.verified, false);
      assert.equal(body.status, 'not_found');
    } finally {
      await srv.close();
    }
  });

  // 24. Firma webhook x_signature inválida o ausente -> rechazada (400)
  await test('24. Firma webhook x_signature inválida o ausente es rechazada (400)', async () => {
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoPublicCustId: 'CUST_REAL',
      epaycoPrivateKey: 'KEY_REAL',
    });

    try {
      const missingRes = await fetch(`${srv.baseUrl}/api/epayco/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x_ref_payco: 'REF-BADSIG',
          x_transaction_id: 'TX-BADSIG',
          x_id_invoice: 'INV-BADSIG',
          x_amount: '89000',
          x_currency_code: 'COP',
          x_cod_response: 1,
        }),
      });
      assert.equal(missingRes.status, 400);

      const badRes = await fetch(`${srv.baseUrl}/api/epayco/confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x_ref_payco: 'REF-BADSIG',
          x_transaction_id: 'TX-BADSIG',
          x_id_invoice: 'INV-BADSIG',
          x_amount: '89000',
          x_currency_code: 'COP',
          x_cod_response: 1,
          x_signature: '0000forgedsignature',
        }),
      });
      assert.equal(badRes.status, 400);
      assert.equal(srv.readStore().transactions['INV-BADSIG'], undefined);
    } finally {
      await srv.close();
    }
  });

  // 25. Transacción x_test_request=true en entorno live -> rechazada (400)
  await test('25. Transacción x_test_request=true en entorno live es rechazada (400)', async () => {
    let invoice = '';
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      epaycoTestMode: false, // live mode
      epaycoFetcher: async (ref) => ({
        success: true,
        data: {
          x_ref_payco: ref,
          x_transaction_id: 'TX-TEST-IN-LIVE',
          x_id_invoice: invoice,
          x_amount: 89000,
          x_currency_code: 'COP',
          x_cod_response: 1,
          x_response: 'Aceptada',
          x_test_request: 'TRUE',
          x_extra1: 'user-rest-1',
        },
      }),
    });

    try {
      const intentRes = await fetch(`${srv.baseUrl}/api/epayco/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ planId: 'monthly' }),
      });
      invoice = (await intentRes.json()).invoice;

      const verifyRes = await fetch(`${srv.baseUrl}/api/epayco/verify-subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ refPayco: 'REF-TEST-LIVE', invoice }),
      });
      assert.equal(verifyRes.status, 400);
      assert.equal((await verifyRes.json()).status, 'test_tx_in_live_mode');
    } finally {
      await srv.close();
    }
  });

  // 26. Auto-elevación bloqueada en firestore.rules + canje seguro de códigos
  await test('26. firestore.rules bloquea auto-elevación a PRO y /api/subscription/redeem-code valida en servidor', async () => {
    const rules = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
    assert.ok(rules.includes('protectedUserSubscriptionFields()'));
    assert.ok(rules.includes('!incoming().diff(existing()).affectedKeys().hasAny(protectedUserSubscriptionFields())'));
    assert.ok(rules.includes('match /codigos_promocionales/{codigoId} {\n      allow read, write: if false;'));
    assert.ok(rules.includes('match /epayco_payments/{paymentId} {\n      allow read, write: if false;'));
    assert.ok(rules.includes('match /subscription_intents/{intentId} {\n      allow read, write: if false;'));

    const srv = await startTestServer({
      nowRef: { current: baseNow },
      initialState: {
        promoCodes: {
          CHINMI30: {
            activo: true,
            dias_premium: 30,
            uso_unico: true,
            redimido_por: [],
          },
        },
      },
    });

    try {
      // Sin autenticación
      const unauthRes = await fetch(`${srv.baseUrl}/api/subscription/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'CHINMI30' }),
      });
      assert.equal(unauthRes.status, 401);

      // Código inexistente
      const notFoundRes = await fetch(`${srv.baseUrl}/api/subscription/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ code: 'NOEXISTE' }),
      });
      assert.equal(notFoundRes.status, 404);

      // Canje válido usuario 1
      const okRes = await fetch(`${srv.baseUrl}/api/subscription/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ code: 'CHINMI30' }),
      });
      assert.equal(okRes.status, 200);
      assert.equal(srv.readStore().users['user-rest-1'].plan, 'pro');

      // Reuso por mismo usuario o segundo usuario en uso_unico -> rechazado (400)
      const reuseSame = await fetch(`${srv.baseUrl}/api/subscription/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-1' },
        body: JSON.stringify({ code: 'CHINMI30' }),
      });
      assert.equal(reuseSame.status, 400);

      const reuseOther = await fetch(`${srv.baseUrl}/api/subscription/redeem-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-user-2' },
        body: JSON.stringify({ code: 'CHINMI30' }),
      });
      assert.equal(reuseOther.status, 400);
    } finally {
      await srv.close();
    }
  });

  // 27. Deshacer eliminación de producto en límite o sobre límite no habilita creación arbitraria
  await test('27. Undo de producto eliminado en límite o over-limit restaura sin abrir bypass de creación', () => {
    const invCode = fs.readFileSync(path.join(process.cwd(), 'src/components/inventory/InventoryModule.tsx'), 'utf8');
    assert.ok(invCode.includes('undoDeletedProduct(deletedToast.product.id)'));
    assert.equal(invCode.includes('addProduct(deletedToast.product)'), false);

    // Simular cuenta free_over_limit con 15 activos + 234 inactivos después de borrar 1 inactivo
    const overLimitUser = makeUser({ plan: 'free', subscriptionStatus: 'free_over_limit' });
    const prods249 = makeProducts(249, { activeCount: 15 });
    const st249 = deriveSubscriptionState({
      user: overLimitUser,
      serverNowMs: baseNow,
      tables: makeTables(6),
      products: prods249,
      degradationEnabled: true,
    });
    assert.equal(st249.canCreateProduct, false);
    assert.equal(st249.activeProductsCount, 15);
    // Si restaura respetando isStillOverActiveLimit, el producto restaurado conserva active: false y activeCount sigue en 15
    const stillOverActiveLimit =
      !st249.hasProAccess &&
      st249.degradationEnabled &&
      prods249.filter((p) => p.active !== false).length >= FREE_MAX_PRODUCTS;
    assert.equal(stillOverActiveLimit, true);
  });

  // 28. Bandera de despliegue controlado desactivada (degradationEnabled = false)
  await test('28. Bandera degradationEnabled=false evita bloqueos durante despliegue gradual', async () => {
    const expiryMs = baseNow - GRACE_PERIOD_MS - 5000;
    const srv = await startTestServer({
      nowRef: { current: baseNow },
      degradationEnabled: false,
      initialState: {
        users: {
          'user-rest-1': {
            id: 'user-rest-1',
            email: 'gerente@restaurante.co',
            plan: 'pro',
            subscriptionStatus: 'pro_grace',
            planExpiresAt: new Date(expiryMs).toISOString(),
            graceEndsAt: new Date(expiryMs + GRACE_PERIOD_MS).toISOString(),
          },
        },
        tablesByUser: { 'user-rest-1': makeTables(65, { activeCount: 6 }) },
        productsByUser: { 'user-rest-1': makeProducts(250, { activeCount: 15 }) },
      },
    });

    try {
      const res = await fetch(`${srv.baseUrl}/api/subscription/status`, {
        headers: { Authorization: 'Bearer token-user-1' },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.capabilities.degradationEnabled, false);
      assert.equal(body.subscription.derived.isOverLimit, false);
      assert.equal(body.subscription.derived.needsOverLimitSelection, false);
      assert.equal(body.subscription.derived.canCreateTable, true);
      assert.equal(body.subscription.derived.canCreateProduct, true);

      const pausedTbl = srv.readStore().tablesByUser['user-rest-1'][10];
      assert.equal(isTableOperationalForNewOrders(pausedTbl, body.subscription.derived), true);
    } finally {
      await srv.close();
    }
  });

  console.log(`\nExecuted ${results.length} subscription test suites:`);
  results.forEach((r) => console.log(`  ${r}`));
}

runTests().catch((err) => {
  console.error('Subscription test failure:', err);
  process.exit(1);
});
