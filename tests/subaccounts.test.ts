import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

import {
  allocateIntegerShares,
  allocateWeightedShares,
  buildSubaccountCheckoutPlan,
  computeOrderSubaccountsSummary,
  createTableSubaccount,
  generatePaymentOperationId,
  generateTableSessionId,
  mergeSubaccountsGroup,
  moveOrderItemToSubaccount,
  resolveUniqueSubaccountName,
  splitOrderItemCustomAmounts,
  splitOrderItemEqually,
  unmergeSubaccountsGroup,
} from '../src/utils/subaccounts';
import { computeSaleInventoryUpdates } from '../src/utils/recipeUnits';
import { normalizeSalesForExport } from '../src/components/billing/billingStorageService';
import { generalExcelExportAdapter } from '../src/components/billing/adapters/GeneralExcelExportAdapter';
import { generalCsvExportAdapter } from '../src/components/billing/adapters/GeneralCsvExportAdapter';
import { siigoExcelExportAdapter } from '../src/components/billing/adapters/SiigoExcelExportAdapter';
import { loggroExcelExportAdapter } from '../src/components/billing/adapters/LoggroExcelExportAdapter';
import { alegraExportAdapter } from '../src/components/billing/adapters/AlegraExportAdapter';
import { defaultAppConfig } from '../src/config/appConfig';
import type {
  Order,
  OrderItem,
  PerishableItem,
  Product,
  SaleReceipt,
  TableSubaccount,
} from '../src/types';
import type { ExportGeneratorOptions } from '../src/components/billing/adapters/types';

function makeOrderItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: overrides.id || `it-${Math.random().toString(36).slice(2, 8)}`,
    productId: overrides.productId || 'prod-burger',
    name: overrides.name || 'Hamburguesa Clásica',
    unitPrice: overrides.unitPrice ?? 25000,
    quantity: overrides.quantity ?? 1,
    taxType: overrides.taxType || 'impoconsumo',
    taxRate: overrides.taxRate ?? 8,
    addedAt: '2026-11-13T12:00:00.000Z',
    orderedBy: 'cliente',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  const items = overrides.items || [];
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return {
    id: overrides.id || 'ord-test-1',
    tableId: overrides.tableId || 'mesa-1',
    tableName: overrides.tableName || 'Mesa 1',
    tableSessionId: overrides.tableSessionId || 'sess-mesa1-test',
    items,
    subaccounts: overrides.subaccounts || [],
    discountPercent: overrides.discountPercent ?? 0,
    taxPercent: overrides.taxPercent ?? 8,
    tipAmount: overrides.tipAmount ?? 0,
    openedAt: '2026-11-13T12:00:00.000Z',
    lastUpdatedAt: '2026-11-13T12:00:00.000Z',
    status: 'activa',
    estado: 'activa',
    closed: false,
    subtotal,
    total: subtotal,
    ...overrides,
  };
}

const sampleRestaurantProfile: ExportGeneratorOptions = {
  restaurant: {
    businessName: 'Chinmi Gastro Test SAS',
    nit: '900123456',
    dv: '7',
    address: 'Calle 10 # 43A-20',
    city: 'Medellín',
    department: 'Antioquia',
    daneCode: '05001',
    email: 'facturacion@chinmitest.co',
    phone: '3001234567',
    taxRegime: 'no_responsable_iva',
    fiscalResponsibilities: ['R-99-PN'],
    defaultTaxType: 'impoconsumo',
    defaultTaxRate: 8,
    siigoVoucherType: 'FV-1',
    loggroVoucherType: 'FV',
  },
  dateRangeLabel: 'Noviembre 2026',
  includeCustomerFicha: true,
};

