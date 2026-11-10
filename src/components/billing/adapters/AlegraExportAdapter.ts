/**
 * Arquitectura del Adaptador para Alegra Colombia (.xlsx).
 *
 * RESTRICCIÓN DE INTEGRIDAD (FASE 3):
 * Alegra Colombia no utiliza una plantilla pública única estandarizada para importación masiva de facturas de venta en Excel,
 * sino que requiere integración por API REST de Alegra Nube o parametrización personalizada de columnas por usuario.
 * Para evitar la generación de archivos incompatibles, este adaptador permanece en arquitectura deshabilitada
 * hasta contar con la plantilla oficial verificada para el flujo de ventas del cliente.
 */

import {
  ExportGeneratorOptions,
  IAccountingExportAdapter,
  NormalizedExportSale
} from './types';

export class AlegraExportAdapter implements IAccountingExportAdapter {
  readonly providerId = 'alegra' as const;
  readonly displayName = 'Alegra Colombia (Pendiente / Deshabilitado)';
  readonly fileExtension = 'xlsx' as const;
  readonly mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /**
   * Indica si la plantilla está verificada para producción.
   */
  readonly isVerified: boolean = false;

  async generate(
    _sales: NormalizedExportSale[],
    _options: ExportGeneratorOptions
  ): Promise<{ data: Uint8Array; filename: string }> {
    throw new Error(
      'El adaptador para Alegra Colombia requiere integración mediante API REST oficial o la plantilla Excel específica de ventas confirmada por tu contador. La descarga directa para Alegra se mantiene deshabilitada para evitar errores en tu contabilidad.'
    );
  }
}

export const alegraExportAdapter = new AlegraExportAdapter();
