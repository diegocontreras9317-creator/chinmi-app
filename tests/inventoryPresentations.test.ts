import assert from 'node:assert/strict';

import {
  buildSupplierWhatsappMessage,
  getEffectiveBaseUnit,
  isAmbiguousLegacyUnit,
  needsLegacyMigrationNotice
} from '../src/utils/perishableUtils';
import {
  addQuantities,
  subtractQuantities
} from '../src/utils/quantityPrecision';
import {
  addLotToPerishable,
  calculateRecipeAvailability,
  computeSaleInventoryUpdates,
  convertPresentationQtyToBaseScaled,
  convertRecipeQtyToPantry,
  deductFromLotsFEFO,
  normalizePerishableRecord,
  resolveSinglePendingReconciliation,
  resolveUnitConversion
} from '../src/utils/recipeUnits';
import {
  calculateRecipeCostBreakdown,
  calculateWeightedMovingAverageCost,
  computeSecondaryDisplay,
  convertPerishableBaseUnit,
  getLiveProductCost,
  roundCOPAmount,
  roundUnitCost
} from '../src/utils/inventoryCosting';
import {
  processDelayedValuationForOrderEvent,
  processSupplierOrderReception,
  resolveTargetPantryForOrderLine
} from '../src/utils/supplierReception';
import type {
  InsumoPresentation,
  PerishableItem,
  Product,
  SupplierOrder
} from '../src/types';

function makePantryItem(overrides: Partial<PerishableItem> = {}): PerishableItem {
  return {
    id: overrides.id || 'ins-1',
    name: overrides.name || 'Insumo Test',
    category: overrides.category || 'Otros Insumos',
    quantity: overrides.quantity ?? 0,
    unit: overrides.unit || 'unidades',
    baseUnit: overrides.baseUnit,
    minStock: overrides.minStock ?? 2,
    entryDate: overrides.entryDate || '2026-11-10',
    expiryDate: overrides.expiryDate || '2026-11-30',
    location: overrides.location || 'Despensa Seca & Frutas',
    alarmDaysBeforeExpiry: overrides.alarmDaysBeforeExpiry ?? 3,
    ...overrides
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id || 'prod-1',
    name: overrides.name || 'Producto Test',
    category: overrides.category || 'Platos',
    price: overrides.price ?? 25000,
    cost: overrides.cost ?? 0,
    stock: overrides.stock ?? 0,
    minStock: overrides.minStock ?? 1,
    imageUrl: overrides.imageUrl || '',
    sku: overrides.sku || 'SKU-1',
    tipoInventario: overrides.tipoInventario || 'receta',
    receta: overrides.receta || [],
    ...overrides
  };
}

function makeOrder(overrides: Partial<SupplierOrder> = {}): SupplierOrder {
  return {
    id: overrides.id || 'ord-1',
    supplierId: overrides.supplierId || 'sup-1',
    supplierName: overrides.supplierName || 'Proveedor Demo',
    channel: overrides.channel || 'manual',
    items: overrides.items || [],
    orderedAt: overrides.orderedAt || '2026-11-14T10:00:00.000Z',
    status: overrides.status || 'pendiente',
    arrived: overrides.arrived ?? false,
    arrivedComplete: overrides.arrivedComplete ?? false,
    ...overrides
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

// 1. Ejemplo A — Pan de hamburguesa: compra 4 paquetes x 6 = 24 uds, venta 5 = 19 uds
test('01. Compra 4 paquetes x 6 panes -> 24 uds; venta 5 hamburguesas -> quedan 19 uds', () => {
  const presA: InsumoPresentation = {
    id: 'pres-pan-6',
    name: 'Paquete x 6',
    packagingType: 'paquete',
    contentQty: 6,
    contentUnit: 'unidades',
    supplierId: 'sup-a',
    supplierName: 'Proveedor A'
  };
  const pan = makePantryItem({
    id: 'ins-pan',
    name: 'Pan de hamburguesa',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 0,
    presentations: [presA]
  });
  const order = makeOrder({
    id: 'ord-pan-1',
    items: [
      {
        id: 'line-pan',
        insumoId: 'ins-pan',
        name: 'Pan de hamburguesa',
        quantity: 4,
        unit: 'paquete',
        presentationId: presA.id,
        presentationName: presA.name,
        packagingType: 'paquete',
        contentQty: 6,
        contentUnit: 'unidades',
        unitPrice: 7200
      }
    ]
  });

  const rec = processSupplierOrderReception({
    order,
    perishablesList: [pan],
    receptionEventId: 'ev-pan-1',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      confirmedAt: '2026-11-14T11:00:00.000Z',
      items: order.items.map((it) => ({ ...it, receivedNowQty: 4 }))
    }
  });

  assert.equal(rec.modifiedPerishables[0].quantity, 24);
  assert.equal(rec.modifiedPerishables[0].costPerUnit, 1200);

  const burger = makeProduct({
    id: 'prod-burger',
    name: 'Hamburguesa Clásica',
    receta: [{ insumoId: 'ins-pan', nombre: 'Pan de hamburguesa', cantidad: 1, unidad: 'und' }]
  });

  const saleRes = computeSaleInventoryUpdates({
    orderItems: [{ id: 'o-1', productId: 'prod-burger', quantity: 5 }],
    productsCatalog: [burger],
    perishablesList: rec.allPerishables,
    saleId: 'sale-1'
  });

  const updatedPan = saleRes.updatedPerishables.find((p) => p.id === 'ins-pan')!;
  assert.equal(updatedPan.quantity, 19);
  assert.equal(saleRes.orderItemInventoryStatuses['o-1'], 'deducted');
});

// 2. Ejemplo B — Queso tajado: 1 bloque 2.5 kg (= 100 tajadas x 25 g); receta 2 tajadas; venta 1 -> quedan 2.45 kg (= 98 tajadas)
test('02. Bloque queso 2.5 kg + equivalencia 1 tajada=25 g; venta 2 tajadas -> quedan 2.45 kg = 98 tajadas', () => {
  const queso = makePantryItem({
    id: 'ins-queso',
    name: 'Queso cheddar tajado',
    unit: 'kg',
    baseUnit: 'kg',
    quantity: 0,
    equivalences: [{ id: 'eq-taj', unit: 'tajada', quantityInBaseUnit: 25, baseUnitLabel: 'g' }],
    presentations: [
      { id: 'pres-blq', name: 'Bloque 2.5 kg', packagingType: 'bloque', contentQty: 2.5, contentUnit: 'kg' }
    ]
  });

  const order = makeOrder({
    items: [
      {
        id: 'line-queso',
        insumoId: 'ins-queso',
        name: 'Queso cheddar tajado',
        quantity: 1,
        unit: 'bloque',
        presentationId: 'pres-blq',
        packagingType: 'bloque',
        contentQty: 2.5,
        contentUnit: 'kg',
        unitPrice: 50000
      }
    ]
  });

  const rec = processSupplierOrderReception({
    order,
    perishablesList: [queso],
    receptionEventId: 'ev-queso-1',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: order.items.map((it) => ({ ...it, receivedNowQty: 1 }))
    }
  });

  assert.equal(rec.modifiedPerishables[0].quantity, 2.5);
  assert.equal(rec.modifiedPerishables[0].costPerUnit, 20000); // 50000 / 2.5 kg

  const burger = makeProduct({
    id: 'prod-cheese',
    name: 'Cheeseburger',
    receta: [{ insumoId: 'ins-queso', nombre: 'Queso cheddar tajado', cantidad: 2, unidad: 'tajada' }]
  });

  const saleRes = computeSaleInventoryUpdates({
    orderItems: [{ id: 'o-q1', productId: 'prod-cheese', quantity: 1 }],
    productsCatalog: [burger],
    perishablesList: rec.allPerishables,
    saleId: 'sale-q1'
  });

  const quesoAfter = saleRes.updatedPerishables[0];
  assert.equal(quesoAfter.quantity, 2.45);
  const sec = computeSecondaryDisplay(quesoAfter);
  assert.ok(sec);
  assert.equal(sec.quantity, 98);
  assert.equal(sec.exact, true);
});

