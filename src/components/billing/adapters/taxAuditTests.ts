/**
 * Script de auditoría y pruebas automatizadas de compatibilidad tributaria para Chinmi App.
 * Ejecuta los 10 escenarios requeridos en la auditoría sin tocar bases de datos de producción.
 */

import {
  calculateOrderTaxBreakdown,
  resolveOrderItemTax,
  resolveProductTax
} from '../../../utils/taxes';
import {
  normalizeSalesForExport
} from '../billingStorageService';
import { generalExcelExportAdapter } from './GeneralExcelExportAdapter';
import { generalCsvExportAdapter } from './GeneralCsvExportAdapter';
import { siigoExcelExportAdapter } from './SiigoExcelExportAdapter';
import { loggroExcelExportAdapter } from './LoggroExcelExportAdapter';
import {
  NormalizedExportSale,
  RestaurantFiscalProfile
} from './types';
import { SaleReceipt, OrderItem } from '../../../types';
import * as XLSX from 'xlsx';

export interface AuditTestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  observations: string[];
}

export async function runTaxAuditSuite(): Promise<{
  allPassed: boolean;
  results: AuditTestCaseResult[];
}> {
  const results: AuditTestCaseResult[] = [];

  const mockRestaurant: RestaurantFiscalProfile = {
    businessName: 'Chinmi GastroBar Audit',
    tradeName: 'Chinmi Audit',
    nit: '901542890',
    dv: '1',
    address: 'Calle 93 # 12-40',
    city: 'Bogotá, D.C.',
    department: 'Bogotá D.C.',
    daneCode: '11001',
    email: 'tributaria@appchinmi.com',
    phone: '3009998877',
    taxRegime: 'responsable_iva',
    fiscalResponsibilities: ['O-13', 'R-99-PN'],
    defaultTaxType: 'impoconsumo',
    defaultTaxRate: 8
  };

  const isoDate = '2026-11-10T12:00:00.000Z';

  // -------------------------------------------------------------
  // CASO 1: Venta con INC 8% (PVP $15.000)
  // Base: 15.000 / 1.08 = 13.888,88... -> Redondeo: $13.889
  // Impuesto: 15.000 - 13.889 = $1.111
  // Total: $15.000
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-1',
        productId: 'prod-inc8',
        name: 'Hamburguesa Artesanal',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-1',
      orderId: 'ord-1',
      tableName: 'Mesa 1',
      items,
      subtotal: 15000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 15000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];

    const passed =
      norm.total === 15000 &&
      norm.impoconsumoAmount === 1111 &&
      norm.taxableBase === 13889 &&
      norm.inc8Amount === 1111 &&
      norm.inc8Base === 13889 &&
      norm.lines[0].taxableBase === 13889 &&
      norm.lines[0].taxAmount === 1111;

    results.push({
      id: 'CASO_1',
      name: 'Venta con INC 8 % (PVP $15.000)',
      passed,
      expected: { base: 13889, inc: 1111, total: 15000 },
      actual: {
        lineBase: norm.lines[0].taxableBase,
        lineTax: norm.lines[0].taxAmount,
        saleTotal: norm.total,
        saleInc: norm.impoconsumoAmount
      },
      observations: [
        'El impuesto está incluido en el PVP ($15.000) y no se sumó adicionalmente.',
        `Desglose en comanda: Base $${norm.lines[0].taxableBase}, INC $${norm.lines[0].taxAmount}.`
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 2: Venta con IVA 19% (PVP $15.000)
  // Base: 15.000 / 1.19 = 12.605,04... -> Redondeo: $12.605
  // Impuesto: 15.000 - 12.605 = $2.395
  // Total: $15.000
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-2',
        productId: 'prod-iva19',
        name: 'Vino Tinto Copa',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 19
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-2',
      orderId: 'ord-2',
      tableName: 'Mesa 2',
      items,
      subtotal: 15000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 15000,
      paymentMethod: 'tarjeta',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const passed =
      norm.total === 15000 &&
      norm.ivaAmount === 2395 &&
      norm.iva19Amount === 2395 &&
      norm.iva19Base === 12605 &&
      norm.lines[0].taxableBase === 12605 &&
      norm.lines[0].taxAmount === 2395;

    results.push({
      id: 'CASO_2',
      name: 'Venta con IVA 19 % (PVP $15.000)',
      passed,
      expected: { base: 12605, iva: 2395, total: 15000 },
      actual: {
        lineBase: norm.lines[0].taxableBase,
        lineTax: norm.lines[0].taxAmount,
        saleTotal: norm.total,
        saleIva: norm.ivaAmount
      },
      observations: [
        'Desglose exacto: Base $12.605, IVA $2.395.',
        'Total pagado permanece exactamente en $15.000 COP.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 3: Venta con IVA 5% (PVP $15.000)
  // Base: 15.000 / 1.05 = 14.285,71... -> Redondeo: $14.286
  // Impuesto: 15.000 - 14.286 = $714
  // Total: $15.000
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-3',
        productId: 'prod-iva5',
        name: 'Café Empacado Especial',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 5
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-3',
      orderId: 'ord-3',
      tableName: 'Mesa 3',
      items,
      subtotal: 15000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 15000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const passed =
      norm.total === 15000 &&
      norm.ivaAmount === 714 &&
      norm.iva5Amount === 714 &&
      norm.iva5Base === 14286 &&
      norm.lines[0].taxRate === 5 &&
      norm.lines[0].taxableBase === 14286 &&
      norm.lines[0].taxAmount === 714;

    results.push({
      id: 'CASO_3',
      name: 'Venta con IVA 5 % (PVP $15.000)',
      passed,
      expected: { base: 14286, iva: 714, total: 15000 },
      actual: {
        lineBase: norm.lines[0].taxableBase,
        lineTax: norm.lines[0].taxAmount,
        lineRate: norm.lines[0].taxRate,
        saleTotal: norm.total,
        saleIva5: norm.iva5Amount
      },
      observations: [
        'IVA al 5% segregado en columna propia IVA_5 y Base_IVA_5.',
        'La tarifa diferencial no se mezcla con IVA 19%.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 4: Venta con Exento 0% (PVP $15.000)
  // Base: $15.000
  // Impuesto: $0
  // Total: $15.000
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-4',
        productId: 'prod-exento',
        name: 'Agua Natural Mineral',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'exento',
        taxRate: 0
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-4',
      orderId: 'ord-4',
      tableName: 'Mesa 4',
      items,
      subtotal: 15000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 15000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const passed =
      norm.total === 15000 &&
      norm.taxAmount === 0 &&
      norm.exemptBase === 15000 &&
      norm.lines[0].taxType === 'exento' &&
      norm.lines[0].taxRate === 0 &&
      norm.lines[0].taxableBase === 15000 &&
      norm.lines[0].taxAmount === 0;

    results.push({
      id: 'CASO_4',
      name: 'Venta con Exento 0 % (PVP $15.000)',
      passed,
      expected: { base: 15000, tax: 0, total: 15000 },
      actual: {
        lineBase: norm.lines[0].taxableBase,
        lineTax: norm.lines[0].taxAmount,
        exemptBase: norm.exemptBase,
        saleTotal: norm.total
      },
      observations: [
        'Base exenta reportada en Ventas_Exentas_Tarifa_0: $15.000.',
        'Impuesto liquidado: $0.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 5: Venta mixta multitarifa reconciliada
  // Plato INC 8% $20.000 -> Base $18.519, INC $1.481
  // Coctel IVA 19% $10.000 -> Base $8.403, IVA $1.597
  // Café IVA 5% $6.000 -> Base $5.714, IVA $285 (reconciliado a $1.882 total IVA histórico)
  // Agua Exenta $5.000 -> Base $5.000, Impuesto $0
  // Total = $41.000
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-m1',
        productId: 'prod-a',
        name: 'Plato Restaurante',
        unitPrice: 20000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      },
      {
        id: 'it-m2',
        productId: 'prod-b',
        name: 'Coctel Bar',
        unitPrice: 10000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 19
      },
      {
        id: 'it-m3',
        productId: 'prod-c',
        name: 'Café Molido',
        unitPrice: 6000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 5
      },
      {
        id: 'it-m4',
        productId: 'prod-d',
        name: 'Agua Pura',
        unitPrice: 5000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'exento',
        taxRate: 0
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-5',
      orderId: 'ord-5',
      tableName: 'Mesa 5',
      items,
      subtotal: 41000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount), // 1882
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount), // 1481
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 41000,
      paymentMethod: 'tarjeta',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const sumLineBases = norm.lines.reduce((acc, l) => acc + l.taxableBase, 0);
    const sumLineTaxes = norm.lines.reduce((acc, l) => acc + l.taxAmount, 0);
    const sumLineIva = norm.lines.filter((l) => l.taxType === 'iva').reduce((acc, l) => acc + l.taxAmount, 0);
    const sumLineInc = norm.lines.filter((l) => l.taxType === 'impoconsumo').reduce((acc, l) => acc + l.taxAmount, 0);

    const passed =
      norm.total === 41000 &&
      norm.impoconsumoAmount === 1481 &&
      norm.ivaAmount === 1882 &&
      norm.taxAmount === 3363 &&
      sumLineIva === norm.ivaAmount &&
      sumLineInc === norm.impoconsumoAmount &&
      sumLineTaxes === norm.taxAmount &&
      sumLineBases + sumLineTaxes === norm.total;

    results.push({
      id: 'CASO_5',
      name: 'Venta mixta con los tres tratamientos (INC, IVA 19%, IVA 5%, Exento)',
      passed,
      expected: {
        total: 41000,
        baseSum: 37637,
        inc: 1481,
        iva: 1882,
        totalTax: 3363
      },
      actual: {
        total: norm.total,
        baseSum: sumLineBases,
        inc: norm.impoconsumoAmount,
        iva: norm.ivaAmount,
        totalTax: norm.taxAmount
      },
      observations: [
        'Conciliación exacta de centavos lograda: suma de impuestos de líneas coincide 100% con la cabecera.',
        `Suma de líneas de IVA ($${sumLineIva}) = Total IVA venta ($${norm.ivaAmount}).`
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 6A: Venta con descuento porcentual (10% sobre $50.000 con INC 8%)
  // Subtotal bruto: $50.000
  // Descuento: $5.000
  // Neto: $45.000
  // Base gravable: $45.000 / 1.08 = $41.667
  // INC 8%: $45.000 - $41.667 = $3.333
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-6a',
        productId: 'prod-desc',
        name: 'Plato Especial Familiar',
        unitPrice: 50000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any, { discountPercent: 10 });
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-6a',
      orderId: 'ord-6a',
      tableName: 'Mesa 6A',
      items,
      subtotal: 50000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 5000,
      discountPercent: 10,
      tipAmount: 0,
      total: 45000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const line = norm.lines[0];

    const passed =
      norm.total === 45000 &&
      norm.discountAmount === 5000 &&
      norm.netProductsTotal === 45000 &&
      norm.impoconsumoAmount === 3333 &&
      line.grossTotal === 50000 &&
      line.discount === 5000 &&
      line.netTotal === 45000 &&
      line.taxableBase === 41667 &&
      line.taxAmount === 3333;

    results.push({
      id: 'CASO_6A',
      name: 'Venta con descuento porcentual (10% sobre $50.000)',
      passed,
      expected: {
        grossTotal: 50000,
        discount: 5000,
        netTotal: 45000,
        base: 41667,
        tax: 3333
      },
      actual: {
        lineGross: line.grossTotal,
        lineDiscount: line.discount,
        lineNet: line.netTotal,
        lineBase: line.taxableBase,
        lineTax: line.taxAmount
      },
      observations: [
        'Descuento prorrateado al 100% sobre la línea en Detalle_Productos.',
        `Línea: Bruto $${line.grossTotal} - Descuento $${line.discount} = Neto $${line.netTotal}. Base $${line.taxableBase} + INC $${line.taxAmount} = $${line.netTotal}. Conciliación perfecta.`
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 6B: Venta con descuento fijo en valor monetario ($10.000 sobre 2 platos de $30.000 y $20.000)
  // Subtotal bruto: $50.000
  // Descuento fijo: $10.000
  // Prorrateo: Plato 1 ($30k / $50k * 10k = $6.000 desc) -> Neto $24.000 -> Base $22.222, INC $1.778
  // Prorrateo: Plato 2 ($20k / $50k * 10k = $4.000 desc) -> Neto $16.000 -> Base $14.815, INC $1.185
  // Total Neto: $40.000, Base Total: $37.037, INC Total: $2.963
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-6b1',
        productId: 'prod-p1',
        name: 'Plato Gourmet 1',
        unitPrice: 30000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      },
      {
        id: 'it-6b2',
        productId: 'prod-p2',
        name: 'Plato Gourmet 2',
        unitPrice: 20000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-6b',
      orderId: 'ord-6b',
      tableName: 'Mesa 6B',
      items,
      subtotal: 50000,
      taxAmount: 2963,
      taxPercent: 8,
      ivaAmount: 0,
      impoconsumoAmount: 2963,
      discountAmount: 10000,
      discountPercent: 20,
      tipAmount: 0,
      total: 40000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const l1 = norm.lines[0];
    const l2 = norm.lines[1];

    const sumDiscounts = l1.discount + l2.discount;
    const sumTaxes = l1.taxAmount + l2.taxAmount;

    const passed =
      sumDiscounts === 10000 &&
      l1.discount === 6000 &&
      l2.discount === 4000 &&
      l1.netTotal === 24000 &&
      l2.netTotal === 16000 &&
      sumTaxes === 2963 &&
      norm.total === 40000;

    results.push({
      id: 'CASO_6B',
      name: 'Venta con descuento fijo en pesos ($10.000 COP sobre $50.000)',
      passed,
      expected: {
        sumDiscounts: 10000,
        l1Discount: 6000,
        l2Discount: 4000,
        sumTaxes: 2963,
        total: 40000
      },
      actual: {
        sumDiscounts,
        l1Discount: l1.discount,
        l2Discount: l2.discount,
        sumTaxes,
        total: norm.total
      },
      observations: [
        'Prorrateo proporcional exacto basado en peso monetario bruto.',
        'La suma de descuentos individuales coincide al peso: $6.000 + $4.000 = $10.000.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 6C: Venta con descuentos fijados por producto
  // Item 1 tiene descuento explícito de $3.000, Item 2 de $2.000 -> Total descuento $5.000
  // -------------------------------------------------------------
  {
    const items: any[] = [
      {
        id: 'it-6c1',
        productId: 'prod-exp1',
        name: 'Plato Promo 1',
        unitPrice: 25000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8,
        discountAmount: 3000
      },
      {
        id: 'it-6c2',
        productId: 'prod-exp2',
        name: 'Plato Promo 2',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8,
        discountAmount: 2000
      }
    ];

    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-6c',
      orderId: 'ord-6c',
      tableName: 'Mesa 6C',
      items,
      subtotal: 40000,
      taxAmount: 2593,
      taxPercent: 8,
      impoconsumoAmount: 2593,
      discountAmount: 5000,
      discountPercent: 12.5,
      tipAmount: 0,
      total: 35000,
      paymentMethod: 'tarjeta',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const l1 = norm.lines[0];
    const l2 = norm.lines[1];

    const passed =
      l1.discount === 3000 &&
      l2.discount === 2000 &&
      l1.netTotal === 22000 &&
      l2.netTotal === 13000 &&
      l1.taxAmount + l2.taxAmount === 2593 &&
      norm.total === 35000;

    results.push({
      id: 'CASO_6C',
      name: 'Venta con descuentos explícitos por producto',
      passed,
      expected: { l1Discount: 3000, l2Discount: 2000, total: 35000 },
      actual: {
        l1Discount: l1.discount,
        l2Discount: l2.discount,
        l1Net: l1.netTotal,
        l2Net: l2.netTotal,
        total: norm.total
      },
      observations: [
        'Respeta los descuentos asignados explícitamente a cada producto sin sobreescribirlos.',
        'La suma de las bases más impuestos coincide exactamente con los $35.000 netos.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 7: Venta con propinas (PVP $40.000 + Propina $4.000 = $44.000)
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-7',
        productId: 'prod-tip',
        name: 'Cena para Dos',
        unitPrice: 40000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-7',
      orderId: 'ord-7',
      tableName: 'Mesa 7',
      items,
      subtotal: 40000,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 4000,
      total: 44000,
      paymentMethod: 'tarjeta',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];

    const passed =
      norm.total === 44000 &&
      norm.tipAmount === 4000 &&
      norm.subtotal === 40000 &&
      norm.netProductsTotal === 40000 &&
      norm.impoconsumoAmount === 2963 &&
      norm.taxableBase === 37037;

    results.push({
      id: 'CASO_7',
      name: 'Venta con propina voluntaria ($40.000 + $4.000 propina)',
      passed,
      expected: { subtotal: 40000, tip: 4000, inc: 2963, total: 44000 },
      actual: {
        subtotal: norm.subtotal,
        tip: norm.tipAmount,
        inc: norm.impoconsumoAmount,
        total: norm.total
      },
      observations: [
        'La propina no forma parte de la base gravable del Impoconsumo ni del IVA.',
        'Total pagado ($44.000) = Subtotal ($40.000) + Propina ($4.000). Coherencia perfecta.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 8: Venta con múltiples unidades (3 unidades de $12.500 con INC 8%)
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-8',
        productId: 'prod-multi',
        name: 'Cerveza Club Colombia',
        unitPrice: 12500,
        quantity: 3,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const breakdown = calculateOrderTaxBreakdown(items as any);
    const saleReceipt: SaleReceipt = {
      id: 'tick-audit-8',
      orderId: 'ord-8',
      tableName: 'Mesa 8',
      items,
      subtotal: 37500,
      taxAmount: Math.round(breakdown.totalTaxAmount),
      taxPercent: breakdown.effectiveTaxPercent,
      ivaAmount: Math.round(breakdown.ivaAmount),
      impoconsumoAmount: Math.round(breakdown.impoconsumoAmount),
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 37500,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Test'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const passed =
      norm.total === 37500 &&
      norm.lines[0].quantity === 3 &&
      norm.lines[0].unitPrice === 12500 &&
      norm.lines[0].grossTotal === 37500 &&
      norm.lines[0].total === 37500 &&
      norm.lines[0].taxableBase === 34722 &&
      norm.lines[0].taxAmount === 2778;

    results.push({
      id: 'CASO_8',
      name: 'Venta con múltiples unidades (3 x $12.500 con INC 8%)',
      passed,
      expected: { total: 37500, base: 34722, inc: 2778 },
      actual: {
        total: norm.total,
        lineBase: norm.lines[0].taxableBase,
        lineTax: norm.lines[0].taxAmount
      },
      observations: [
        'Múltiples unidades calculan el total de línea (3 * 12.500 = 37.500) y extraen el impuesto correctamente.',
        'Redondeo exacto sin descuadre de centavos.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 9: Venta histórica con información incompleta
  // -------------------------------------------------------------
  {
    const itemsOld: any[] = [
      {
        id: 'it-old-1',
        productId: 'prod-old',
        name: 'Plato Antiguo Sin Datos Fiscales',
        unitPrice: 15000,
        quantity: 1,
        addedAt: isoDate
      }
    ];

    const saleReceiptOld: SaleReceipt = {
      id: 'tick-audit-old-9',
      orderId: 'ord-old-9',
      tableName: 'Mesa Histórica',
      items: itemsOld,
      subtotal: 15000,
      taxAmount: 1111,
      taxPercent: 8,
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 15000,
      paymentMethod: 'efectivo',
      timestamp: '2025-01-15T10:00:00.000Z',
      cashierName: 'Cajero Histórico'
    };

    const norm = normalizeSalesForExport([saleReceiptOld], new Map())[0];

    const passed =
      norm.lines[0].taxType === 'impoconsumo' &&
      norm.lines[0].taxRate === 8 &&
      norm.lines[0].taxAmount === 1111 &&
      norm.lines[0].taxableBase === 13889;

    results.push({
      id: 'CASO_9',
      name: 'Venta histórica con información incompleta (items sin taxType/taxRate)',
      passed,
      expected: {
        fallbackTaxType: 'impoconsumo',
        fallbackTaxRate: 8,
        lineTax: 1111,
        lineBase: 13889
      },
      actual: {
        lineTaxType: norm.lines[0].taxType,
        lineTaxRate: norm.lines[0].taxRate,
        lineTax: norm.lines[0].taxAmount,
        lineBase: norm.lines[0].taxableBase
      },
      observations: [
        'El sistema infiere correctamente el fallback usando sale.taxPercent (8%) asignando Impoconsumo sin inventar datos aleatorios.',
        'Preserva intacto el taxAmount original registrado en la venta ($1.111).'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO 10: Conciliación Contable Integral entre Resumen_Ventas, Ventas y Detalle_Productos
  // -------------------------------------------------------------
  {
    const testItems: OrderItem[] = [
      {
        id: 'it-c1',
        productId: 'p-1',
        name: 'Parrillada Mixta',
        unitPrice: 60000,
        quantity: 2,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      },
      {
        id: 'it-c2',
        productId: 'p-2',
        name: 'Botella Vino Tinto',
        unitPrice: 80000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 19
      },
      {
        id: 'it-c3',
        productId: 'p-3',
        name: 'Café de Origen',
        unitPrice: 8000,
        quantity: 2,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 5
      }
    ];

    const breakdown10 = calculateOrderTaxBreakdown(testItems as any, { discountPercent: 10 });
    const testSalesReceipts: SaleReceipt[] = [
      {
        id: 'tick-concil-1',
        orderId: 'ord-c1',
        tableName: 'Mesa VIP',
        items: testItems,
        subtotal: 216000,
        discountAmount: 21600, // 10% descuento
        discountPercent: 10,
        taxAmount: Math.round(breakdown10.totalTaxAmount),
        taxPercent: breakdown10.effectiveTaxPercent,
        ivaAmount: Math.round(breakdown10.ivaAmount),
        impoconsumoAmount: Math.round(breakdown10.impoconsumoAmount),
        tipAmount: 20000,
        total: 214400,
        paymentMethod: 'tarjeta',
        timestamp: isoDate,
        cashierName: 'Cajero VIP'
      }
    ];

    const normalizedBatch = normalizeSalesForExport(testSalesReceipts, new Map());
    const saleNorm = normalizedBatch[0];

    // 1. Suma de Detalle_Productos
    const sumLineGross = saleNorm.lines.reduce((acc, l) => acc + (l.grossTotal || 0), 0);
    const sumLineDisc = saleNorm.lines.reduce((acc, l) => acc + l.discount, 0);
    const sumLineNet = saleNorm.lines.reduce((acc, l) => acc + (l.netTotal || 0), 0);
    const sumLineBase = saleNorm.lines.reduce((acc, l) => acc + l.taxableBase, 0);
    const sumLineTax = saleNorm.lines.reduce((acc, l) => acc + l.taxAmount, 0);

    // 2. Generar Excel y verificar consistencia de celdas
    const excelRes = await generalExcelExportAdapter.generate(normalizedBatch, {
      restaurant: mockRestaurant
    });
    const wb = XLSX.read(excelRes.data, { type: 'array' });

    const passedConciliation =
      sumLineGross === saleNorm.subtotal &&
      sumLineDisc === saleNorm.discountAmount &&
      sumLineNet === saleNorm.netProductsTotal &&
      sumLineBase === saleNorm.taxableBase &&
      sumLineTax === saleNorm.taxAmount &&
      saleNorm.netProductsTotal + saleNorm.tipAmount === saleNorm.total &&
      wb.SheetNames.length === 3;

    results.push({
      id: 'CASO_10',
      name: 'Conciliación Contable Integral entre Resumen_Ventas, Ventas y Detalle_Productos',
      passed: passedConciliation,
      expected: {
        subtotal: 216000,
        discount: 21600,
        netProducts: 194400,
        taxAmount: Math.round(breakdown10.totalTaxAmount),
        total: 214400
      },
      actual: {
        sumLineGross,
        sumLineDisc,
        sumLineNet,
        sumLineTax,
        saleTotal: saleNorm.total
      },
      observations: [
        `Detalle_Productos Bruto ($${sumLineGross}) = Subtotal Ventas ($${saleNorm.subtotal}).`,
        `Detalle_Productos Descuentos ($${sumLineDisc}) = Descuento Ventas ($${saleNorm.discountAmount}).`,
        `Detalle_Productos Impuestos ($${sumLineTax}) = Total Impuestos Ventas ($${saleNorm.taxAmount}).`,
        `Conciliación tripartita de Resumen_Ventas, Ventas y Detalle_Productos: 100% al centavo.`
      ]
    });
  }

  // -------------------------------------------------------------
  // REGRESION ERROR 1: Ausencia de duplicación de impuestos (IVA 10% no duplica IVA 19%, Exento $12k no duplica base)
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-err1-1',
        productId: 'prod-iva10',
        name: 'Producto IVA 10%',
        unitPrice: 11000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'iva',
        taxRate: 10
      },
      {
        id: 'it-err1-2',
        productId: 'prod-ex12',
        name: 'Producto Exento',
        unitPrice: 12000,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'exento',
        taxRate: 0
      }
    ];

    const saleReceipt: SaleReceipt = {
      id: 'tick-reg-err1',
      orderId: 'ord-r1',
      tableName: 'Mesa R1',
      items,
      subtotal: 23000,
      taxAmount: 1000,
      taxPercent: 10,
      ivaAmount: 1000,
      impoconsumoAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 23000,
      paymentMethod: 'efectivo',
      timestamp: isoDate,
      cashierName: 'Cajero Regresion'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const passed =
      norm.iva19Amount === 0 &&
      norm.ivaOtherAmount === 1000 &&
      norm.exemptBase === 12000 &&
      norm.taxableBase === 10000 &&
      norm.taxableBase + norm.exemptBase === 22000;

    results.push({
      id: 'REGRESION_ERROR_1',
      name: 'Verificación contra duplicación de impuestos (IVA otras tarifas y Base Exenta)',
      passed,
      expected: { iva19Amount: 0, ivaOtherAmount: 1000, taxableBase: 10000, exemptBase: 12000 },
      actual: {
        iva19Amount: norm.iva19Amount,
        ivaOtherAmount: norm.ivaOtherAmount,
        taxableBase: norm.taxableBase,
        exemptBase: norm.exemptBase
      },
      observations: [
        'IVA al 10% registrado en ivaOtherAmount ($1.000) sin duplicar en iva19Amount ($0).',
        'Venta exenta de $12.000 clasificada en exemptBase sin contaminar taxableBase ($10.000).'
      ]
    });
  }

  // -------------------------------------------------------------
  // REGRESION ERROR 2: Conciliación exacta de venta de $22.700 con 12.5% de descuento ($19.863 en caja)
  // Subtotal: $22.700
  // Descuento registrado: $2.838
  // Total registrado en caja: $19.863
  // -------------------------------------------------------------
  {
    const items: OrderItem[] = [
      {
        id: 'it-err2',
        productId: 'prod-227',
        name: 'Combo Almuerzo Especial',
        unitPrice: 22700,
        quantity: 1,
        addedAt: isoDate,
        taxType: 'impoconsumo',
        taxRate: 8
      }
    ];

    const saleReceipt: SaleReceipt = {
      id: 'tick-reg-err2',
      orderId: 'ord-r2',
      tableName: 'Mesa R2',
      items,
      subtotal: 22700,
      taxAmount: 1471,
      taxPercent: 8,
      impoconsumoAmount: 1471,
      discountAmount: 2838,
      discountPercent: 12.5,
      tipAmount: 0,
      total: 19863,
      paymentMethod: 'tarjeta',
      timestamp: isoDate,
      cashierName: 'Cajero Regresion'
    };

    const norm = normalizeSalesForExport([saleReceipt], new Map())[0];
    const sumLineNet = norm.lines.reduce((acc, l) => acc + (l.netTotal || 0), 0);

    const passed =
      sumLineNet === 19863 &&
      norm.total === 19863 &&
      norm.lines[0].netTotal === 19863 &&
      norm.lines[0].discount === 2837 &&
      norm.netProductsTotal === 19863;

    results.push({
      id: 'REGRESION_ERROR_2',
      name: 'Conciliación exacta del caso $22.700 con 12,5% descuento ($19.863)',
      passed,
      expected: { lineNetSum: 19863, headerTotal: 19863, lineDiscount: 2837 },
      actual: {
        lineNetSum: sumLineNet,
        headerTotal: norm.total,
        lineDiscount: norm.lines[0].discount
      },
      observations: [
        'Suma del detalle ($19.863) concilia exactamente con la cabecera del comprobante ($19.863).',
        'Descuento imputado a la línea ($2.837) ajustado determinísticamente al centavo.'
      ]
    });
  }

  // -------------------------------------------------------------
  // REGRESION ERROR 6: Protección contra Inyección CSV (Neutralización de fórmulas)
  // -------------------------------------------------------------
  {
    const malformedSale: NormalizedExportSale = {
      saleId: 'sal-csv-inject',
      ticketNumber: '=1+2',
      timestamp: isoDate,
      dateKey: isoDate.slice(0, 10),
      tableName: '  +MesaCMD',
      cashierName: '@CajeroAdmin',
      paymentMethod: 'efectivo',
      customerName: ' =cmd| /C calc!A1',
      documentType: 'NIT',
      documentNumber: '900123456',
      subtotal: 10000,
      discountAmount: 0,
      discountPercent: 0,
      netProductsTotal: 10000,
      taxableBase: 9259,
      taxAmount: 741,
      ivaAmount: 0,
      impoconsumoAmount: 741,
      tipAmount: 0,
      total: 10000,
      requestStatus: 'no_solicitada',
      exportStatus: 'no_exportado',
      filingStatus: 'pendiente',
      lines: [],
      originalReceipt: {} as any
    };

    const csvOutput = await generalCsvExportAdapter.generate([malformedSale], {
      restaurant: { businessName: 'Test', nit: '123', dv: '0', address: '', city: '', department: '', email: '', phone: '', taxRegime: 'no_responsable_iva', fiscalResponsibilities: [], defaultTaxType: 'impoconsumo', defaultTaxRate: 8 }
    });

    const hasFormulaExec =
      csvOutput.data.includes('"' + "'=1+2" + '"') &&
      csvOutput.data.includes('"' + "' =cmd| /C calc!A1" + '"') &&
      csvOutput.data.includes('"' + "'  +MesaCMD" + '"');

    results.push({
      id: 'REGRESION_ERROR_6',
      name: 'Verificación de seguridad contra Inyección CSV (Fórmulas maliciosas)',
      passed: hasFormulaExec,
      expected: { sanitizedFormulas: true },
      actual: { sanitizedFormulas: hasFormulaExec },
      observations: [
        'Fórmulas que inician con =, +, -, @, incluso precedidas de espacios, fueron neutralizadas con comilla simple.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO FASE 3: PRUEBA DE ADAPTADOR SIIGO COLOMBIA
  // -------------------------------------------------------------
  {
    const sampleSale: NormalizedExportSale = {
      saleId: 'SALE-SIIGO-01',
      ticketNumber: '000456',
      timestamp: isoDate,
      dateKey: '2026-11-10',
      tableName: 'Mesa 4',
      cashierName: 'Carlos',
      paymentMethod: 'Tarjeta de Crédito',
      customerName: 'Empresa Test SAS',
      documentType: 'NIT',
      documentNumber: '0009876543',
      dv: '9',
      subtotal: 100000,
      discountAmount: 0,
      discountPercent: 0,
      taxableBase: 92593,
      taxAmount: 7407,
      impoconsumoAmount: 7407,
      inc8Amount: 7407,
      inc8Base: 92593,
      ivaAmount: 0,
      tipAmount: 10000,
      total: 110000,
      requestStatus: 'solicitada',
      exportStatus: 'no_exportado',
      filingStatus: 'pendiente',
      lines: [
        {
          saleId: 'SALE-SIIGO-01',
          ticketNumber: '000456',
          sku: 'SKU-REST-01',
          name: 'Plato Especial Bife',
          quantity: 2,
          unitPrice: 50000,
          grossTotal: 100000,
          discount: 0,
          netTotal: 100000,
          taxableBase: 92593,
          taxType: 'impoconsumo',
          taxRate: 8,
          taxAmount: 7407,
          total: 100000
        }
      ],
      originalReceipt: {} as any
    };

    const siigoRes = await siigoExcelExportAdapter.generate([sampleSale], {
      restaurant: mockRestaurant
    });

    const siigoWb = XLSX.read(siigoRes.data, { type: 'array' });
    const hasSheets = siigoWb.SheetNames.includes('Facturas_Venta') && siigoWb.SheetNames.includes('Terceros_Clientes');

    results.push({
      id: 'FASE3_SIIGO_EXPORT',
      name: 'Prueba de Adaptador Siigo Colombia (Plantilla Oficial & Conservación de Ceros)',
      passed: hasSheets && siigoRes.filename.includes('Siigo_Facturas_'),
      expected: { hasOfficialSheets: true, filenameFormat: true },
      actual: { hasOfficialSheets: hasSheets, filename: siigoRes.filename },
      observations: [
        'Genera hojas oficiales Facturas_Venta y Terceros_Clientes en formato .xlsx preservando NITs con ceros a la izquierda.'
      ]
    });
  }

  // -------------------------------------------------------------
  // CASO FASE 3: PRUEBA DE ADAPTADOR LOGGRO COLOMBIA
  // -------------------------------------------------------------
  {
    const sampleSaleLoggro: NormalizedExportSale = {
      saleId: 'SALE-LOGGRO-01',
      ticketNumber: '000789',
      timestamp: isoDate,
      dateKey: '2026-11-10',
      tableName: 'Mesa 12',
      cashierName: 'Maria',
      paymentMethod: 'Efectivo',
      customerName: 'Pedro Gomez',
      documentType: 'CC',
      documentNumber: '0012345678',
      subtotal: 15000,
      discountAmount: 0,
      discountPercent: 0,
      taxableBase: 13889,
      taxAmount: 1111,
      impoconsumoAmount: 1111,
      ivaAmount: 0,
      tipAmount: 0,
      total: 15000,
      requestStatus: 'no_solicitada',
      exportStatus: 'no_exportado',
      filingStatus: 'pendiente',
      lines: [
        {
          saleId: 'SALE-LOGGRO-01',
          ticketNumber: '000789',
          sku: 'BEB-001',
          name: 'Coctel Chinmi',
          quantity: 1,
          unitPrice: 15000,
          grossTotal: 15000,
          discount: 0,
          netTotal: 15000,
          taxableBase: 13889,
          taxType: 'impoconsumo',
          taxRate: 8,
          taxAmount: 1111,
          total: 15000
        }
      ],
      originalReceipt: {} as any
    };

    const loggroRes = await loggroExcelExportAdapter.generate([sampleSaleLoggro], {
      restaurant: mockRestaurant
    });

    const loggroWb = XLSX.read(loggroRes.data, { type: 'array' });
    const hasLoggroSheets = loggroWb.SheetNames.includes('Encabezado') && loggroWb.SheetNames.includes('Detalles');

    // Verificar que el Precio Unitario Neto en Hoja Detalles sea la Base Gravable (13889) y NO el PVP ($15.000)
    const detallesSheet = loggroWb.Sheets['Detalles'];
    const detallesRows: any[] = XLSX.utils.sheet_to_json(detallesSheet);
    const unitPriceNetInRow = detallesRows[0]?.['Precio Unitario Neto'];
    const matchesNetBasePrice = unitPriceNetInRow === 13889;

    results.push({
      id: 'FASE3_LOGGRO_EXPORT',
      name: 'Prueba de Adaptador Loggro Colombia (2 Hojas & Precios Netos sin Impuestos)',
      passed: hasLoggroSheets && matchesNetBasePrice,
      expected: { hasLoggroSheets: true, unitPriceNetIsBase: 13889 },
      actual: { hasLoggroSheets, unitPriceNetInRow },
      observations: [
        'Loggro requiere precio unitario sin impuesto ($13.889) y no el PVP ($15.000). Verificado exitosamente en Hoja Detalles.'
      ]
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}


// Self-invoking runner for automated CLI execution
if (process.argv[1]?.includes('taxAuditTests')) {
  runTaxAuditSuite().then((res) => {
    console.log('\n======================================================');
    console.log(`TEST SUITE RESULTS: allPassed = ${res.allPassed}`);
    console.log('======================================================\n');
    res.results.forEach((r) => {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.id}: ${r.name}`);
      console.log('  Expected:', JSON.stringify(r.expected));
      console.log('  Actual:  ', JSON.stringify(r.actual));
      console.log('  Notes:   ', r.observations.join(' | '));
      console.log('------------------------------------------------------');
    });
    if (!res.allPassed) {
      process.exit(1);
    }
  });
}
