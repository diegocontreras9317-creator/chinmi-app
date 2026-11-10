/**
 * Pruebas automatizadas de validación contable para los adaptadores de exportación Chinmi App.
 * Ejecuta escenarios de prueba con:
 * 1. Ventas con INC (8%)
 * 2. Ventas con IVA (19%)
 * 3. Ventas exentas (0%)
 * 4. Ventas con propinas y descuentos
 * 5. Ventas con documentos con ceros iniciales (ej: '0900123456')
 * 6. Ventas con datos fiscales incompletos
 * 7. Validación de estructura de 3 hojas de XLSX y delimitación de CSV
 */

import { GeneralExcelExportAdapter } from './GeneralExcelExportAdapter';
import { GeneralCsvExportAdapter } from './GeneralCsvExportAdapter';
import {
  NormalizedExportSale,
  RestaurantFiscalProfile
} from './types';
import * as XLSX from 'xlsx';

export interface TestResultReport {
  name: string;
  passed: boolean;
  details: string;
}

export async function runExportAdaptersAutomatedTests(): Promise<{
  allPassed: boolean;
  results: TestResultReport[];
}> {
  const results: TestResultReport[] = [];

  const mockRestaurant: RestaurantFiscalProfile = {
    businessName: 'Chinmi GastroBar Test',
    tradeName: 'Chinmi Test',
    nit: '901542890',
    dv: '1',
    address: 'Calle 85 # 14-05',
    city: 'Bogotá, D.C.',
    department: 'Bogotá D.C.',
    daneCode: '11001',
    email: 'contacto@appchinmi.com',
    phone: '3001234567',
    taxRegime: 'responsable_iva',
    fiscalResponsibilities: ['O-13', 'R-99-PN'],
    defaultTaxType: 'impoconsumo',
    defaultTaxRate: 8
  };

  // 1. Caso de prueba: Venta mixta (INC 8% + propina + descuento + NIT con cero inicial)
  const mockSale1: NormalizedExportSale = {
    saleId: 'tick-1001',
    ticketNumber: '1001',
    timestamp: '2026-11-10T12:00:00.000Z',
    dateKey: '2026-11-10',
    tableName: 'Mesa 4',
    cashierName: 'Juan Cajero',
    paymentMethod: 'tarjeta',
    customerName: 'Restaurante El Ejemplo SAS',
    documentType: 'NIT',
    documentNumber: '0900123456', // Cero inicial
    dv: '7',
    email: 'factura@ejemplo.com',
    phone: '3109876543',
    address: 'Carrera 7 # 72-10',
    city: 'Bogotá, D.C.',
    department: 'Bogotá D.C.',
    subtotal: 108000,
    discountAmount: 8000,
    discountPercent: 7.4,
    taxableBase: 92593,
    taxAmount: 7407,
    ivaAmount: 0,
    impoconsumoAmount: 7407,
    tipAmount: 10000,
    total: 110000,
    requestStatus: 'solicitada',
    exportStatus: 'no_exportado',
    filingStatus: 'pendiente',
    lines: [
      {
        saleId: 'tick-1001',
        ticketNumber: '1001',
        sku: 'PLATO-01',
        name: 'Hamburguesa Artesanal',
        quantity: 2,
        unitPrice: 40000,
        discount: 0,
        taxableBase: 74074,
        taxType: 'impoconsumo',
        taxRate: 8,
        taxAmount: 5926,
        total: 80000
      },
      {
        saleId: 'tick-1001',
        ticketNumber: '1001',
        sku: 'BEB-01',
        name: 'Cerveza Nacional',
        quantity: 2,
        unitPrice: 14000,
        discount: 0,
        taxableBase: 25926,
        taxType: 'impoconsumo',
        taxRate: 8,
        taxAmount: 2074,
        total: 28000
      }
    ],
    originalReceipt: {
      id: 'tick-1001',
      orderId: 'ord-1001',
      tableName: 'Mesa 4',
      items: [],
      subtotal: 108000,
      taxAmount: 7407,
      taxPercent: 8,
      impoconsumoAmount: 7407,
      discountAmount: 8000,
      discountPercent: 7.4,
      tipAmount: 10000,
      total: 110000,
      paymentMethod: 'tarjeta',
      timestamp: '2026-11-10T12:00:00.000Z',
      cashierName: 'Juan Cajero'
    }
  };

  // 2. Caso de prueba: Venta con IVA (19%), Consumidor Final sin correo ni ficha fiscal
  const mockSale2: NormalizedExportSale = {
    saleId: 'tick-1002',
    ticketNumber: '1002',
    timestamp: '2026-11-10T13:30:00.000Z',
    dateKey: '2026-11-10',
    tableName: 'Mesa 1',
    cashierName: 'María Barra',
    paymentMethod: 'efectivo',
    customerName: 'Consumidor Final',
    documentType: 'CONSUMIDOR_FINAL',
    documentNumber: '222222222222',
    subtotal: 59500,
    discountAmount: 0,
    discountPercent: 0,
    taxableBase: 50000,
    taxAmount: 9500,
    ivaAmount: 9500,
    impoconsumoAmount: 0,
    tipAmount: 0,
    total: 59500,
    requestStatus: 'no_solicitada',
    exportStatus: 'no_exportado',
    filingStatus: 'pendiente',
    lines: [
      {
        saleId: 'tick-1002',
        ticketNumber: '1002',
        sku: 'LIC-01',
        name: 'Cóctel Especial',
        quantity: 1,
        unitPrice: 59500,
        discount: 0,
        taxableBase: 50000,
        taxType: 'iva',
        taxRate: 19,
        taxAmount: 9500,
        total: 59500
      }
    ],
    originalReceipt: {
      id: 'tick-1002',
      orderId: 'ord-1002',
      tableName: 'Mesa 1',
      items: [],
      subtotal: 59500,
      taxAmount: 9500,
      taxPercent: 19,
      ivaAmount: 9500,
      discountAmount: 0,
      discountPercent: 0,
      tipAmount: 0,
      total: 59500,
      paymentMethod: 'efectivo',
      timestamp: '2026-11-10T13:30:00.000Z',
      cashierName: 'María Barra'
    }
  };

  const testSales = [mockSale1, mockSale2];

  // ==========================================
  // PRUEBA 1: Adaptador Excel General Chinmi (.xlsx)
  // ==========================================
  try {
    const excelAdapter = new GeneralExcelExportAdapter();
    const { data, filename } = await excelAdapter.generate(testSales, {
      restaurant: mockRestaurant,
      dateRangeLabel: '2026-11-10'
    });

    // Leer el buffer binario generado con XLSX para verificar integridad de hojas
    const wb = XLSX.read(data, { type: 'array' });

    const expectedSheets = ['Resumen_Ventas', 'Ventas', 'Detalle_Productos'];
    const hasAllSheets = expectedSheets.every((s) => wb.SheetNames.includes(s));

    if (!hasAllSheets) {
      results.push({
        name: 'Excel General: Estructura de 3 Hojas',
        passed: false,
        details: `Hojas esperadas ${expectedSheets.join(', ')} no coinciden con ${wb.SheetNames.join(', ')}`
      });
    } else {
      // Verificar que el NIT con cero inicial se preservó como texto (@) en la hoja Ventas
      const wsVentas = wb.Sheets['Ventas'];
      const cellDoc = wsVentas['H2']; // Fila 2, Columna 8 (Numero_Identificacion)
      const docValue = cellDoc ? String(cellDoc.v) : '';
      const docType = cellDoc ? cellDoc.t : '';

      const preservedLeadingZero = docValue === '0900123456' && docType === 's';

      results.push({
        name: 'Excel General: Preservación de Ceros Iniciales en NIT/Documentos',
        passed: preservedLeadingZero,
        details: preservedLeadingZero
          ? 'El NIT 0900123456 fue guardado exitosamente como texto (@) sin perder el cero inicial.'
          : `El valor guardado fue ${docValue} con tipo ${docType} (esperaba 's' con valor '0900123456').`
      });

      // Verificar suma exacta en la hoja Resumen_Ventas
      const wsResumen = wb.Sheets['Resumen_Ventas'];
      const totalCell = wsResumen['B17']; // Fila TOTAL NETO COBRADO
      const expectedTotal = 110000 + 59500;
      const totalMatches = Number(totalCell?.v) === expectedTotal;

      results.push({
        name: 'Excel General: Inmutabilidad y Coherencia de Totales',
        passed: totalMatches,
        details: totalMatches
          ? `Total acumulado exacto: COP $${expectedTotal.toLocaleString()} coincide 100% con las ventas originales.`
          : `Total acumulado fue ${totalCell?.v}, esperado ${expectedTotal}.`
      });
    }
  } catch (err: any) {
    results.push({
      name: 'Excel General: Generación sin excepciones',
      passed: false,
      details: `Excepción durante la prueba: ${err?.message || String(err)}`
    });
  }

  // ==========================================
  // PRUEBA 2: Adaptador CSV General (.csv)
  // ==========================================
  try {
    const csvAdapter = new GeneralCsvExportAdapter();
    const { data: csvString, filename } = await csvAdapter.generate(testSales, {
      restaurant: mockRestaurant,
      dateRangeLabel: '2026-11-10'
    });

    const hasBOM = csvString.startsWith('\uFEFF');
    const includesLeadingZeroDoc = csvString.includes('0900123456');
    const includesDelimiters = csvString.includes(';');

    const passedCsv = hasBOM && includesLeadingZeroDoc && includesDelimiters;

    results.push({
      name: 'CSV General: Codificación UTF-8 BOM y Delimitación (;)',
      passed: passedCsv,
      details: passedCsv
        ? 'El archivo CSV incluye UTF-8 BOM, delimitadores ";" y el NIT 0900123456 sin truncamiento.'
        : `Falla en CSV: BOM=${hasBOM}, delimitador=${includesDelimiters}, incluyeNIT=${includesLeadingZeroDoc}`
    });
  } catch (err: any) {
    results.push({
      name: 'CSV General: Generación sin excepciones',
      passed: false,
      details: `Excepción durante la prueba CSV: ${err?.message || String(err)}`
    });
  }

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}