// 3. Mismo insumo con múltiples presentaciones de proveedores A (paq x 6) y B (paq x 10)
test('03. Coexistencia Proveedor A (paq x 6) y Proveedor B (paq x 10) sobre el mismo insumo sin duplicar', () => {
  const presA: InsumoPresentation = {
    id: 'pres-a6',
    name: 'Paquete A x6',
    packagingType: 'paquete',
    contentQty: 6,
    contentUnit: 'unidades',
    supplierId: 'sup-a',
    supplierName: 'Proveedor A'
  };
  const presB: InsumoPresentation = {
    id: 'pres-b10',
    name: 'Paquete B x10',
    packagingType: 'paquete',
    contentQty: 10,
    contentUnit: 'unidades',
    supplierId: 'sup-b',
    supplierName: 'Proveedor B'
  };
  const pan = makePantryItem({
    id: 'ins-pan',
    name: 'Pan artesanal',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 0,
    presentations: [presA, presB]
  });

  const ordA = makeOrder({
    id: 'ord-a',
    supplierId: 'sup-a',
    items: [{ id: 'la', insumoId: 'ins-pan', name: 'Pan artesanal', quantity: 2, unit: 'paquete', presentationId: presA.id, unitPrice: 6000 }]
  });
  const r1 = processSupplierOrderReception({
    order: ordA,
    perishablesList: [pan],
    receptionEventId: 'ev-a',
    payload: { arrivedComplete: true, restockPantry: true, items: ordA.items.map((it) => ({ ...it, receivedNowQty: 2 })) }
  });
  assert.equal(r1.allPerishables.length, 1);
  assert.equal(r1.modifiedPerishables[0].quantity, 12);

  const ordB = makeOrder({
    id: 'ord-b',
    supplierId: 'sup-b',
    items: [{ id: 'lb', insumoId: 'ins-pan', name: 'Pan artesanal', quantity: 1, unit: 'paquete', presentationId: presB.id, unitPrice: 10000 }]
  });
  const r2 = processSupplierOrderReception({
    order: ordB,
    perishablesList: r1.allPerishables,
    receptionEventId: 'ev-b',
    payload: { arrivedComplete: true, restockPantry: true, items: ordB.items.map((it) => ({ ...it, receivedNowQty: 1 })) }
  });
  assert.equal(r2.allPerishables.length, 1);
  assert.equal(r2.modifiedPerishables[0].quantity, 22);
  assert.equal(r2.modifiedPerishables[0].costPerUnit, 1000);
});

// 4. Recepción SIN precio -> suma stock, valuationStatus='pending_valuation', NO promedia $0
test('04. Recepción sin precio suma existencias, conserva costo provisional y no promedia con $0', () => {
  const carne = makePantryItem({
    id: 'ins-carne',
    name: 'Carne molida',
    unit: 'kg',
    baseUnit: 'kg',
    quantity: 10,
    costPerUnit: 22000,
    costStatus: 'exact'
  });

  const order = makeOrder({
    id: 'ord-noprice',
    items: [{ id: 'l-1', insumoId: 'ins-carne', name: 'Carne molida', quantity: 5, unit: 'kg' }]
  });

  const rec = processSupplierOrderReception({
    order,
    perishablesList: [carne],
    receptionEventId: 'ev-noprice',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: [{ ...order.items[0], receivedNowQty: 5, skipPrice: true }]
    }
  });

  const updated = rec.modifiedPerishables[0];
  assert.equal(updated.quantity, 15);
  assert.equal(updated.costPerUnit, 22000); // No se diluyó con $0
  assert.equal(updated.costStatus, 'provisional');
  assert.equal(updated.pendingValuationCount, 1);
  assert.equal(rec.updatedOrder.hasPendingValuation, true);
  assert.equal(rec.receptionEvent?.items[0].valuationStatus, 'pending_valuation');
});

