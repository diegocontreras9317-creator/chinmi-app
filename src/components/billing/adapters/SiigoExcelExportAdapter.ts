/**
 * Adaptador oficial de exportación Excel para Siigo Colombia (.xlsx).
 * Genera el libro oficial de importación masiva de Facturas de Venta para Siigo Nube.
 *
 * Estructura oficial:
 * Hoja 1: Facturas_Venta (Plantilla estándar de comprobantes de ventas FV-1 Siigo)
 * Hoja 2: Terceros_Clientes (Directorio de clientes y responsables fiscales)
 *
 * Cumple con:
 * - Nombres y orden exacto de columnas requeridas por Siigo.
 * - Formato de identificaciones, consecutivos y SKUs como texto para preservar ceros iniciales.
 * - Mapeo personalizable de tipos de comprobante y formas de pago por restaurante.
 */

import * as XLSX from 'xlsx';
import {
  ExportGeneratorOptions,
  IAccountingExportAdapter,
  NormalizedExportSale
} from './types';

function formatDateDDMMYYYY(dateKey: string): string {
  if (!dateKey || dateKey.length < 10) return '';
  const parts = dateKey.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateKey;
}

export class SiigoExcelExportAdapter implements IAccountingExportAdapter {
  readonly providerId = 'siigo' as const;
  readonly displayName = 'Siigo Colombia (.xlsx)';
  readonly fileExtension = 'xlsx' as const;
  readonly mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async generate(
    sales: NormalizedExportSale[],
    options: ExportGeneratorOptions
  ): Promise<{ data: Uint8Array; filename: string }> {
    const wb = XLSX.utils.book_new();
    const { restaurant, dateRangeLabel } = options;

    const defaultVoucher = restaurant.siigoVoucherType?.trim() || 'FV-1';

    // ==========================================
    // HOJA 1: FACTURAS DE VENTA SIIGO
    // ==========================================
    const headersFacturas = [
      'Tipo de Comprobante',
      'Consecutivo',
      'Fecha de elaboración',
      'Sigla Moneda',
      'Tasa de Cambio',
      'Identificación Tercero',
      'Sucursal',
      'Código Producto',
      'Nombre Producto',
      'Cantidad',
      'Valor Unitario',
      'Porcentaje Descuento',
      'Valor Descuento',
      'Impuesto Cargo',
      'Valor Impuesto',
      'Valor Total',
      'Forma de Pago',
      'Observaciones'
    ];

    const facturasRows: any[][] = [headersFacturas];
    const uniqueCustomersMap = new Map<string, NormalizedExportSale>();

    for (const sale of sales) {
      // Guardar cliente único para la hoja 2
      const customerDoc = (sale.documentNumber || '222222222222').trim();
      if (!uniqueCustomersMap.has(customerDoc)) {
        uniqueCustomersMap.set(customerDoc, sale);
      }

      // Mapear forma de pago según configuración de restaurante
      let paymentLabel = 'Efectivo';
      const pm = (sale.paymentMethod || '').toLowerCase();
      if (pm.includes('tarjeta') || pm.includes('card') || pm.includes('datáfono')) {
        paymentLabel = restaurant.siigoPaymentMethodCard || 'Tarjeta';
      } else if (pm.includes('transf') || pm.includes('nequi') || pm.includes('davi') || pm.includes('banco')) {
        paymentLabel = restaurant.siigoPaymentMethodTransfer || 'Transferencia Bancaria';
      } else {
        paymentLabel = restaurant.siigoPaymentMethodCash || 'Efectivo';
      }

      for (let i = 0; i < sale.lines.length; i++) {
        const line = sale.lines[i];
        const qty = line.quantity || 1;
        // En Siigo Valor Unitario representa la base unitaria sin impuesto
        const unitBase = qty > 0 ? Math.round((line.taxableBase / qty) * 100) / 100 : 0;

        let taxLabel = 'EXENTO';
        if (line.taxType === 'iva') {
          taxLabel = `IVA ${line.taxRate}%`;
        } else if (line.taxType === 'impoconsumo') {
          taxLabel = `INC ${line.taxRate}%`;
        }

        const discPercent =
          line.grossTotal && line.discount ? Math.round((line.discount / line.grossTotal) * 100) : 0;

        facturasRows.push([
          defaultVoucher,
          sale.ticketNumber,
          formatDateDDMMYYYY(sale.dateKey),
          'COP',
          1,
          customerDoc,
          0,
          line.sku || `SKU-${i + 1}`,
          line.name,
          qty,
          unitBase,
          discPercent,
          line.discount || 0,
          taxLabel,
          line.taxAmount || 0,
          line.total || line.netTotal || 0,
          paymentLabel,
          `Mesa: ${sale.tableName || 'General'} · Chinmi App Ticket #${sale.ticketNumber}`
        ]);
      }
    }

    const wsFacturas = XLSX.utils.aoa_to_sheet(facturasRows);

    // Formatear columnas de texto con comillas / tipo 's' para ceros a la izquierda
    let rIndex = 1;
    for (const sale of sales) {
      for (let i = 0; i < sale.lines.length; i++) {
        // Consecutivo (col B = 1)
        const cellConsec = XLSX.utils.encode_cell({ r: rIndex, c: 1 });
        if (wsFacturas[cellConsec]) {
          wsFacturas[cellConsec].t = 's';
          wsFacturas[cellConsec].z = '@';
        }
        // Identificación Tercero (col F = 5)
        const cellDoc = XLSX.utils.encode_cell({ r: rIndex, c: 5 });
        if (wsFacturas[cellDoc]) {
          wsFacturas[cellDoc].t = 's';
          wsFacturas[cellDoc].z = '@';
        }
        // Código Producto (col H = 7)
        const cellSku = XLSX.utils.encode_cell({ r: rIndex, c: 7 });
        if (wsFacturas[cellSku]) {
          wsFacturas[cellSku].t = 's';
          wsFacturas[cellSku].z = '@';
        }
        rIndex++;
      }
    }

    wsFacturas['!cols'] = [
      { wch: 18 }, // Tipo Comprobante
      { wch: 14 }, // Consecutivo
      { wch: 16 }, // Fecha
      { wch: 10 }, // Moneda
      { wch: 10 }, // Tasa Cambio
      { wch: 18 }, // Identificación Tercero
      { wch: 10 }, // Sucursal
      { wch: 16 }, // Código Producto
      { wch: 30 }, // Nombre Producto
      { wch: 10 }, // Cantidad
      { wch: 16 }, // Valor Unitario
      { wch: 12 }, // Descuento %
      { wch: 14 }, // Valor Descuento
      { wch: 14 }, // Impuesto Cargo
      { wch: 14 }, // Valor Impuesto
      { wch: 16 }, // Valor Total
      { wch: 20 }, // Forma de Pago
      { wch: 36 }  // Observaciones
    ];

    XLSX.utils.book_append_sheet(wb, wsFacturas, 'Facturas_Venta');

    // ==========================================
    // HOJA 2: TERCEROS Y CLIENTES SIIGO
    // ==========================================
    const headersTerceros = [
      'Tipo Tercero',
      'Código Tipo Doc DIAN',
      'Número Identificación',
      'Dígito Verificación',
      'Razón Social / Nombre Completo',
      'Ciudad',
      'Dirección',
      'Teléfono',
      'Correo Electrónico (FE)'
    ];

    const tercerosRows: any[][] = [headersTerceros];
    for (const [docNum, s] of uniqueCustomersMap.entries()) {
      tercerosRows.push([
        'Cliente',
        s.documentType || 'CC',
        docNum,
        s.dv || '',
        s.customerName || 'Consumidor Final',
        s.city || restaurant.city || 'Bogotá, D.C.',
        s.address || restaurant.address || 'Calle Principal',
        s.phone || restaurant.phone || '3000000000',
        s.email || restaurant.email || 'facturacion@mirestaurante.com'
      ]);
    }

    const wsTerceros = XLSX.utils.aoa_to_sheet(tercerosRows);

    // Formatear NITs en Terceros como texto
    for (let i = 1; i < tercerosRows.length; i++) {
      const cellDoc = XLSX.utils.encode_cell({ r: i, c: 2 });
      if (wsTerceros[cellDoc]) {
        wsTerceros[cellDoc].t = 's';
        wsTerceros[cellDoc].z = '@';
      }
    }

    wsTerceros['!cols'] = [
      { wch: 14 }, // Tipo Tercero
      { wch: 16 }, // Tipo Doc DIAN
      { wch: 18 }, // Número Identificación
      { wch: 10 }, // DV
      { wch: 32 }, // Razón Social / Nombre
      { wch: 20 }, // Ciudad
      { wch: 24 }, // Dirección
      { wch: 16 }, // Teléfono
      { wch: 30 }  // Correo
    ];

    XLSX.utils.book_append_sheet(wb, wsTerceros, 'Terceros_Clientes');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const u8data = new Uint8Array(wbout);

    const safeBusinessName = (restaurant.businessName || 'Chinmi')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Siigo_Facturas_${safeBusinessName}_${dateStamp}.xlsx`;

    return { data: u8data, filename };
  }
}

export const siigoExcelExportAdapter = new SiigoExcelExportAdapter();