async function runTests() {
  const results: string[] = [];
  const test = async (name: string, fn: () => void | Promise<void>) => {
    await fn();
    results.push(`PASS: ${name}`);
  };

  // 1. Subaccounts disabled mode keeps classic table/checkout behavior
  await test('1. Modo subaccountsMode=disabled conserva flujo clásico sin fricción', () => {
    assert.equal(defaultAppConfig.qrSettings.subaccountsMode, 'disabled');
    const items = [
      makeOrderItem({ id: 'it-1', name: 'Ramen Tonkotsu', unitPrice: 36000, quantity: 2 }),
      makeOrderItem({ id: 'it-2', name: 'Limonada', unitPrice: 9000, quantity: 1 }),
    ];
    const order = makeOrder({ items, subaccounts: [] });
    const plan = buildSubaccountCheckoutPlan({
      order,
      paymentMethod: 'efectivo',
      cashTendered: 90000,
    });
    assert.equal(plan.shouldReleaseTable, true);
    assert.equal(plan.isPartialTableCheckout, false);
    assert.equal(plan.total, 81000);
    assert.equal(plan.change, 9000);
    assert.equal(plan.affectedSubaccountIds.length, 0);
    assert.equal(plan.receiptItems.length, 2);
  });

  // 2. Concurrent multi-phone QR orders simulated & merged cleanly into same order/subaccounts
  await test('2. Pedidos QR concurrentes de múltiples celulares conservan ítems y subcuentas', () => {
    const sessId = generateTableSessionId('mesa-4');
    const subAna = createTableSubaccount({ id: 'sub-ana', tableId: 'mesa-4', tableSessionId: sessId, desiredName: 'Ana' });
    const subLuis = createTableSubaccount({
      id: 'sub-luis',
      tableId: 'mesa-4',
      tableSessionId: sessId,
      desiredName: 'Luis',
      existingSubaccounts: [subAna],
    });
    const orderFromAna = makeOrder({
      tableId: 'mesa-4',
      tableSessionId: sessId,
      subaccounts: [subAna],
      items: [makeOrderItem({ id: 'it-ana-1', name: 'Sushi Roll', unitPrice: 32000, subaccountId: subAna.id, subaccountName: subAna.displayName })],
    });
    // Simulate concurrent merge of Luis onto latest state
    const mergedOrder = makeOrder({
      ...orderFromAna,
      subaccounts: [...(orderFromAna.subaccounts || []), subLuis],
      items: [
        ...orderFromAna.items,
        makeOrderItem({ id: 'it-luis-1', name: 'Cerveza Artesanal', unitPrice: 14000, subaccountId: subLuis.id, subaccountName: subLuis.displayName }),
      ],
    });
    const summary = computeOrderSubaccountsSummary(mergedOrder, 8);
    assert.equal(summary.tablePendingGross, 46000);
    assert.equal(summary.subaccounts.length, 2);
    assert.equal(summary.subaccounts.find((s) => s.subaccountId === 'sub-ana')?.pendingGross, 32000);
    assert.equal(summary.subaccounts.find((s) => s.subaccountId === 'sub-luis')?.pendingGross, 14000);
  });

  // 3. Homonym auto-disambiguation
  await test('3. Autodesambiguación determinista de homónimos (Juan, Juan #2, Juan #3)', () => {
    const first = resolveUniqueSubaccountName('Juan', []);
    assert.equal(first.displayName, 'Juan');
    const sub1: TableSubaccount = {
      id: 'sub-1',
      tableId: 'm1',
      tableSessionId: 's1',
      displayName: first.displayName,
      baseName: first.baseName,
      status: 'activa',
      createdAt: '',
      updatedAt: '',
    };
    const second = resolveUniqueSubaccountName('  juan  ', [sub1]);
    assert.equal(second.displayName, 'juan #2');
    const sub2: TableSubaccount = { ...sub1, id: 'sub-2', displayName: second.displayName, baseName: second.baseName };
    const third = resolveUniqueSubaccountName('Juan', [sub1, sub2]);
    assert.equal(third.displayName, 'Juan #3');
  });

  // 4. Moving unpaid items & blocking movement/split of paid items
  await test('4. Mover ítems no pagados y bloquear movimiento o división de ítems ya pagados', () => {
    const unpaid = makeOrderItem({ id: 'it-u', subaccountId: 'sub-a', subaccountName: 'Ana', paidAmount: 0 });
    const paid = makeOrderItem({ id: 'it-p', subaccountId: 'sub-a', subaccountName: 'Ana', unitPrice: 20000, paidAmount: 20000 });
    const moved = moveOrderItemToSubaccount([unpaid, paid], 'it-u', 'sub-b', 'Carlos');
    assert.equal(moved[0].subaccountId, 'sub-b');
    assert.equal(moved[0].subaccountName, 'Carlos');
    assert.throws(() => moveOrderItemToSubaccount(moved, 'it-p', 'sub-b', 'Carlos'));
    assert.throws(() =>
      splitOrderItemEqually(moved, 'it-p', [
        { id: 'sub-a', displayName: 'Ana' },
        { id: 'sub-b', displayName: 'Carlos' },
      ])
    );
  });

  // 5. Shared item equal split (odd COP rounding) & custom COP validation
  await test('5. División de ítems compartidos en partes iguales con resto mayor COP y montos personalizados exactos', () => {
    const shares = allocateIntegerShares(10000, 3);
    assert.deepEqual(shares, [3334, 3333, 3333]);
    assert.equal(shares.reduce((a, b) => a + b, 0), 10000);

    const weighted = allocateWeightedShares(10001, [1, 2, 1]);
    assert.equal(weighted.reduce((a, b) => a + b, 0), 10001);

    const nachos = makeOrderItem({ id: 'it-nachos', name: 'Nachos', unitPrice: 25000, quantity: 1 });
    const splitEq = splitOrderItemEqually([nachos], 'it-nachos', [
      { id: 'sub-1', displayName: 'Ana' },
      { id: 'sub-2', displayName: 'Juan' },
      { id: 'sub-3', displayName: 'Sofía' },
    ]);
    assert.equal(splitEq[0].isShared, true);
    assert.equal(splitEq[0].allocations?.reduce((s, a) => s + a.shareAmount, 0), 25000);

    assert.throws(() =>
      splitOrderItemCustomAmounts([nachos], 'it-nachos', [
        { subaccountId: 'sub-1', subaccountName: 'Ana', shareAmount: 12000 },
        { subaccountId: 'sub-2', subaccountName: 'Juan', shareAmount: 12000 },
      ])
    );
    const customOk = splitOrderItemCustomAmounts([nachos], 'it-nachos', [
      { subaccountId: 'sub-1', subaccountName: 'Ana', shareAmount: 15000 },
      { subaccountId: 'sub-2', subaccountName: 'Juan', shareAmount: 10000 },
    ]);
    assert.equal(customOk[0].allocations?.reduce((s, a) => s + a.shareAmount, 0), 25000);
  });

  // 6. Merging and unmerging subaccounts preserves item provenance
  await test('6. Unir y separar subcuentas preserva trazabilidad original de ítems y expande cobro', () => {
    const s1 = createTableSubaccount({ id: 's1', tableId: 'm1', tableSessionId: 'sess1', desiredName: 'Laura' });
    const s2 = createTableSubaccount({ id: 's2', tableId: 'm1', tableSessionId: 'sess1', desiredName: 'Mateo' });
    const merged = mergeSubaccountsGroup([s1, s2], ['s2'], 's1', 'Pareja Mesa 1');
    assert.equal(merged[1].mergedIntoSubaccountId, 's1');

    const order = makeOrder({
      tableSessionId: 'sess1',
      subaccounts: merged,
      items: [
        makeOrderItem({ id: 'i1', unitPrice: 30000, subaccountId: 's1', subaccountName: 'Laura' }),
        makeOrderItem({ id: 'i2', unitPrice: 20000, subaccountId: 's2', subaccountName: 'Mateo' }),
      ],
    });
    const planMerged = buildSubaccountCheckoutPlan({ order, targetSubaccountIds: ['s1'] });
    assert.equal(planMerged.total, 50000);
    assert.equal(planMerged.shouldReleaseTable, true);

    const unmerged = unmergeSubaccountsGroup(merged, 's1');
    assert.equal(unmerged[0].mergedIntoSubaccountId, undefined);
    assert.equal(unmerged[1].mergedIntoSubaccountId, undefined);
    // Original item ownership remains intact
    assert.equal(order.items[0].subaccountId, 's1');
    assert.equal(order.items[1].subaccountId, 's2');
  });

  // 7. Partial table checkout leaves table open until remainingPendingBalance === 0
  await test('7. Cobro parcial mantiene mesa abierta mientras exista saldo pendiente y libera al saldar todo', () => {
    const s1 = createTableSubaccount({ id: 's1', tableId: 'm2', tableSessionId: 'sess2', desiredName: 'Camila' });
    const s2 = createTableSubaccount({ id: 's2', tableId: 'm2', tableSessionId: 'sess2', desiredName: 'David' });
    const nachos = makeOrderItem({ id: 'i-sh', name: 'Entrada Compartida', unitPrice: 25000, quantity: 1 });
    const sharedItems = splitOrderItemEqually([nachos], 'i-sh', [
      { id: 's1', displayName: 'Camila' },
      { id: 's2', displayName: 'David' },
    ]);
    const order = makeOrder({
      tableId: 'm2',
      tableSessionId: 'sess2',
      subaccounts: [s1, s2],
      items: [
        makeOrderItem({ id: 'i-c', name: 'Pasta', unitPrice: 35000, subaccountId: 's1', subaccountName: 'Camila' }),
        makeOrderItem({ id: 'i-d', name: 'Salmón', unitPrice: 45000, subaccountId: 's2', subaccountName: 'David' }),
        ...sharedItems,
      ],
    });

    const partialPlan = buildSubaccountCheckoutPlan({
      order,
      targetSubaccountIds: ['s1'],
      paymentMethod: 'tarjeta',
    });
    assert.equal(partialPlan.total, 47500);
    assert.equal(partialPlan.remainingPendingBalance, 57500);
    assert.equal(partialPlan.shouldReleaseTable, false);
    assert.equal(partialPlan.isPartialTableCheckout, true);
    assert.equal(partialPlan.updatedSubaccounts.find((s) => s.id === 's1')?.status, 'pagada');
    assert.equal(partialPlan.updatedSubaccounts.find((s) => s.id === 's2')?.status, 'activa');

    // Second turn pays remaining David account
    const orderAfterFirst: Order = {
      ...order,
      items: partialPlan.updatedOrderItems,
      subaccounts: partialPlan.updatedSubaccounts,
    };
    const finalPlan = buildSubaccountCheckoutPlan({
      order: orderAfterFirst,
      targetSubaccountIds: ['s2'],
      paymentMethod: 'efectivo',
    });
    assert.equal(finalPlan.total, 57500);
    assert.equal(finalPlan.remainingPendingBalance, 0);
    assert.equal(finalPlan.shouldReleaseTable, true);
    assert.equal(finalPlan.isPartialTableCheckout, false);
  });

  // 8. Mixed payment breakdown validation & idempotency IDs
  await test('8. Pago mixto valida suma exacta con total y genera paymentOperationId único', () => {
    const order = makeOrder({
      items: [makeOrderItem({ id: 'i-m', unitPrice: 50000, quantity: 1 })],
    });
    assert.throws(() =>
      buildSubaccountCheckoutPlan({
        order,
        paymentBreakdown: [
          { method: 'efectivo', amount: 20000 },
          { method: 'tarjeta', amount: 29000 },
        ],
      })
    );
    const okPlan = buildSubaccountCheckoutPlan({
      order,
      tipAmount: 5000,
      paymentBreakdown: [
        { method: 'efectivo', amount: 25000, cashTendered: 30000 },
        { method: 'tarjeta', amount: 30000 },
      ],
    });
    assert.equal(okPlan.total, 55000);
    assert.equal(okPlan.primaryPaymentMethod, 'tarjeta');
    assert.equal(okPlan.cashTendered, 30000);
    assert.equal(okPlan.change, 5000);
    const op1 = generatePaymentOperationId();
    const op2 = generatePaymentOperationId();
    assert.notEqual(op1, op2);
    assert.match(op1, /^pay-[a-zA-Z0-9-]+$/);
  });

  // 9. Single inventory deduction + exact recipe precision (no double deduction on partial checkouts)
  await test('9. Inventario y recetas se descuentan una sola vez sin deriva decimal en cobros múltiples', () => {
    const prod: Product = {
      id: 'prod-hamb',
      name: 'Hamburguesa',
      category: 'Platos',
      price: 25000,
      cost: 8000,
      stock: 10,
      minStock: 2,
      imageUrl: '',
      sku: 'HAMB-01',
      tipoInventario: 'receta',
      receta: [{ insumoId: 'ins-carne', nombre: 'Carne Molida', cantidad: 150, unidad: 'gramos' }],
    };
    const carne: PerishableItem = {
      id: 'ins-carne',
      name: 'Carne Molida',
      category: 'Carnes',
      quantity: 4,
      unit: 'kg',
      minStock: 1,
      entryDate: '2026-11-01',
      expiryDate: '2026-11-30',
      location: 'Nevera 1',
      alarmDaysBeforeExpiry: 3,
    };
    const item = makeOrderItem({ id: 'it-1', productId: 'prod-hamb', unitPrice: 25000, quantity: 1 });
    const shared = splitOrderItemEqually([item], 'it-1', [
      { id: 's1', displayName: 'A' },
      { id: 's2', displayName: 'B' },
    ]);
    const order = makeOrder({ items: shared });

    const turn1 = buildSubaccountCheckoutPlan({ order, targetSubaccountIds: ['s1'] });
    assert.equal(turn1.itemsRequiringInventoryDeduction.length, 1);

    const invAfterTurn1 = computeSaleInventoryUpdates({
      orderItems: turn1.itemsRequiringInventoryDeduction,
      productsCatalog: [prod],
      perishablesList: [carne],
    });
    assert.equal(invAfterTurn1.updatedPerishables[0].quantity, 3.85);

    const turn2 = buildSubaccountCheckoutPlan({
      order: { ...order, items: turn1.updatedOrderItems, subaccounts: turn1.updatedSubaccounts },
      targetSubaccountIds: ['s2'],
    });
    // Second subaccount paying remaining share of already-deducted item must NOT re-deduct inventory
    assert.equal(turn2.itemsRequiringInventoryDeduction.length, 0);
  });

  // 10. Law 1935/2018 voluntary tip has 0% VAT/INC and never alters taxable base
  await test('10. Propina voluntaria (Ley 1935/2018) excluida de IVA/INC sin alterar base gravable', () => {
    const order = makeOrder({
      items: [makeOrderItem({ id: 'it-inc', unitPrice: 108000, quantity: 1, taxType: 'impoconsumo', taxRate: 8 })],
    });
    const noTip = buildSubaccountCheckoutPlan({ order, tipAmount: 0 });
    const withTip = buildSubaccountCheckoutPlan({ order, tipAmount: 15000 });
    assert.equal(withTip.subtotal, noTip.subtotal);
    assert.equal(withTip.impoconsumoAmount, noTip.impoconsumoAmount);
    assert.equal(withTip.ivaAmount, noTip.ivaAmount);
    assert.equal(withTip.taxAmount, noTip.taxAmount);
    assert.equal(withTip.tipAmount, 15000);
    assert.equal(withTip.total, noTip.total + 15000);
  });

  // 11. Independent Electronic Invoice vs Consumidor Final totals sum cleanly without duplicates
  await test('11. Subcuentas con Factura Electrónica vs Consumidor Final suman el total exacto sin duplicar ventas', () => {
    const s1 = createTableSubaccount({ id: 's1', tableId: 'm5', tableSessionId: 'sess5', desiredName: 'Empresa ABC' });
    const s2 = createTableSubaccount({ id: 's2', tableId: 'm5', tableSessionId: 'sess5', desiredName: 'Pedro' });
    const order = makeOrder({
      tableId: 'm5',
      tableSessionId: 'sess5',
      subaccounts: [s1, s2],
      items: [
        makeOrderItem({ id: 'i1', name: 'Almuerzo Ejecutivo', unitPrice: 32400, quantity: 1, subaccountId: 's1', subaccountName: 'Empresa ABC' }),
        makeOrderItem({ id: 'i2', name: 'Salmón Parrilla', unitPrice: 54000, quantity: 1, subaccountId: 's2', subaccountName: 'Pedro' }),
      ],
    });
    const planFE = buildSubaccountCheckoutPlan({ order, targetSubaccountIds: ['s1'], paymentMethod: 'bizum' });
    const planCF = buildSubaccountCheckoutPlan({
      order: { ...order, items: planFE.updatedOrderItems, subaccounts: planFE.updatedSubaccounts },
      targetSubaccountIds: ['s2'],
      paymentMethod: 'efectivo',
    });
    assert.equal(planFE.total + planCF.total, 86400);
    assert.equal(planFE.taxAmount + planCF.taxAmount, Math.round(32400 - 32400 / 1.08) + Math.round(54000 - 54000 / 1.08));
  });

  // 12. PII isolation verification across customer portal & CheckoutModal
  await test('12. Aislamiento estricto de PII fiscal entre comensales en QR y Caja', () => {
    const portalSource = fs.readFileSync(path.resolve('src/components/customer/CustomerMenuPortal.tsx'), 'utf8');
    const storageSource = fs.readFileSync(path.resolve('src/services/firestoreUserStorage.ts'), 'utf8');
    // CustomerMenuPortal no debe hidratar datos fiscales desde la mesa compartida ni guardar en tabla compartida
    assert.equal(portalSource.includes('legacyBillingInfo: undefined'), true);
    assert.equal(portalSource.includes('savePrivateQrBillingRecord('), true);
    assert.equal(storageSource.includes("facturacion_privada_qr"), true);
    assert.equal(storageSource.includes('getPrivateQrBillingForSession'), true);
  });

  // 13. Accounting normalization & Siigo / Loggro / Excel / CSV exports + Alegra safeguard
  await test('13. Exportadores contables (General Excel/CSV, Siigo, Loggro) concilian subcuentas, fraccionados y pago mixto; Alegra bloqueado', async () => {
    const shared = splitOrderItemEqually(
      [makeOrderItem({ id: 'it-s', name: 'Parrillada x3', unitPrice: 99999, quantity: 1, taxType: 'impoconsumo', taxRate: 8 })],
      'it-s',
      [
        { id: 's1', displayName: 'Ana' },
        { id: 's2', displayName: 'Juan' },
      ]
    );
    const order = makeOrder({
      items: shared,
      subaccounts: [
        createTableSubaccount({ id: 's1', tableId: 'm8', tableSessionId: 'sess8', desiredName: 'Ana' }),
        createTableSubaccount({ id: 's2', tableId: 'm8', tableSessionId: 'sess8', desiredName: 'Juan' }),
      ],
    });
    const plan = buildSubaccountCheckoutPlan({
      order,
      targetSubaccountIds: ['s1'],
      tipAmount: 4000,
      paymentBreakdown: [
        { method: 'efectivo', amount: 24000, cashTendered: 24000, change: 0 },
        { method: 'tarjeta', amount: 30000 },
      ],
    });

    const receipt: SaleReceipt = {
      id: 'tick-sub-001',
      orderId: order.id,
      tableName: 'Mesa 8',
      tableSessionId: order.tableSessionId,
      subaccountIds: plan.affectedSubaccountIds,
      subaccountNames: plan.affectedSubaccountNames,
      isPartialTableCheckout: plan.isPartialTableCheckout,
      paymentId: 'pay-test-001',
      items: plan.receiptItems,
      subtotal: plan.subtotal,
      discountAmount: plan.discountAmount,
      discountPercent: plan.discountPercent,
      taxAmount: plan.taxAmount,
      taxPercent: 8,
      ivaAmount: plan.ivaAmount,
      impoconsumoAmount: plan.impoconsumoAmount,
      tipAmount: plan.tipAmount,
      total: plan.total,
      paymentMethod: plan.primaryPaymentMethod,
      paymentBreakdown: plan.normalizedBreakdown,
      timestamp: '2026-11-13T15:30:00.000Z',
      cashierName: 'Cajero POS',
      customerName: 'Ana María Pérez',
      customerDocumentType: 'CC',
      customerDocumentNumber: '1017123456',
      customerEmail: 'ana@correo.co',
      requiresElectronicInvoice: true,
    };

    const normalized = normalizeSalesForExport([receipt], new Map());
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].isIncompatible, false, normalized[0].incompatibilityReason);
    assert.equal(normalized[0].total, 54000);
    assert.equal(normalized[0].tipAmount, 4000);
    assert.deepEqual(normalized[0].subaccountNames, ['Ana']);
    assert.equal(normalized[0].paymentBreakdown?.length, 2);

    const excelRes = await generalExcelExportAdapter.generate(normalized, sampleRestaurantProfile);
    assert.ok(excelRes.data instanceof Uint8Array && excelRes.data.length > 0);
    const wb = XLSX.read(excelRes.data, { type: 'array' });
    const salesSheetCsv = XLSX.utils.sheet_to_csv(wb.Sheets['Ventas']);
    assert.ok(salesSheetCsv.includes('MIXTO'));

    const csvRes = await generalCsvExportAdapter.generate(normalized, sampleRestaurantProfile);
    assert.ok(typeof csvRes.data === 'string' && csvRes.data.includes('Ana'));
    assert.ok(csvRes.data.includes('MIXTO'));

    const siigoRes = await siigoExcelExportAdapter.generate(normalized, sampleRestaurantProfile);
    assert.ok(siigoRes.data instanceof Uint8Array && siigoRes.data.length > 0);

    const loggroRes = await loggroExcelExportAdapter.generate(normalized, sampleRestaurantProfile);
    assert.ok(loggroRes.data instanceof Uint8Array && loggroRes.data.length > 0);

    await assert.rejects(() => alegraExportAdapter.generate(normalized, sampleRestaurantProfile));
  });

  // 14. Firestore security rules verification
  await test('14. Reglas Firestore endurecidas sin permisos abiertos y colecciones nuevas protegidas', () => {
    const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
    assert.equal(rules.includes('allow read, write: if true'), false);
    assert.equal(rules.includes('allow read, write, create, update: if true'), false);
    assert.ok(rules.includes('match /{document=**} {\n      allow read, write: if false;'));
    assert.ok(rules.includes('match /facturacion_privada_qr/{recordId}'));
    assert.ok(rules.includes('match /pagos_mesa/{paymentId}'));
    assert.ok(rules.includes('match /ventas/{saleId}'));
    assert.ok(rules.includes('isOrderNotClosed'));
  });

  for (const line of results) {
    console.log(line);
  }
  console.log(`\nTOTAL PRUEBAS SUPERADAS: ${results.length}/${results.length}`);
}

runTests().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