// 5. Valoración tardía: actualiza costo promedio, pasa a valued/exact, NO re-agrega stock
test('05. Valoración tardía actualiza costo promedio ponderado sin re-agregar stock', () => {
  const carne = makePantryItem({
    id: 'ins-carne',
    name: 'Carne molida',
    unit: 'kg',
    baseUnit: 'kg',
    quantity: 10,
    costPerUnit: 20000,
    costStatus: 'exact'
  });

  const order = makeOrder({
    id: 'ord-delayed',
    items: [{ id: 'l-1', insumoId: 'ins-carne', name: 'Carne molida', quantity: 10, unit: 'kg' }]
  });

  const rec = processSupplierOrderReception({
    order,
    perishablesList: [carne],
    receptionEventId: 'ev-del-1',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: [{ ...order.items[0], receivedNowQty: 10 }]
    }
  });
  assert.equal(rec.modifiedPerishables[0].quantity, 20);
  assert.equal(rec.modifiedPerishables[0].costPerUnit, 20000);

  // Llegan ventas y luego llega la factura con totalPrice = 260000 (26000/kg)
  const val = processDelayedValuationForOrderEvent({
    order: rec.updatedOrder,
    perishablesList: rec.allPerishables,
    receptionEventId: 'ev-del-1',
    orderItemId: 'l-1',
    totalPrice: 260000
  });

  assert.equal(val.idempotentDuplicate, false);
  assert.equal(val.updatedPerishable?.quantity, 20); // No re-agregó stock
  assert.equal(val.updatedPerishable?.costPerUnit, 23000); // (10*20000 + 10*26000)/20
  assert.equal(val.updatedPerishable?.costStatus, 'exact');
  assert.equal(val.updatedPerishable?.pendingValuationCount, 0);
  assert.equal(val.updatedOrder.hasPendingValuation, false);
});

// 6. Idempotencia de valoración tardía
test('06. Idempotencia de valoración tardía impide doble ajuste de costo', () => {
  const ins = makePantryItem({
    id: 'ins-1',
    name: 'Aceite',
    unit: 'litros',
    baseUnit: 'litros',
    quantity: 5,
    costPerUnit: 12000,
    costStatus: 'exact'
  });
  const ord = makeOrder({
    items: [{ id: 'i-1', insumoId: 'ins-1', name: 'Aceite', quantity: 5, unit: 'litros' }]
  });
  const rec = processSupplierOrderReception({
    order: ord,
    perishablesList: [ins],
    receptionEventId: 'ev-1',
    payload: { arrivedComplete: true, restockPantry: true, items: [{ ...ord.items[0], receivedNowQty: 5 }] }
  });

  const firstVal = processDelayedValuationForOrderEvent({
    order: rec.updatedOrder,
    perishablesList: rec.allPerishables,
    receptionEventId: 'ev-1',
    orderItemId: 'i-1',
    totalPrice: 80000
  });
  assert.equal(firstVal.idempotentDuplicate, false);

  const secondVal = processDelayedValuationForOrderEvent({
    order: firstVal.updatedOrder,
    perishablesList: firstVal.updatedPerishable ? [firstVal.updatedPerishable] : rec.allPerishables,
    receptionEventId: 'ev-1',
    orderItemId: 'i-1',
    totalPrice: 80000
  });
  assert.equal(secondVal.idempotentDuplicate, true);
  assert.equal(secondVal.updatedPerishable, undefined);
});

// 7. Costo Promedio Ponderado Móvil exacto
test('07. Costo Promedio Ponderado Móvil: (Q1*C1 + Total2) / (Q1 + Q2)', () => {
  const res = calculateWeightedMovingAverageCost({
    prevQty: 4,
    prevCostPerUnit: 15000,
    prevCostStatus: 'exact',
    receivedBaseQty: 6,
    totalPurchaseCost: 120000 // 20000/u
  });
  // (4*15000 + 120000) / 10 = 180000 / 10 = 18000
  assert.equal(res.nextQty, 10);
  assert.equal(res.nextCostPerUnit, 18000);
  assert.equal(res.costStatus, 'exact');
  assert.equal(res.batchUnitCostInBase, 20000);
});

// 8. Actualización live del costo de receta cuando cambia costPerUnit en despensa
test('08. Costo live de receta refleja inmediatamente cambios de costPerUnit en Despensa', () => {
  const pan = makePantryItem({ id: 'ins-pan', name: 'Pan', unit: 'unidades', quantity: 20, costPerUnit: 1000, costStatus: 'exact' });
  const carne = makePantryItem({ id: 'ins-carne', name: 'Carne', unit: 'kg', quantity: 10, costPerUnit: 20000, costStatus: 'exact' });
  const burger = makeProduct({
    id: 'prod-b',
    name: 'Burger',
    cost: 4000, // stale stored cost
    receta: [
      { insumoId: 'ins-pan', nombre: 'Pan', cantidad: 1, unidad: 'und' },
      { insumoId: 'ins-carne', nombre: 'Carne', cantidad: 150, unidad: 'gramos' }
    ]
  });

  const live1 = getLiveProductCost(burger, [pan, carne]);
  assert.equal(live1.cost, 4000); // 1000 + 0.15*20000 = 4000

  // Sube el costo promedio ponderado de la carne a 24000/kg -> 0.15*24000 = 3600 -> total 4600
  const carneUpdated = { ...carne, costPerUnit: 24000 };
  const live2 = getLiveProductCost(burger, [pan, carneUpdated]);
  assert.equal(live2.cost, 4600);
  assert.equal(live2.hasIncompatibleUnits, false);
});

// 9. Precisión decimal sin deriva IEEE 754
test('09. Precisión decimal sin deriva binaria IEEE 754 en sumas, restas y conversiones g<->kg', () => {
  assert.equal(addQuantities(0.1, 0.2), 0.3);
  assert.equal(addQuantities(0.15, 0.1), 0.25);
  assert.equal(subtractQuantities(4, 0.15), 3.85);
  assert.equal(subtractQuantities(3.85, 0.15), 3.7);
  assert.equal(subtractQuantities(4, 0.075), 3.925);

  const inKg = convertRecipeQtyToPantry(150, 'gramos', 'kg', 3); // 450 g = 0.45 kg
  assert.equal(inKg, 0.45);
});

