/**
 * Adaptador oficial de exportación Excel General Chinmi App (.xlsx).
 * Genera un libro estructurado con tres hojas exactas:
 * Hoja 1: Resumen_Ventas
 * Hoja 2: Ventas
 * Hoja 3: Detalle_Productos
 *
 * Cumple con:
 * - Identificaciones, NITs, SKUs y números de ticket formateados estrictamente como texto (@) para conservar ceros iniciales.
 * - Importes históricos inmutables calculados a partir de los registros de venta originales.
 * - Cruce relacional íntegro entre ventas y productos mediante ID Interno.
 */

import * as XLSX from 'xlsx';
import {
  ExportGeneratorOptions,
  IAccountingExportAdapter,
  NormalizedExportSale
} from './types';

export class GeneralExcelExportAdapter implements IAccountingExportAdapter {
  readonly providerId = 'chinmi_excel' as const;
  readonly displayName = 'Excel General Chinmi App (.xlsx)';
  readonly fileExtension = 'xlsx' as const;
  readonly mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async generate(
    sales: NormalizedExportSale[],
    options: ExportGeneratorOptions
  ): Promise<{ data: Uint8Array; filename: string }> {
    const wb = XLSX.utils.book_new();
    const { restaurant, dateRangeLabel } = options;

    // ==========================================
    // ==========================================
    // HOJA 1: RESUMEN DE VENTAS
    // ==========================================
    const totalSalesCount = sales.length;
    let sumBruto = 0;
    let sumDescuento = 0;
    let sumNetoProductos = 0;
    let sumBaseGravable = 0;
    let sumBaseExenta = 0;
    let sumIva19 = 0;
    let sumIva5 = 0;
    let sumIvaOtras = 0;
    let sumIvaTotal = 0;
    let sumInc8 = 0;
    let sumIncOtras = 0;
    let sumIncTotal = 0;
    let sumImpuestos = 0;
    let sumPropinas = 0;
    let sumTotal = 0;

    const paymentTotals: Record<string, number> = {};

    for (const sale of sales) {
      sumBruto += sale.subtotal;
      sumDescuento += sale.discountAmount;
      sumNetoProductos += sale.netProductsTotal ?? (sale.subtotal - sale.discountAmount);
      sumBaseGravable += sale.taxableBase;
      sumBaseExenta += sale.exemptBase || 0;
      sumIva19 += sale.iva19Amount || 0;
      sumIva5 += sale.iva5Amount || 0;
      sumIvaOtras += sale.ivaOtherAmount || 0;
      sumIvaTotal += sale.ivaAmount;
      sumInc8 += sale.inc8Amount || 0;
      sumIncOtras += sale.incOtherAmount || 0;
      sumIncTotal += sale.impoconsumoAmount;
      sumImpuestos += sale.taxAmount;
      sumPropinas += sale.tipAmount;
      sumTotal += sale.total;

      if (Array.isArray(sale.paymentBreakdown) && sale.paymentBreakdown.length > 0) {
        for (const entry of sale.paymentBreakdown) {
          const k = (entry.method || 'efectivo').toLowerCase();
          paymentTotals[k] = (paymentTotals[k] || 0) + (Number(entry.amount) || 0);
        }
      } else {
        const methodKey = (sale.paymentMethod || 'efectivo').toLowerCase();
        paymentTotals[methodKey] = (paymentTotals[methodKey] || 0) + sale.total;
      }
    }

    const summaryRows: any[][] = [
      ['CHINMI APP — RESUMEN GENERAL DE VENTAS Y FACTURACIÓN'],
      ['Establecimiento:', restaurant.businessName || 'Restaurante'],
      ['NIT / Identificación:', `${restaurant.nit || ''}${restaurant.dv ? '-' + restaurant.dv : ''}`],
      ['Dirección / Ciudad:', `${restaurant.address || ''} — ${restaurant.city || ''}`],
      ['Período Liquidado:', dateRangeLabel || 'Período Completo'],
      ['Fecha y Hora de Generación:', new Date().toLocaleString('es-CO')],
      [],
      ['MÉTRICA CONTABLE', 'VALOR (COP)'],
      ['Cantidad Total de Ventas (Tickets)', totalSalesCount],
      ['Ventas Brutas (Subtotal antes de descuento)', sumBruto],
      ['Total Descuentos Comerciales Aplicados', sumDescuento],
      ['Ventas Netas antes de Impuestos y Propinas', sumNetoProductos],
      ['Base Gravable Gravada Consolidada (INC e IVA)', sumBaseGravable],
      ['Ventas Exentas / Excluidas (Tarifa 0%)', sumBaseExenta],
      ['IVA Liquidado — Tarifa General (19%)', sumIva19],
      ['IVA Liquidado — Tarifa Diferencial (5%)', sumIva5],
      ['IVA Liquidado — Otras Tarifas', sumIvaOtras],
      ['Total IVA Consolidado', sumIvaTotal],
      ['Impuesto Nacional al Consumo — INC (8%)', sumInc8],
      ['Impuesto Nacional al Consumo — Otras Tarifas', sumIncOtras],
      ['Total INC Consolidado', sumIncTotal],
      ['Total Impuestos Liquidados (IVA + INC)', sumImpuestos],
      ['Total Propinas / Servicios Voluntarios (No gravado)', sumPropinas],
      ['TOTAL NETO COBRADO EN CAJA', sumTotal],
      [],
      ['DESGLOSE POR MÉTODO DE PAGO', 'VALOR COBRADO (COP)'],
      ['Efectivo', paymentTotals['efectivo'] || 0],
      ['Tarjeta / Datáfono', paymentTotals['tarjeta'] || 0],
      ['Transferencia / Nequi / Daviplata', (paymentTotals['transferencia'] || 0) + (paymentTotals['bizum'] || 0)],
      []
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 44 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Ventas');

    // ==========================================
    // HOJA 2: VENTAS (1 Fila por Venta)
    // ==========================================
    const salesHeader = [
      'ID_Interno_Venta',
      'Numero_Ticket',
      'Fecha_Hora',
      'Mesa',
      'Cajero_Responsable',
      'Cliente_Razon_Social',
      'Tipo_Documento',
      'Numero_Identificacion',
      'Digito_Verificacion',
      'Correo_Electronico',
      'Telefono',
      'Direccion',
      'Ciudad',
      'Subtotal_Bruto',
      'Descuento',
      'Neto_Antes_Propina',
      'Base_Gravable_Total',
      'Base_IVA_19',
      'IVA_19',
      'Base_IVA_5',
      'IVA_5',
      'Base_IVA_Otras',
      'IVA_Otras',
      'Total_IVA',
      'Base_INC_8',
      'INC_8',
      'Base_INC_Otras',
      'INC_Otras',
      'Total_INC',
      'Ventas_Exentas_Tarifa_0',
      'Total_Impuestos',
      'Propina',
      'Total_Pagado',
      'Metodo_Pago',
      'Solicito_Factura_Electronica',
      'Estado_Exportacion',
      'Estado_Facturacion_Externa',
      'Numero_Factura_Externa'
    ];

    const salesRows: any[][] = [salesHeader];

    for (const sale of sales) {
      const tableLabel =
        sale.subaccountNames && sale.subaccountNames.length > 0
          ? `${sale.tableName} (${sale.subaccountNames.join(', ')})`
          : sale.tableName;
      const paymentLabel =
        Array.isArray(sale.paymentBreakdown) && sale.paymentBreakdown.length > 1
          ? `MIXTO (${sale.paymentBreakdown
              .map((p) => `${p.method === 'bizum' ? 'transferencia' : p.method}: ${p.amount}`)
              .join(' + ')})`
          : sale.paymentMethod;

      salesRows.push([
        sale.saleId,
        sale.ticketNumber,
        sale.timestamp,
        tableLabel,
        sale.cashierName,
        sale.customerName,
        sale.documentType,
        sale.documentNumber, // Se formatea como texto
        sale.dv || '',
        sale.email || '',
        sale.phone || '',
        sale.address || '',
        sale.city || '',
        sale.subtotal,
        sale.discountAmount,
        sale.netProductsTotal,
        sale.taxableBase,
        sale.iva19Base,
        sale.iva19Amount,
        sale.iva5Base,
        sale.iva5Amount,
        sale.ivaOtherBase,
        sale.ivaOtherAmount,
        sale.ivaAmount,
        sale.inc8Base,
        sale.inc8Amount,
        sale.incOtherBase,
        sale.incOtherAmount,
        sale.impoconsumoAmount,
        sale.exemptBase,
        sale.taxAmount,
        sale.tipAmount,
        sale.total,
        paymentLabel,
        sale.requestStatus === 'solicitada' ? 'SÍ' : 'NO',
        sale.exportStatus === 'exportado' ? 'EXPORTADO' : 'NO_EXPORTADO',
        sale.filingStatus === 'emitida'
          ? 'EMITIDA'
          : sale.filingStatus === 'requiere_revision'
          ? 'REQUIERE_REVISION'
          : 'PENDIENTE',
        sale.externalInvoiceNumber || ''
      ]);
    }

    const wsSales = XLSX.utils.aoa_to_sheet(salesRows);

    // Forzar tipo texto en columnas que puedan tener ceros iniciales (ID, Ticket, Número Identificación)
    // Columna A (0): ID_Interno_Venta
    // Columna B (1): Numero_Ticket
    // Columna H (7): Numero_Identificacion
    for (let r = 1; r <= sales.length; r++) {
      const cellRefDoc = XLSX.utils.encode_cell({ r, c: 7 });
      if (wsSales[cellRefDoc]) {
        wsSales[cellRefDoc].t = 's';
        wsSales[cellRefDoc].z = '@';
      }
      const cellRefTicket = XLSX.utils.encode_cell({ r, c: 1 });
      if (wsSales[cellRefTicket]) {
        wsSales[cellRefTicket].t = 's';
        wsSales[cellRefTicket].z = '@';
      }
      const cellRefId = XLSX.utils.encode_cell({ r, c: 0 });
      if (wsSales[cellRefId]) {
        wsSales[cellRefId].t = 's';
        wsSales[cellRefId].z = '@';
      }
    }

    wsSales['!cols'] = [
      { wch: 18 }, // ID_Interno_Venta
      { wch: 14 }, // Numero_Ticket
      { wch: 20 }, // Fecha_Hora
      { wch: 12 }, // Mesa
      { wch: 16 }, // Cajero
      { wch: 28 }, // Cliente
      { wch: 16 }, // Tipo Doc
      { wch: 18 }, // Num Identificacion
      { wch: 6 },  // DV
      { wch: 24 }, // Correo
      { wch: 14 }, // Telefono
      { wch: 22 }, // Direccion
      { wch: 16 }, // Ciudad
      { wch: 14 }, // Subtotal_Bruto
      { wch: 12 }, // Descuento
      { wch: 16 }, // Neto_Antes_Propina
      { wch: 16 }, // Base_Gravable_Total
      { wch: 12 }, // Base_IVA_19
      { wch: 10 }, // IVA_19
      { wch: 12 }, // Base_IVA_5
      { wch: 10 }, // IVA_5
      { wch: 12 }, // Base_IVA_Otras
      { wch: 10 }, // IVA_Otras
      { wch: 12 }, // Total_IVA
      { wch: 12 }, // Base_INC_8
      { wch: 10 }, // INC_8
      { wch: 12 }, // Base_INC_Otras
      { wch: 10 }, // INC_Otras
      { wch: 12 }, // Total_INC
      { wch: 18 }, // Ventas_Exentas_Tarifa_0
      { wch: 14 }, // Total_Impuestos
      { wch: 10 }, // Propina
      { wch: 14 }, // Total_Pagado
      { wch: 14 }, // Metodo_Pago
      { wch: 14 }, // Solicito_FE
      { wch: 14 }, // Estado_Exportacion
      { wch: 16 }, // Estado_Facturacion_Externa
      { wch: 18 }  // Numero_Factura_Externa
    ];

    XLSX.utils.book_append_sheet(wb, wsSales, 'Ventas');

    // ==========================================
    // HOJA 3: DETALLE DE PRODUCTOS VENDIDOS
    // ==========================================
    const productsHeader = [
      'ID_Interno_Venta',
      'Numero_Ticket',
      'Codigo_SKU',
      'Nombre_Producto',
      'Cantidad',
      'Precio_Unitario_PVP',
      'Total_Bruto_Linea',
      'Descuento_Linea',
      'Total_Neto_Linea',
      'Tipo_Impuesto',
      'Porcentaje_Tarifa',
      'Base_Gravable_Linea',
      'Valor_Impuesto_Linea'
    ];

    const productsRows: any[][] = [productsHeader];

    for (const sale of sales) {
      for (const line of sale.lines) {
        productsRows.push([
          line.saleId,
          line.ticketNumber,
          line.sku,
          line.name,
          line.quantity,
          line.unitPrice,
          line.grossTotal,
          line.discount,
          line.netTotal,
          line.taxType.toUpperCase(),
          line.taxRate,
          line.taxableBase,
          line.taxAmount
        ]);
      }
    }

    const wsProducts = XLSX.utils.aoa_to_sheet(productsRows);

    // Formatear columnas de SKU, Ticket y Venta como texto
    let productRowIndex = 1;
    for (const sale of sales) {
      for (let i = 0; i < sale.lines.length; i++) {
        // ID_Interno_Venta
        const cellId = XLSX.utils.encode_cell({ r: productRowIndex, c: 0 });
        if (wsProducts[cellId]) {
          wsProducts[cellId].t = 's';
          wsProducts[cellId].z = '@';
        }
        // Numero_Ticket
        const cellTicket = XLSX.utils.encode_cell({ r: productRowIndex, c: 1 });
        if (wsProducts[cellTicket]) {
          wsProducts[cellTicket].t = 's';
          wsProducts[cellTicket].z = '@';
        }
        // SKU
        const cellSku = XLSX.utils.encode_cell({ r: productRowIndex, c: 2 });
        if (wsProducts[cellSku]) {
          wsProducts[cellSku].t = 's';
          wsProducts[cellSku].z = '@';
        }
        productRowIndex++;
      }
    }

    wsProducts['!cols'] = [
      { wch: 18 }, // ID_Interno_Venta
      { wch: 14 }, // Numero_Ticket
      { wch: 16 }, // Codigo_SKU
      { wch: 30 }, // Nombre_Producto
      { wch: 10 }, // Cantidad
      { wch: 16 }, // Precio Unitario
      { wch: 12 }, // Descuento
      { wch: 16 }, // Base Gravable
      { wch: 14 }, // Tipo Impuesto
      { wch: 12 }, // Tarifa
      { wch: 16 }, // Valor Impuesto
      { wch: 16 }  // Total Linea
    ];

    XLSX.utils.book_append_sheet(wb, wsProducts, 'Detalle_Productos');

    // Generar buffer binario compatible
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const u8data = new Uint8Array(wbout);

    const safeBusinessName = (restaurant.businessName || 'Chinmi')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Ventas_Chinmi_${safeBusinessName}_${dateStamp}.xlsx`;

    return { data: u8data, filename };
  }
}

export const generalExcelExportAdapter = new GeneralExcelExportAdapter();
