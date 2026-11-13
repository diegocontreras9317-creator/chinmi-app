/**
 * Adaptador oficial de exportación Excel para Loggro Colombia (.xlsx).
 * Genera el libro estructurado en dos hojas exactas para importación en Loggro ERP.
 *
 * Estructura oficial Loggro:
 * Hoja 1: Encabezado (Comprobante, consecutivo, cliente, forma de pago y totales generales)
 * Hoja 2: Detalles (Líneas de productos con PRECIO UNITARIO NETO SIN IMPUESTOS)
 *
 * REGLA DE ORO DE LOGGRO:
 * Loggro requiere precios unitarios sin impuestos (base gravable unitaria) y calcula los tributos
 * según la configuración del producto en Loggro. NUNCA enviar el PVP con impuesto incluido.
 */

import * as XLSX from 'xlsx';
import {
  ExportGeneratorOptions,
  IAccountingExportAdapter,
  NormalizedExportSale
} from './types';

function formatDateYYYYMMDD(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return '';
  return dateKey.slice(0, 10);
}

export class LoggroExcelExportAdapter implements IAccountingExportAdapter {
  readonly providerId = 'loggro' as const;
  readonly displayName = 'Loggro Colombia (.xlsx)';
  readonly fileExtension = 'xlsx' as const;
  readonly mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async generate(
    sales: NormalizedExportSale[],
    options: ExportGeneratorOptions
  ): Promise<{ data: Uint8Array; filename: string }> {
    const wb = XLSX.utils.book_new();
    const { restaurant } = options;

    const defaultVoucher = restaurant.loggroVoucherType?.trim() || 'FV';

    // ==========================================
    // HOJA 1: ENCABEZADO DE FACTURAS LOGGRO
    // ==========================================
    const headersEncabezado = [
      'Tipo Comprobante',
      'Consecutivo',
      'Fecha',
      'Identificación Cliente',
      'Nombre Cliente',
      'Forma de Pago',
      'Observaciones',
      'Total Venta'
    ];

    const rowsEncabezado: any[][] = [headersEncabezado];

    for (const sale of sales) {
      let paymentLabel = 'EFECTIVO';
      const pm = (sale.paymentMethod || '').toLowerCase();
      if (pm.includes('tarjeta') || pm.includes('card') || pm.includes('datáfono')) {
        paymentLabel = restaurant.loggroPaymentMethodCard || 'TARJETA';
      } else if (pm.includes('transf') || pm.includes('nequi') || pm.includes('davi') || pm.includes('banco')) {
        paymentLabel = restaurant.loggroPaymentMethodTransfer || 'TRANSFERENCIA';
      } else {
        paymentLabel = restaurant.loggroPaymentMethodCash || 'EFECTIVO';
      }

      const mixObs =
        Array.isArray(sale.paymentBreakdown) && sale.paymentBreakdown.length > 1
          ? ` · Pago Mixto (${sale.paymentBreakdown
              .map((p) => `${p.method === 'bizum' ? 'Transferencia' : p.method}: $${p.amount}`)
              .join(' / ')})`
          : '';
      const subObs =
        sale.subaccountNames && sale.subaccountNames.length > 0
          ? ` · Subcuenta: ${sale.subaccountNames.join(', ')}`
          : '';

      rowsEncabezado.push([
        defaultVoucher,
        sale.ticketNumber,
        formatDateYYYYMMDD(sale.dateKey),
        sale.documentNumber || '222222222222',
        sale.customerName || 'Consumidor Final',
        paymentLabel,
        `Mesa: ${sale.tableName || 'General'}${subObs}${mixObs} · Chinmi App Ticket #${sale.ticketNumber}`,
        sale.total
      ]);
    }

    const wsEncabezado = XLSX.utils.aoa_to_sheet(rowsEncabezado);

    // Formatear columnas de consecutivo e identificación como texto
    for (let i = 1; i < rowsEncabezado.length; i++) {
      const cellConsec = XLSX.utils.encode_cell({ r: i, c: 1 });
      if (wsEncabezado[cellConsec]) {
        wsEncabezado[cellConsec].t = 's';
        wsEncabezado[cellConsec].z = '@';
      }
      const cellDoc = XLSX.utils.encode_cell({ r: i, c: 3 });
      if (wsEncabezado[cellDoc]) {
        wsEncabezado[cellDoc].t = 's';
        wsEncabezado[cellDoc].z = '@';
      }
    }

    wsEncabezado['!cols'] = [
      { wch: 18 }, // Tipo Comprobante
      { wch: 14 }, // Consecutivo
      { wch: 14 }, // Fecha
      { wch: 18 }, // Identificación Cliente
      { wch: 30 }, // Nombre Cliente
      { wch: 20 }, // Forma de Pago
      { wch: 36 }, // Observaciones
      { wch: 16 }  // Total Venta
    ];

    XLSX.utils.book_append_sheet(wb, wsEncabezado, 'Encabezado');

    // ==========================================
    // HOJA 2: DETALLES DE LINEAS LOGGRO
    // ==========================================
    const headersDetalles = [
      'Tipo Comprobante',
      'Consecutivo',
      'Código Producto',
      'Nombre Producto',
      'Cantidad',
      'Precio Unitario Neto', // SIN IMPUESTOS (exclusivo para Loggro)
      'Porcentaje Descuento',
      'Valor Descuento',
      'Base Gravable',
      'Impuesto',
      'Valor Impuesto',
      'Total Línea'
    ];

    const rowsDetalles: any[][] = [headersDetalles];

    for (const sale of sales) {
      for (let i = 0; i < sale.lines.length; i++) {
        const line = sale.lines[i];
        const qty = line.quantity || 1;

        // IMPORTANTE LOGGRO: Precio Unitario Neto = Base Gravable Unitarias (sin tributos incluidos)
        const netUnitPriceWithoutTax = qty > 0 ? Math.round((line.taxableBase / qty) * 100) / 100 : 0;

        let taxLabel = 'EXENTO';
        if (line.taxType === 'iva') {
          taxLabel = `IVA ${line.taxRate}%`;
        } else if (line.taxType === 'impoconsumo') {
          taxLabel = `INC ${line.taxRate}%`;
        }

        const discPercent =
          line.grossTotal && line.discount ? Math.round((line.discount / line.grossTotal) * 100) : 0;

        rowsDetalles.push([
          defaultVoucher,
          sale.ticketNumber,
          line.sku || `SKU-${i + 1}`,
          line.name,
          qty,
          netUnitPriceWithoutTax,
          discPercent,
          line.discount || 0,
          line.taxableBase,
          taxLabel,
          line.taxAmount || 0,
          line.total || line.netTotal || 0
        ]);
      }
    }

    const wsDetalles = XLSX.utils.aoa_to_sheet(rowsDetalles);

    // Formatear consecutivo y SKU como texto
    let dIndex = 1;
    for (const sale of sales) {
      for (let i = 0; i < sale.lines.length; i++) {
        const cellConsec = XLSX.utils.encode_cell({ r: dIndex, c: 1 });
        if (wsDetalles[cellConsec]) {
          wsDetalles[cellConsec].t = 's';
          wsDetalles[cellConsec].z = '@';
        }
        const cellSku = XLSX.utils.encode_cell({ r: dIndex, c: 2 });
        if (wsDetalles[cellSku]) {
          wsDetalles[cellSku].t = 's';
          wsDetalles[cellSku].z = '@';
        }
        dIndex++;
      }
    }

    wsDetalles['!cols'] = [
      { wch: 18 }, // Tipo Comprobante
      { wch: 14 }, // Consecutivo
      { wch: 16 }, // Código Producto
      { wch: 30 }, // Nombre Producto
      { wch: 10 }, // Cantidad
      { wch: 18 }, // Precio Unitario Neto
      { wch: 12 }, // Porcentaje Descuento
      { wch: 14 }, // Valor Descuento
      { wch: 14 }, // Base Gravable
      { wch: 14 }, // Impuesto
      { wch: 14 }, // Valor Impuesto
      { wch: 16 }  // Total Línea
    ];

    XLSX.utils.book_append_sheet(wb, wsDetalles, 'Detalles');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const u8data = new Uint8Array(wbout);

    const safeBusinessName = (restaurant.businessName || 'Chinmi')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Loggro_Facturas_${safeBusinessName}_${dateStamp}.xlsx`;

    return { data: u8data, filename };
  }
}

export const loggroExcelExportAdapter = new LoggroExcelExportAdapter();