// 10. Unidad de receta incompatible sin equivalencia -> NO 1:1 silencioso, NO bloquea venta, crea PendingConsumptionReconciliation
test('10. Unidad incompatible no hace 1:1 silencioso ni bloquea venta; crea conciliación pendiente', () => {
  const queso = makePantryItem({
    id: 'ins-queso',
    name: 'Queso tajado',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 10
  });
  const sand = makeProduct({
    id: 'prod-s',
    name: 'Sandwich',
    receta: [{ insumoId: 'ins-queso', nombre: 'Queso tajado', cantidad: 2, unidad: 'gramos' }]
  });

  const sale = computeSaleInventoryUpdates({
    orderItems: [{ id: 'item-1', productId: 'prod-s', quantity: 1 }],
    productsCatalog: [sand],
    perishablesList: [queso],
    saleId: 'sale-inc-1'
  });

  const quesoAfter = sale.updatedPerishables[0];
  assert.equal(quesoAfter.quantity, 10); // No descontó 2 unidades erróneas
  assert.equal(sale.pendingReconciliations.length, 1);
  assert.equal(sale.pendingReconciliations[0].status, 'pending');
  assert.equal(sale.orderItemInventoryStatuses['item-1'], 'pending_reconciliation');
  assert.equal(quesoAfter.pendingReconciliations?.length, 1);
});

// 11. Conciliación idempotente tras agregar equivalencia
test('11. Conciliación pendiente descuenta correctamente tras agregar equivalencia y es idempotente', () => {
  const quesoConPending = makePantryItem({
    id: 'ins-queso',
    name: 'Queso',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 20,
    equivalences: [{ id: 'eq-1', unit: 'g', quantityInBaseUnit: 0.04, baseUnitLabel: 'unidades' }], // 25g = 1 und
    pendingReconciliations: [
      {
        id: 'rec-1',
        saleId: 'sale-1',
        productId: 'prod-s',
        productName: 'Sandwich',
        soldQty: 2,
        recipeQty: 50,
        recipeUnit: 'gramos',
        insumoId: 'ins-queso',
        insumoName: 'Queso',
        createdAt: '2026-11-14T10:00:00.000Z',
        status: 'pending'
      }
    ]
  });

  // 2 * 50g * 0.04 = 4 unidades a descontar -> quedan 16
  const r1 = resolveSinglePendingReconciliation({
    item: quesoConPending,
    reconciliationId: 'rec-1',
    nowIso: '2026-11-14T12:00:00.000Z'
  });
  assert.equal(r1.resolved, true);
  assert.equal(r1.deductedBaseQty, 4);
  assert.equal(r1.updatedItem.quantity, 16);
  assert.equal(r1.updatedItem.pendingReconciliations?.[0].status, 'resolved');

  // Re-ejecutar es idempotente
  const r2 = resolveSinglePendingReconciliation({
    item: r1.updatedItem,
    reconciliationId: 'rec-1',
    nowIso: '2026-11-14T12:05:00.000Z'
  });
  assert.equal(r2.resolved, true);
  assert.equal(r2.updatedItem.quantity, 16);
});

// 12. Entregas parciales progresivas
test('12. Entregas parciales progresivas acumulan cantidades y transicionan a recibido_completo', () => {
  const harina = makePantryItem({ id: 'ins-h', name: 'Harina', unit: 'kg', baseUnit: 'kg', quantity: 0 });
  const order = makeOrder({
    id: 'ord-prog',
    items: [{ id: 'lh', insumoId: 'ins-h', name: 'Harina', quantity: 10, unit: 'kg', unitPrice: 4000 }]
  });

  const p1 = processSupplierOrderReception({
    order,
    perishablesList: [harina],
    receptionEventId: 'ev-p1',
    payload: {
      arrivedComplete: false,
      restockPantry: true,
      items: [{ ...order.items[0], receivedNowQty: 4 }]
    }
  });
  assert.equal(p1.updatedOrder.status, 'recibido_incompleto');
  assert.equal(p1.updatedOrder.items[0].cumulativeReceivedQty, 4);
  assert.equal(p1.modifiedPerishables[0].quantity, 4);

  const p2 = processSupplierOrderReception({
    order: p1.updatedOrder,
    perishablesList: p1.allPerishables,
    receptionEventId: 'ev-p2',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: [{ ...p1.updatedOrder.items[0], receivedNowQty: 6 }]
    }
  });
  assert.equal(p2.updatedOrder.status, 'recibido_completo');
  assert.equal(p2.updatedOrder.items[0].cumulativeReceivedQty, 10);
  assert.equal(p2.updatedOrder.receptionEvents?.length, 2);
  assert.equal(p2.modifiedPerishables[0].quantity, 10);
});

// 13. Idempotencia por receptionEventId
test('13. Reintento con el mismo receptionEventId no duplica existencias ni eventos', () => {
  const arroz = makePantryItem({ id: 'ins-a', name: 'Arroz', unit: 'kg', quantity: 5 });
  const order = makeOrder({
    items: [{ id: 'la', insumoId: 'ins-a', name: 'Arroz', quantity: 10, unit: 'kg', unitPrice: 3500 }]
  });

  const first = processSupplierOrderReception({
    order,
    perishablesList: [arroz],
    receptionEventId: 'ev-idem-1',
    payload: { arrivedComplete: true, restockPantry: true, items: [{ ...order.items[0], receivedNowQty: 10 }] }
  });
  assert.equal(first.idempotentDuplicate, false);
  assert.equal(first.modifiedPerishables[0].quantity, 15);

  const retry = processSupplierOrderReception({
    order: first.updatedOrder,
    perishablesList: first.allPerishables,
    receptionEventId: 'ev-idem-1',
    payload: { arrivedComplete: true, restockPantry: true, items: [{ ...order.items[0], receivedNowQty: 10 }] }
  });
  assert.equal(retry.idempotentDuplicate, true);
  assert.equal(retry.modifiedPerishables.length, 0);
  assert.equal(retry.allPerishables[0].quantity, 15);
});

