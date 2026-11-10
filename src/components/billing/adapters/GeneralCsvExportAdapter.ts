/**
 * Adaptador oficial de exportación CSV General (.csv) para Chinmi App.
 * Genera un archivo CSV estándar con delimitador punto y coma (;) compatible con Excel en español,
 * codificación UTF-8 con BOM para preservar tildes y caracteres especiales,
 * y entrecomillado estricto para campos de texto, NITs con ceros iniciales y descripciones.
 */

import {
  ExportGeneratorOptions,
  IAccountingExportAdapter,
  NormalizedExportSale
} from './types';

export class GeneralCsvExportAdapter implements IAccountingExportAdapter {
  readonly providerId = 'chinmi_csv' as const;
  readonly displayName = 'CSV General (.csv)';
  readonly fileExtension = 'csv' as const;
  readonly mimeType = 'text/csv;charset=utf-8;';

  async generate(
    sales: NormalizedExportSale[],
    options: ExportGeneratorOptions
  ): Promise<{ data: string; filename: string }> {
    const { restaurant } = options;
    const delimiter = ';';

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val);

      // Protege los campos de texto contra fórmulas maliciosas en hojas de cálculo (=, +, -, @, \t, \r, \n)
      // incluyendo variaciones precedidas por espacios o caracteres de control
      const leadingClean = str.replace(/^[\s\x00-\x1F\x7F]+/, '');
      if (/^[=+\-@\t\r\n]/.test(leadingClean)) {
        str = "'" + str;
      }

      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const headers = [
      'ID_Interno_Venta',
      'Numero_Ticket',
      'Fecha_Hora',
      'Mesa',
      'Cajero',
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
      'Total_IVA',
      'Base_INC_8',
      'INC_8',
      'Total_INC',
      'Ventas_Exentas_0',
      'Total_Impuestos',
      'Propina',
      'Total_Pagado',
      'Metodo_Pago',
      'Solicito_Factura_Electronica',
      'Estado_Exportacion',
      'Estado_Facturacion_Externa',
      'Numero_Factura_Externa',
      'Cantidad_Items'
    ];

    const lines: string[] = [];

    // Encabezado informativo del restaurante
    lines.push(`# RESTAURANTE: ${restaurant.businessName || 'Chinmi GastroBar'} | NIT: ${restaurant.nit || ''}-${restaurant.dv || ''}`);
    lines.push(`# PERIODO: ${options.dateRangeLabel || 'General'} | GENERADO: ${new Date().toLocaleString('es-CO')}`);
    lines.push(headers.join(delimiter));

    for (const sale of sales) {
      const row = [
        escapeCsv(sale.saleId),
        escapeCsv(sale.ticketNumber),
        escapeCsv(sale.timestamp),
        escapeCsv(sale.tableName),
        escapeCsv(sale.cashierName),
        escapeCsv(sale.customerName),
        escapeCsv(sale.documentType),
        escapeCsv(sale.documentNumber),
        escapeCsv(sale.dv || ''),
        escapeCsv(sale.email || ''),
        escapeCsv(sale.phone || ''),
        escapeCsv(sale.address || ''),
        escapeCsv(sale.city || ''),
        sale.subtotal,
        sale.discountAmount,
        sale.netProductsTotal,
        sale.taxableBase,
        sale.iva19Base,
        sale.iva19Amount,
        sale.iva5Base,
        sale.iva5Amount,
        sale.ivaAmount,
        sale.inc8Base,
        sale.inc8Amount,
        sale.impoconsumoAmount,
        sale.exemptBase,
        sale.taxAmount,
        sale.tipAmount,
        sale.total,
        escapeCsv(sale.paymentMethod),
        escapeCsv(sale.requestStatus === 'solicitada' ? 'SI' : 'NO'),
        escapeCsv(sale.exportStatus),
        escapeCsv(sale.filingStatus),
        escapeCsv(sale.externalInvoiceNumber || ''),
        sale.lines.length
      ];
      lines.push(row.join(delimiter));
    }

    // UTF-8 BOM para apertura perfecta en Excel de escritorio
    const bom = '\uFEFF';
    const csvContent = bom + lines.join('\r\n');

    const safeBusinessName = (restaurant.businessName || 'Chinmi')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 20);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const filename = `Ventas_Chinmi_${safeBusinessName}_${dateStamp}.csv`;

    return { data: csvContent, filename };
  }
}

export const generalCsvExportAdapter = new GeneralCsvExportAdapter();