// 14. Desambiguación ante insumos duplicados por nombre sin insumoId
test('14. Desambiguación protege contra actualización ambigua cuando hay nombres duplicados en Despensa', () => {
  const tomat1 = makePantryItem({ id: 'ins-t1', name: 'Tomate', location: 'Cocina', quantity: 5 });
  const tomat2 = makePantryItem({ id: 'ins-t2', name: 'Tomate', location: 'Barra', quantity: 3 });

  const resolution = resolveTargetPantryForOrderLine({ name: 'Tomate' }, [tomat1, tomat2]);
  assert.equal(resolution.status, 'ambiguous');
  assert.equal(resolution.candidates?.length, 2);

  const ord = makeOrder({
    items: [{ id: 'lt', name: 'Tomate', quantity: 4, unit: 'unidades' }]
  });
  assert.throws(() =>
    processSupplierOrderReception({
      order: ord,
      perishablesList: [tomat1, tomat2],
      receptionEventId: 'ev-amb',
      payload: { arrivedComplete: true, restockPantry: true, items: [{ ...ord.items[0], receivedNowQty: 4 }] }
    })
  );

  // Con overrideInsumoId se resuelve determinísticamente solo el elegido
  const resolved = processSupplierOrderReception({
    order: ord,
    perishablesList: [tomat1, tomat2],
    receptionEventId: 'ev-amb-fixed',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: [{ ...ord.items[0], receivedNowQty: 4, overrideInsumoId: 'ins-t2' }]
    }
  });
  assert.equal(resolved.allPerishables.find((p) => p.id === 'ins-t1')?.quantity, 5);
  assert.equal(resolved.allPerishables.find((p) => p.id === 'ins-t2')?.quantity, 7);
});

// 15. Múltiples líneas del mismo insumo en el mismo pedido se acumulan secuencialmente sin pisarse
test('15. Dos líneas del mismo insumo en un pedido acumulan stock y promedio secuencialmente', () => {
  const leche = makePantryItem({ id: 'ins-l', name: 'Leche', unit: 'litros', baseUnit: 'litros', quantity: 0 });
  const order = makeOrder({
    items: [
      { id: 'l1', insumoId: 'ins-l', name: 'Leche', quantity: 2, unit: 'litros', unitPrice: 4000 }, // 8000
      { id: 'l2', insumoId: 'ins-l', name: 'Leche', quantity: 2, unit: 'litros', unitPrice: 5000 } // 10000
    ]
  });

  const res = processSupplierOrderReception({
    order,
    perishablesList: [leche],
    receptionEventId: 'ev-multi-line',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: order.items.map((it) => ({ ...it, receivedNowQty: 2 }))
    }
  });

  assert.equal(res.modifiedPerishables.length, 1);
  assert.equal(res.modifiedPerishables[0].quantity, 4);
  assert.equal(res.modifiedPerishables[0].costPerUnit, 4500);
  assert.equal(res.modifiedPerishables[0].lots?.length, 2);
});

// 16. Cambio / override de presentación al recibir
test('16. Override de presentación en recepción (pidió paq x 6, recibió paq x 10)', () => {
  const pan = makePantryItem({ id: 'ins-pan', name: 'Pan', unit: 'unidades', baseUnit: 'unidades', quantity: 0 });
  const order = makeOrder({
    items: [
      {
        id: 'lp',
        insumoId: 'ins-pan',
        name: 'Pan',
        quantity: 2,
        unit: 'paquete',
        packagingType: 'paquete',
        contentQty: 6,
        contentUnit: 'unidades',
        unitPrice: 10000
      }
    ]
  });

  const rec = processSupplierOrderReception({
    order,
    perishablesList: [pan],
    receptionEventId: 'ev-ovr',
    payload: {
      arrivedComplete: true,
      restockPantry: true,
      items: [
        {
          ...order.items[0],
          receivedNowQty: 2,
          overrideContentQty: 10,
          overrideContentUnit: 'unidades'
        }
      ]
    }
  });

  assert.equal(rec.modifiedPerishables[0].quantity, 20);
  assert.equal(rec.modifiedPerishables[0].costPerUnit, 1000); // 20000 / 20 uds
});

// 17. Consumo FEFO multi-lote manteniendo invariante sum(lots) === quantity
test('17. Consumo FEFO multi-lote consume primero vencimiento próximo y mantiene suma de lotes exacta', () => {
  let item = makePantryItem({
    id: 'ins-yogurt',
    name: 'Yogurt',
    unit: 'litros',
    quantity: 0,
    expiryDate: '2026-11-25'
  });

  const l1 = addLotToPerishable(item, {
    id: 'lot-later',
    batchNumber: 'B2',
    quantity: 5,
    entryDate: '2026-11-12',
    expiryDate: '2026-11-30'
  });
  item = { ...item, quantity: l1.totalQuantity, lots: l1.updatedLots, expiryDate: l1.nextExpiryDate };

  const l2 = addLotToPerishable(item, {
    id: 'lot-sooner',
    batchNumber: 'B1',
    quantity: 3,
    entryDate: '2026-11-14',
    expiryDate: '2026-11-18'
  });
  item = { ...item, quantity: l2.totalQuantity, lots: l2.updatedLots, expiryDate: l2.nextExpiryDate };

  assert.equal(item.quantity, 8);
  assert.equal(item.expiryDate, '2026-11-18'); // El próximo a vencer primero

  // Descontar 4 litros -> consume todo B1 (3) y 1 de B2 (quedan 4 en B2)
  const fefo = deductFromLotsFEFO(item, 4);
  assert.equal(fefo.remainingQuantity, 4);
  assert.equal(fefo.updatedLots?.length, 1);
  assert.equal(fefo.updatedLots?.[0].batchNumber, 'B2');
  assert.equal(fefo.updatedLots?.[0].quantity, 4);
  assert.equal(fefo.nextExpiryDate, '2026-11-30');
});

// 18. Formato WhatsApp incluye empaque/presentación y NUNCA inventa precios ni costos internos
test('18. Mensaje WhatsApp detalla empaques y no expone precios ni costos internos', () => {
  const msg = buildSupplierWhatsappMessage({
    supplierName: 'Panadería Central',
    localName: 'Chinmi Burger',
    localAddress: 'Cra 15 # 80-20',
    items: [
      {
        name: 'Pan Brioche',
        quantity: 4,
        unit: 'paquete',
        presentationName: 'Paquete Institucional',
        packagingType: 'paquete',
        contentQty: 6,
        contentUnit: 'unidades'
      },
      {
        name: 'Tomate Chonto',
        quantity: 5,
        unit: 'kg'
      }
    ],
    notes: 'Entregar antes de 10am'
  });

  assert.ok(msg.includes('4 paquetes de Pan Brioche [Paquete Institucional (6 unidades)]'));
  assert.ok(msg.includes('5 kg - Tomate Chonto'));
  assert.ok(!msg.includes('$'));
  assert.ok(!msg.toLowerCase().includes('costo'));
  assert.ok(!msg.toLowerCase().includes('precio'));
});

// 19. Compatibilidad 100% con ítems legacy sin campos nuevos
test('19. Normalización 100% retrocompatible para registros legacy sin baseUnit/lots/presentations/costStatus', () => {
  const legacy: PerishableItem = {
    id: 'leg-1',
    name: 'Limón',
    category: 'Frutas & Cítricos',
    quantity: 12,
    unit: 'kg',
    minStock: 3,
    entryDate: '2026-11-01',
    expiryDate: '2026-11-20',
    location: 'Despensa Seca & Frutas',
    alarmDaysBeforeExpiry: 3
  };

  assert.equal(getEffectiveBaseUnit(legacy), 'kg');
  const norm = normalizePerishableRecord(legacy);
  assert.equal(norm.baseUnit, 'kg');
  assert.equal(norm.quantity, 12);
  assert.equal(needsLegacyMigrationNotice(norm), false);
});

// 20. Detección y migración asistida de unidad legacy ambigua ("paquetes") preservando valor total
test('20. Detección de unidad legacy ambigua y migración asistida conservando valor total del inventario', () => {
  const legacyPack = makePantryItem({
    id: 'leg-pack',
    name: 'Salchicha',
    unit: 'paquetes',
    quantity: 5,
    minStock: 2,
    costPerUnit: 12000 // Total = 60,000
  });

  assert.equal(isAmbiguousLegacyUnit('paquetes'), true);
  assert.equal(needsLegacyMigrationNotice(legacyPack), true);

  const migrated = convertPerishableBaseUnit({
    item: legacyPack,
    newBaseUnit: 'unidades',
    unitsPerOldUnit: 6
  });

  assert.equal(migrated.baseUnit, 'unidades');
  assert.equal(migrated.unit, 'unidades');
  assert.equal(migrated.quantity, 30);
  assert.equal(migrated.minStock, 12);
  assert.equal(migrated.costPerUnit, 2000);
  assert.equal(migrated.quantity * (migrated.costPerUnit || 0), 60000);
});

// 21. Visualización secundaria dual exacta (=) vs aproximada (≈) con presentaciones mixtas
test('21. Visualización secundaria dual muestra "=" cuando es única y "≈" con múltiples presentaciones', () => {
  const singlePres = makePantryItem({
    id: 'p1',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 24,
    presentations: [
      { id: 'pr-6', name: 'Paquete x 6', packagingType: 'paquete', contentQty: 6, contentUnit: 'unidades' }
    ]
  });
  const d1 = computeSecondaryDisplay(singlePres);
  assert.ok(d1);
  assert.equal(d1.exact, true);
  assert.ok(d1.text.startsWith('= 4 paquetes'));

  const mixedPres = makePantryItem({
    id: 'p2',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 24,
    secondaryPresentationId: 'pr-6',
    presentations: [
      { id: 'pr-6', name: 'Paquete x 6', packagingType: 'paquete', contentQty: 6, contentUnit: 'unidades' },
      { id: 'pr-10', name: 'Paquete x 10', packagingType: 'paquete', contentQty: 10, contentUnit: 'unidades' }
    ]
  });
  const d2 = computeSecondaryDisplay(mixedPres);
  assert.ok(d2);
  assert.equal(d2.isApproximate, true);
  assert.ok(d2.text.startsWith('≈ 4 paquetes'));
});

// 22. Receta mixta (un ingrediente compatible y otro incompatible) -> status 'partial'
test('22. Receta con mezcla compatible/incompatible descuenta el válido, crea conciliación del otro y marca partial', () => {
  const pan = makePantryItem({ id: 'ins-pan', name: 'Pan', unit: 'unidades', quantity: 10 });
  const salsa = makePantryItem({ id: 'ins-sal', name: 'Salsa', unit: 'litros', quantity: 2 });
  const prod = makeProduct({
    id: 'prod-mix',
    name: 'Perro Especial',
    receta: [
      { insumoId: 'ins-pan', nombre: 'Pan', cantidad: 1, unidad: 'und' },
      { insumoId: 'ins-sal', nombre: 'Salsa', cantidad: 1, unidad: 'sobre' } // sin equivalencia a litros
    ]
  });

  const sale = computeSaleInventoryUpdates({
    orderItems: [{ id: 'om-1', productId: 'prod-mix', quantity: 2 }],
    productsCatalog: [prod],
    perishablesList: [pan, salsa],
    saleId: 'sale-mix'
  });

  assert.equal(sale.orderItemInventoryStatuses['om-1'], 'partial');
  assert.equal(sale.updatedPerishables.find((p) => p.id === 'ins-pan')?.quantity, 8);
  assert.equal(sale.updatedPerishables.find((p) => p.id === 'ins-sal')?.quantity, 2);
  assert.equal(sale.pendingReconciliations.length, 1);
  assert.equal(sale.pendingReconciliations[0].insumoId, 'ins-sal');
});

// 23. Equivalencia en dos pasos e inversa en resolveUnitConversion
test('23. resolveUnitConversion soporta conversión inversa y puente de dos pasos entre equivalencias', () => {
  const queso = makePantryItem({
    id: 'ins-q',
    unit: 'kg',
    baseUnit: 'kg',
    equivalences: [
      { id: 'e1', unit: 'bloque', quantityInBaseUnit: 2.5, baseUnitLabel: 'kg' },
      { id: 'e2', unit: 'tajada', quantityInBaseUnit: 25, baseUnitLabel: 'g' }
    ]
  });

  // tajada -> bloque: 25g / 2500g = 0.01 bloques por tajada
  const twoStep = resolveUnitConversion({ fromUnit: 'tajada', toUnit: 'bloque', pantryItem: queso });
  assert.equal(twoStep.compatible, true);
  assert.equal(twoStep.source, 'custom_equivalence');
  assert.equal(twoStep.factor, 0.01);

  // reverse: kg -> tajada (1 kg = 40 tajadas)
  const reverse = resolveUnitConversion({ fromUnit: 'kg', toUnit: 'tajada', pantryItem: queso });
  assert.equal(reverse.compatible, true);
  assert.equal(reverse.factor, 40);
});

// 24. Recepción con restockPantry: false no altera stock ni costos en Despensa
test('24. Recepción documental (restockPantry: false) actualiza pedido sin modificar Despensa', () => {
  const sal = makePantryItem({ id: 'ins-sal', name: 'Sal', unit: 'kg', quantity: 3, costPerUnit: 2000 });
  const ord = makeOrder({
    items: [{ id: 'ls', insumoId: 'ins-sal', name: 'Sal', quantity: 5, unit: 'kg', unitPrice: 2500 }]
  });

  const rec = processSupplierOrderReception({
    order: ord,
    perishablesList: [sal],
    receptionEventId: 'ev-doc',
    payload: {
      arrivedComplete: true,
      restockPantry: false,
      items: [{ ...ord.items[0], receivedNowQty: 5 }]
    }
  });

  assert.equal(rec.updatedOrder.status, 'recibido_completo');
  assert.equal(rec.modifiedPerishables.length, 0);
  assert.equal(rec.allPerishables[0].quantity, 3);
  assert.equal(rec.allPerishables[0].costPerUnit, 2000);
});

// 25. Bordes numéricos: ceros, negativos y sobreconsumo FEFO clamped a 0
test('25. Protecciones de borde en conversiones, costo ponderado con prevQty=0 y clamp FEFO a 0', () => {
  const zeroConv = convertPresentationQtyToBaseScaled({
    presentationQty: -2,
    contentQty: 6,
    contentUnit: 'unidades',
    baseUnit: 'unidades'
  });
  assert.equal(zeroConv.baseQty, 0);

  const avgFromZeroQty = calculateWeightedMovingAverageCost({
    prevQty: 0,
    prevCostPerUnit: 500, // costo residual anterior con stock en 0
    receivedBaseQty: 10,
    totalPurchaseCost: 8000
  });
  assert.equal(avgFromZeroQty.nextCostPerUnit, 800);
  assert.equal(avgFromZeroQty.costStatus, 'exact');

  const item = makePantryItem({
    id: 'ins-fe',
    quantity: 5,
    lots: [{ id: 'l1', quantity: 5, entryDate: '2026-11-01', expiryDate: '2026-11-20' }]
  });
  const over = deductFromLotsFEFO(item, 12);
  assert.equal(over.remainingQuantity, 0);
  assert.equal(over.updatedLots?.length, 0);
});

// 26. Disponibilidad exacta de receta (porciones enteras y factor limitante)
test('26. calculateRecipeAvailability determina porciones enteras e ingrediente limitante', () => {
  const pan = makePantryItem({ id: 'p', name: 'Pan', unit: 'unidades', quantity: 12 });
  const queso = makePantryItem({
    id: 'q',
    name: 'Queso',
    unit: 'kg',
    quantity: 0.5, // 500g = 20 tajadas de 25g -> receta usa 2 tajadas => max 10 porciones
    equivalences: [{ id: 'eq-t', unit: 'tajada', quantityInBaseUnit: 25, baseUnitLabel: 'g' }]
  });
  const avail = calculateRecipeAvailability(
    [
      { insumoId: 'p', nombre: 'Pan', cantidad: 1, unidad: 'und' },
      { insumoId: 'q', nombre: 'Queso', cantidad: 2, unidad: 'tajada' }
    ],
    [pan, queso]
  );

  assert.equal(avail.hasIncompatibleUnits, false);
  assert.equal(avail.estimatedPortions, 10);
  assert.equal(avail.limitingInsumoName, 'Queso');
});

// 27. Múltiples productos en una venta compartiendo el mismo insumo en sus recetas
test('27. Venta con 2 productos compartiendo insumo suma descuentos sin sobrescribirse', () => {
  const queso = makePantryItem({ id: 'q', name: 'Queso', unit: 'kg', quantity: 1 });
  const p1 = makeProduct({
    id: 'prod-1',
    name: 'Burger',
    receta: [{ insumoId: 'q', nombre: 'Queso', cantidad: 50, unidad: 'gramos' }]
  });
  const p2 = makeProduct({
    id: 'prod-2',
    name: 'Doble Queso',
    receta: [{ insumoId: 'q', nombre: 'Queso', cantidad: 100, unidad: 'gramos' }]
  });

  const sale = computeSaleInventoryUpdates({
    orderItems: [
      { id: 'c1', productId: 'prod-1', quantity: 2 }, // 100g
      { id: 'c2', productId: 'prod-2', quantity: 3 } // 300g => total 400g = 0.4 kg
    ],
    productsCatalog: [p1, p2],
    perishablesList: [queso],
    saleId: 'sale-shared-insumo'
  });

  assert.equal(sale.updatedPerishables[0].quantity, 0.6);
});

// 28. Completitud de orden: si una línea aún no llega al total y arrivedComplete=false -> recibido_incompleto; si llega -> recibido_completo
test('28. Resolución de estado de orden según cantidades acumuladas y flag arrivedComplete', () => {
  const ins = makePantryItem({ id: 'i1', name: 'Pollo', unit: 'kg', quantity: 0 });
  const order = makeOrder({
    items: [
      { id: 'l1', insumoId: 'i1', name: 'Pollo', quantity: 10, unit: 'kg', unitPrice: 12000 },
      { id: 'l2', insumoId: 'i1', name: 'Pollo Ala', quantity: 5, unit: 'kg', unitPrice: 9000 }
    ]
  });

  const partial = processSupplierOrderReception({
    order,
    perishablesList: [ins],
    receptionEventId: 'ev-st-1',
    payload: {
      arrivedComplete: false,
      restockPantry: true,
      items: [
        { ...order.items[0], receivedNowQty: 10 },
        { ...order.items[1], receivedNowQty: 3 }
      ]
    }
  });
  assert.equal(partial.updatedOrder.status, 'recibido_incompleto');

  // Incluso si arrivedComplete=false en el último envío, al alcanzar el total de todas las líneas pasa a recibido_completo
  const autoComplete = processSupplierOrderReception({
    order: partial.updatedOrder,
    perishablesList: partial.allPerishables,
    receptionEventId: 'ev-st-2',
    payload: {
      arrivedComplete: false,
      restockPantry: true,
      items: [
        { ...partial.updatedOrder.items[0], receivedNowQty: 0 },
        { ...partial.updatedOrder.items[1], receivedNowQty: 2 }
      ]
    }
  });
  assert.equal(autoComplete.updatedOrder.status, 'recibido_completo');
});

// 29. Redondeo financiero COP vs costo unitario por unidad pequeña
test('29. Redondeo financiero mantiene 4 decimales en unitCost ($/g) y 2 decimales en totales COP', () => {
  assert.equal(roundUnitCost(12.34567), 12.3457);
  assert.equal(roundUnitCost(-5), 0);
  assert.equal(roundCOPAmount(1250.678), 1250.68);
});

// 30. Presentaciones inactivas (active: false) ignoradas en conversión y visualización secundaria
test('30. Presentaciones marcadas como active: false no interfieren en conversión ni display secundario', () => {
  const item = makePantryItem({
    id: 'ins-inact',
    name: 'Servilletas',
    unit: 'unidades',
    baseUnit: 'unidades',
    quantity: 200,
    presentations: [
      { id: 'p-old', name: 'Caja vieja', packagingType: 'caja', contentQty: 50, contentUnit: 'unidades', active: false },
      { id: 'p-new', name: 'Paquete nuevo', packagingType: 'paquete', contentQty: 100, contentUnit: 'unidades', active: true }
    ]
  });

  const sec = computeSecondaryDisplay(item);
  assert.ok(sec);
  assert.equal(sec.quantity, 2);
  assert.equal(sec.exact, true);

  const convOld = resolveUnitConversion({ fromUnit: 'caja', toUnit: 'unidades', pantryItem: item });
  assert.equal(convOld.compatible, false);
});

// 31. Ambigüedad de presentaciones con mismo packagingType y distinto contenido
test('31. resolveUnitConversion detecta ambigüedad cuando hay dos presentaciones activas de distinto tamaño', () => {
  const item = makePantryItem({
    id: 'ins-pan',
    name: 'Pan',
    unit: 'unidades',
    presentations: [
      { id: 'p1', name: 'Paq x6', packagingType: 'paquete', contentQty: 6, contentUnit: 'unidades', active: true },
      { id: 'p2', name: 'Paq x10', packagingType: 'paquete', contentQty: 10, contentUnit: 'unidades', active: true }
    ]
  });

  const conv = resolveUnitConversion({ fromUnit: 'paquete', toUnit: 'unidades', pantryItem: item });
  assert.equal(conv.compatible, false);
  assert.equal(conv.source, 'incompatible');
  assert.ok(conv.reason?.includes('múltiples presentaciones'));
});

// 32. Atomicidad lógica en recepción: si falla línea 2 no deja estado original corrompido
test('32. Error en línea 2 de recepción aborta operación sin mutar la orden ni los insumos de entrada', () => {
  const okItem = makePantryItem({ id: 'ok-1', name: 'Azúcar', unit: 'kg', quantity: 10 });
  const badItem = makePantryItem({ id: 'bad-1', name: 'Esencia', unit: 'litros', quantity: 2 });
  const snapshotOrder = makeOrder({
    items: [
      { id: 'l1', insumoId: 'ok-1', name: 'Azúcar', quantity: 5, unit: 'kg', unitPrice: 4000 },
      { id: 'l2', insumoId: 'bad-1', name: 'Esencia', quantity: 2, unit: 'frasco_raro' }
    ]
  });

  assert.throws(() =>
    processSupplierOrderReception({
      order: snapshotOrder,
      perishablesList: [okItem, badItem],
      receptionEventId: 'ev-fail',
      payload: {
        arrivedComplete: true,
        restockPantry: true,
        items: snapshotOrder.items.map((it) => ({ ...it, receivedNowQty: it.quantity }))
      }
    })
  );

  // Inputs inmutados
  assert.equal(okItem.quantity, 10);
  assert.equal(badItem.quantity, 2);
  assert.equal(snapshotOrder.status, 'pendiente');
  assert.equal(snapshotOrder.receptionEvents, undefined);
});

// Extra check for calculateRecipeCostBreakdown incompatibility warning
test('33. calculateRecipeCostBreakdown reporta hasIncompatibleUnits y hasProvisionalCost correctamente', () => {
  const provisional = makePantryItem({
    id: 'p-prov',
    name: 'Queso',
    unit: 'kg',
    quantity: 5,
    costPerUnit: 20000,
    costStatus: 'provisional'
  });
  const missingConv = makePantryItem({
    id: 'p-inc',
    name: 'Pan',
    unit: 'unidades',
    quantity: 10
  });

  const bd = calculateRecipeCostBreakdown(
    [
      { insumoId: 'p-prov', nombre: 'Queso', cantidad: 100, unidad: 'gramos' },
      { insumoId: 'p-inc', nombre: 'Pan', cantidad: 1, unidad: 'paquete_desconocido' }
    ],
    [provisional, missingConv]
  );

  assert.equal(bd.hasProvisionalCost, true);
  assert.equal(bd.hasIncompatibleUnits, true);
  assert.equal(bd.totalCost, 2000); // Solo suma el compatible (0.1 kg * 20000)
});

console.log(`\n✅ Todos los escenarios (${passed}/${passed}) pasaron correctamente.`);
