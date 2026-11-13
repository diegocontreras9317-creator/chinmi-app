/**
 * Servicio de persistencia y consulta desacoplado para el módulo de Facturación y Exportaciones.
 * Regla de Oro: Las ventas históricas en users/${uid}/ventas/{saleId} permanecen INMUTABLES.
 * Los metadatos de estado de exportación y facturación externa se guardan en users/${uid}/ventas_metadatos/{saleId}.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  startAfter,
  where,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { SaleReceipt, OrderItem, ProductTaxType } from '../../types';
import {
  ExternalFilingStatus,
  InvoiceExportStatus,
  InvoiceRequestStatus,
  NormalizedExportSale,
  NormalizedExportLine,
  RestaurantFiscalProfile,
  SaleBillingMetadata
} from './adapters/types';
import { handleFirestoreError, OperationType, sanitizeForFirestore } from '../../services/firestoreUserStorage';

/**
 * Obtiene el UID autenticado de forma estricta.
 * Rechaza la operación si el usuario no tiene sesión o intenta impersonar otro UID.
 */
function getStrictAuthUid(targetUid?: string): string {
  const currentAuth = auth.currentUser;
  if (!currentAuth || !currentAuth.uid) {
    throw new Error('Operación no autorizada: No hay sesión autenticada en Firebase.');
  }

  // Si se pasa targetUid, verificar que coincida con el usuario autenticado para impedir saltos entre restaurantes
  if (targetUid && targetUid.trim() && targetUid.trim() !== currentAuth.uid) {
    console.error(`[Seguridad Multi-Tenant] Intento de acceso a UID ${targetUid} desde ${currentAuth.uid}`);
    throw new Error('Violación de seguridad multi-empresa: No tienes permisos para acceder a los datos de otro restaurante.');
  }

  return currentAuth.uid;
}

/**
 * Consulta paginada de todas las ventas históricas sin limitarse a 100 registros.
 * Utiliza paginación por cursor (startAfter) en lotes de 200 documentos para no desbordar memoria ni cuotas.
 */
export async function fetchAllUserSalesPaginated(
  targetUid?: string,
  options?: {
    startDate?: string; // YYYY-MM-DD
    endDate?: string;   // YYYY-MM-DD
    batchSize?: number;
    onProgress?: (loadedCount: number) => void;
  }
): Promise<SaleReceipt[]> {
  const uid = getStrictAuthUid(targetUid);
  const path = `users/${uid}/ventas`;
  const batchSize = options?.batchSize || 200;
  const allSales: SaleReceipt[] = [];

  try {
    const colRef = collection(db, 'users', uid, 'ventas');
    let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMore = true;

    while (hasMore) {
      const constraints: any[] = [orderBy('timestamp', 'desc')];

      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }
      constraints.push(limit(batchSize));

      const q = query(colRef, ...constraints);
      const snap = await getDocs(q);

      if (snap.empty) {
        hasMore = false;
        break;
      }

      snap.docs.forEach((d) => {
        const sale = { id: d.id, ...d.data() } as SaleReceipt;

        // Filtrado por fecha opcional si fue provisto
        if (options?.startDate || options?.endDate) {
          const saleDateKey = (sale.timestamp || '').slice(0, 10);
          if (options.startDate && saleDateKey < options.startDate) return;
          if (options.endDate && saleDateKey > options.endDate) return;
        }

        allSales.push(sale);
      });

      if (options?.onProgress) {
        options.onProgress(allSales.length);
      }

      if (snap.docs.length < batchSize) {
        hasMore = false;
      } else {
        lastDoc = snap.docs[snap.docs.length - 1];
      }
    }

    return allSales;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    throw err;
  }
}

/**
 * Obtiene los metadatos de facturación desacoplados de una venta: users/${uid}/ventas_metadatos/{saleId}
 */
export async function getSaleBillingMetadata(
  saleId: string,
  targetUid?: string
): Promise<SaleBillingMetadata | null> {
  const uid = getStrictAuthUid(targetUid);
  if (!saleId) return null;
  const path = `users/${uid}/ventas_metadatos/${saleId}`;

  try {
    const docRef = doc(db, 'users', uid, 'ventas_metadatos', saleId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data() as SaleBillingMetadata;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    return null;
  }
}

/**
 * Obtiene los metadatos de facturación para una lista de ventas en un mapa indexado por saleId.
 */
export async function getSalesBillingMetadataMap(
  targetUid?: string
): Promise<Map<string, SaleBillingMetadata>> {
  const uid = getStrictAuthUid(targetUid);
  const metadataMap = new Map<string, SaleBillingMetadata>();
  const path = `users/${uid}/ventas_metadatos`;

  try {
    const colRef = collection(db, 'users', uid, 'ventas_metadatos');
    const snap = await getDocs(colRef);
    snap.docs.forEach((d) => {
      metadataMap.set(d.id, d.data() as SaleBillingMetadata);
    });
    return metadataMap;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return metadataMap;
  }
}

/**
 * Actualiza los metadatos de facturación y exportación SIN modificar la venta original.
 */
export async function updateSaleBillingMetadata(
  saleId: string,
  patch: Partial<SaleBillingMetadata>,
  targetUid?: string
): Promise<SaleBillingMetadata> {
  const uid = getStrictAuthUid(targetUid);
  if (!saleId) throw new Error('saleId es requerido para actualizar metadatos.');
  const path = `users/${uid}/ventas_metadatos/${saleId}`;

  try {
    const docRef = doc(db, 'users', uid, 'ventas_metadatos', saleId);
    const existingSnap = await getDoc(docRef);
    const existing = existingSnap.exists() ? (existingSnap.data() as SaleBillingMetadata) : null;

    const updated: SaleBillingMetadata = sanitizeForFirestore({
      saleId,
      userId: uid,
      requestStatus: patch.requestStatus || existing?.requestStatus || 'no_solicitada',
      exportStatus: patch.exportStatus || existing?.exportStatus || 'no_exportado',
      lastExportedAt: patch.lastExportedAt ?? existing?.lastExportedAt ?? null,
      lastExportProvider: patch.lastExportProvider ?? existing?.lastExportProvider ?? null,
      filingStatus: patch.filingStatus || existing?.filingStatus || 'pendiente',
      externalInvoiceNumber: patch.externalInvoiceNumber ?? existing?.externalInvoiceNumber ?? '',
      externalProviderUsed: patch.externalProviderUsed ?? existing?.externalProviderUsed ?? '',
      filingDate: patch.filingDate ?? existing?.filingDate ?? null,
      filedBy: patch.filedBy ?? existing?.filedBy ?? '',
      filingNotes: patch.filingNotes ?? existing?.filingNotes ?? '',
      customerFiscalOverride: patch.customerFiscalOverride ?? existing?.customerFiscalOverride ?? null,
      updatedAt: new Date().toISOString()
    });

    await setDoc(docRef, updated, { merge: true });
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Marca por lotes un conjunto de ventas como exportadas en sus metadatos sin tocar las ventas originales.
 */
export async function bulkMarkSalesAsExported(
  saleIds: string[],
  provider: SaleBillingMetadata['lastExportProvider'],
  targetUid?: string
): Promise<void> {
  const uid = getStrictAuthUid(targetUid);
  const nowIso = new Date().toISOString();

  for (const saleId of saleIds) {
    await updateSaleBillingMetadata(
      saleId,
      {
        exportStatus: 'exportado',
        lastExportedAt: nowIso,
        lastExportProvider: provider
      },
      uid
    );
  }
}

/**
 * Carga el perfil fiscal del restaurante desde users/${uid}/config_fiscal/general
 */
export async function getRestaurantFiscalProfile(targetUid?: string): Promise<RestaurantFiscalProfile> {
  const uid = getStrictAuthUid(targetUid);
  const path = `users/${uid}/config_fiscal/general`;

  try {
    const docRef = doc(db, 'users', uid, 'config_fiscal', 'general');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as RestaurantFiscalProfile;
    }

    // Perfil por defecto con valores estándar
    return {
      businessName: 'Mi Restaurante',
      tradeName: 'Mi Restaurante',
      nit: '222222222222',
      dv: '0',
      address: 'Calle Principal',
      city: 'Bogotá, D.C.',
      department: 'Bogotá D.C.',
      daneCode: '11001',
      email: 'contabilidad@mirestaurante.com',
      phone: '3000000000',
      taxRegime: 'no_responsable_iva',
      fiscalResponsibilities: ['R-99-PN'],
      defaultTaxType: 'impoconsumo',
      defaultTaxRate: 8,
      economicActivityCode: '5611'
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
    throw err;
  }
}

/**
 * Guarda o actualiza el perfil fiscal del restaurante en users/${uid}/config_fiscal/general
 */
export async function saveRestaurantFiscalProfile(
  profile: RestaurantFiscalProfile,
  targetUid?: string
): Promise<void> {
  const uid = getStrictAuthUid(targetUid);
  const path = `users/${uid}/config_fiscal/general`;

  try {
    const docRef = doc(db, 'users', uid, 'config_fiscal', 'general');
    await setDoc(docRef, sanitizeForFirestore(profile), { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Transforma y normaliza una lista de SaleReceipt combinada con sus metadatos
 * en NormalizedExportSale listos para los exportadores.
 * Preserva 100% los valores monetarios históricos registrados en el ticket.
 */
export function normalizeSalesForExport(
  sales: SaleReceipt[],
  metadataMap: Map<string, SaleBillingMetadata>
): NormalizedExportSale[] {
  return sales.map((sale) => {
    const meta = metadataMap.get(sale.id);
    const fiscalData = meta?.customerFiscalOverride || sale.billingInfo;

    const requestStatus: InvoiceRequestStatus =
      meta?.requestStatus ||
      (sale.requiresElectronicInvoice || fiscalData?.requiresElectronicInvoice ? 'solicitada' : 'no_solicitada');

    const exportStatus: InvoiceExportStatus = meta?.exportStatus || 'no_exportado';
    const filingStatus: ExternalFilingStatus =
      meta?.filingStatus || (sale.electronicInvoiceStatus === 'emitida' ? 'emitida' : 'pendiente');

    const rawTotal = Number(sale.total) || 0;
    const rawSubtotal = Number(sale.subtotal) || 0;
    const rawDiscount = Math.max(0, Number(sale.discountAmount) || 0);
    const rawTip = Math.max(0, Number(sale.tipAmount) || 0);
    const rawTaxAmount = Math.max(0, Number(sale.taxAmount) || 0);
    const rawIva = Math.max(0, Number(sale.ivaAmount) || 0);
    const rawImpoconsumo = Math.max(0, Number(sale.impoconsumoAmount) || 0);

    const items = sale.items || [];
    let isIncompatible = items.length === 0 && rawTotal > 0;
    let incompatibilityReason: string | undefined = isIncompatible
      ? 'Comprobante histórico sin detalle de productos registrados; no es posible determinar la base gravable por línea de forma fidedigna.'
      : undefined;

    // 1. Preparar líneas brutas de productos
    interface RawPreparedLine {
      idx: number;
      it: OrderItem;
      qty: number;
      unitPvp: number;
      grossTotal: number;
      explicitDiscount?: number;
      taxType: ProductTaxType;
      taxRate: number;
    }

    const rawPrepared: RawPreparedLine[] = items.map((it: OrderItem, idx: number) => {
      const qty = Number(it.quantity) || 1;
      const unitPvp = Number(it.unitPrice) || 0;
      const grossTotal = Math.round(qty * unitPvp);
      const taxRate = Number(it.taxRate ?? sale.taxPercent ?? 0);
      const taxType: ProductTaxType =
        it.taxType ||
        (taxRate === 19
          ? 'iva'
          : taxRate === 5
          ? 'iva'
          : taxRate === 8
          ? 'impoconsumo'
          : taxRate === 0
          ? 'exento'
          : rawIva > 0
          ? 'iva'
          : 'impoconsumo');

      const explicitDiscount =
        (it as any).discountAmount !== undefined
          ? Math.max(0, Number((it as any).discountAmount) || 0)
          : (it as any).discount !== undefined
          ? Math.max(0, Number((it as any).discount) || 0)
          : undefined;

      return {
        idx,
        it,
        qty,
        unitPvp,
        grossTotal,
        explicitDiscount,
        taxType,
        taxRate
      };
    });

    const sumGrossCalculated = rawPrepared.reduce((acc, p) => acc + p.grossTotal, 0);
    const effectiveSubtotal = rawSubtotal > 0 ? rawSubtotal : sumGrossCalculated;

    // 2. Prorrateo determinista de descuentos (Regla de Mayor Resto / Hamilton-Hare)
    const hasExplicitDiscounts = rawPrepared.some((p) => p.explicitDiscount !== undefined);
    const sumExplicitDiscounts = rawPrepared.reduce((acc, p) => acc + (p.explicitDiscount || 0), 0);

    const lineDiscounts: number[] = new Array(rawPrepared.length).fill(0);

    if (hasExplicitDiscounts && sumExplicitDiscounts === rawDiscount) {
      // Caso A: Descuentos fijados explícitamente a nivel de ítem que coinciden con el total
      rawPrepared.forEach((p, i) => {
        lineDiscounts[i] = p.explicitDiscount || 0;
      });
    } else if (rawDiscount > 0 && sumGrossCalculated > 0) {
      // Caso B: Prorrateo determinista proporcional al valor bruto de cada producto
      const unroundedDiscounts = rawPrepared.map((p) => {
        const floatDisc = rawDiscount * (p.grossTotal / sumGrossCalculated);
        const floorDisc = Math.floor(floatDisc);
        const remainder = floatDisc - floorDisc;
        return { floorDisc, remainder };
      });

      const initialSum = unroundedDiscounts.reduce((acc, u) => acc + u.floorDisc, 0);
      let diff = rawDiscount - initialSum;

      // Ordenar índices por mayor resto decimal para asignar los centavos de ajuste
      const sortedByRemainder = unroundedDiscounts
        .map((u, i) => ({ i, remainder: u.remainder }))
        .sort((a, b) => b.remainder - a.remainder);

      sortedByRemainder.forEach(({ i }) => {
        lineDiscounts[i] = unroundedDiscounts[i].floorDisc;
        if (diff > 0) {
          lineDiscounts[i] += 1;
          diff -= 1;
        }
      });
    }

    // 3. Cálculo de neto, base gravable e impuesto por línea
    interface PreReconciledLine {
      raw: RawPreparedLine;
      discount: number;
      netTotal: number;
      taxableBase: number;
      taxAmount: number;
    }

    const preLines: PreReconciledLine[] = rawPrepared.map((p, i) => {
      const discount = Math.min(p.grossTotal, lineDiscounts[i] || 0);
      const netTotal = Math.max(0, p.grossTotal - discount);
      const rate = p.taxRate;

      let taxableBase = netTotal;
      let taxAmount = 0;

      if (rate > 0 && p.taxType !== 'exento') {
        const exactBase = netTotal / (1 + rate / 100);
        taxableBase = Math.round(exactBase);
        taxAmount = netTotal - taxableBase;
      }

      return {
        raw: p,
        discount,
        netTotal,
        taxableBase,
        taxAmount
      };
    });

    // 4. Conciliación de redondeos con importes históricos del recibo (Neto, IVA e INC)
    // Garantiza que la suma del detalle concilie exactamente con los totales históricos de la cabecera
    const targetNetTotal = rawTotal > 0 ? Math.max(0, rawTotal - rawTip) : Math.max(0, effectiveSubtotal - rawDiscount);
    const sumLineNet = preLines.reduce((acc, l) => acc + l.netTotal, 0);
    const deltaNet = targetNetTotal - sumLineNet;

    if (deltaNet !== 0 && Math.abs(deltaNet) <= 5) {
      // Ajustar determinísticamente en la línea con mayor importe bruto
      const targetLine = preLines.slice().sort((a, b) => b.raw.grossTotal - a.raw.grossTotal)[0];
      if (targetLine) {
        targetLine.netTotal += deltaNet;
        targetLine.discount = Math.max(0, targetLine.raw.grossTotal - targetLine.netTotal);
        if (targetLine.raw.taxRate > 0 && targetLine.raw.taxType !== 'exento') {
          const exactBase = targetLine.netTotal / (1 + targetLine.raw.taxRate / 100);
          targetLine.taxableBase = Math.round(exactBase);
          targetLine.taxAmount = targetLine.netTotal - targetLine.taxableBase;
        } else {
          targetLine.taxableBase = targetLine.netTotal;
          targetLine.taxAmount = 0;
        }
      }
    } else if (deltaNet !== 0 && Math.abs(deltaNet) > 5) {
      isIncompatible = true;
      incompatibilityReason = `Descuadre de redondeo de ${deltaNet} COP entre el total del comprobante y la suma del detalle.`;
    }

    const sumLineIva = preLines
      .filter((l) => l.raw.taxType === 'iva')
      .reduce((acc, l) => acc + l.taxAmount, 0);
    const deltaIva = rawIva > 0 ? rawIva - sumLineIva : 0;

    if (deltaIva !== 0 && Math.abs(deltaIva) <= 5) {
      // Ajustar determinísticamente en la línea de IVA con mayor importe neto gravado
      const targetIvaLine = preLines
        .filter((l) => l.raw.taxType === 'iva' && l.taxAmount > 0)
        .sort((a, b) => b.netTotal - a.netTotal)[0];

      if (targetIvaLine) {
        targetIvaLine.taxAmount += deltaIva;
        targetIvaLine.taxableBase -= deltaIva; // Mantiene invariante: taxableBase + taxAmount === netTotal
      }
    }

    const sumLineInc = preLines
      .filter((l) => l.raw.taxType === 'impoconsumo')
      .reduce((acc, l) => acc + l.taxAmount, 0);
    const deltaInc = rawImpoconsumo > 0 ? rawImpoconsumo - sumLineInc : 0;

    if (deltaInc !== 0 && Math.abs(deltaInc) <= 5) {
      // Ajustar determinísticamente en la línea de INC con mayor importe neto gravado
      const targetIncLine = preLines
        .filter((l) => l.raw.taxType === 'impoconsumo' && l.taxAmount > 0)
        .sort((a, b) => b.netTotal - a.netTotal)[0];

      if (targetIncLine) {
        targetIncLine.taxAmount += deltaInc;
        targetIncLine.taxableBase -= deltaInc; // Mantiene invariante: taxableBase + taxAmount === netTotal
      }
    }

    // 5. Construir líneas normalizadas definitivas
    const lines: NormalizedExportLine[] = preLines.map(({ raw: p, discount, netTotal, taxableBase, taxAmount }) => ({
      saleId: sale.id,
      ticketNumber: sale.id.startsWith('tick-') ? sale.id.replace('tick-', '') : sale.id,
      sku: (p.it as any).sku || p.it.productId || `PROD-${p.idx + 1}`,
      name: p.it.name || 'Producto',
      quantity: p.qty,
      unitPrice: p.unitPvp,
      grossTotal: p.grossTotal,
      discount,
      netTotal,
      taxableBase,
      taxType: p.taxType,
      taxRate: p.taxRate,
      taxAmount,
      total: netTotal
    }));

    // 6. Segregación rigurosa por tarifas para columnas contables
    let iva19Amount = 0;
    let iva19Base = 0;
    let iva5Amount = 0;
    let iva5Base = 0;
    let ivaOtherAmount = 0;
    let ivaOtherBase = 0;
    let inc8Amount = 0;
    let inc8Base = 0;
    let incOtherAmount = 0;
    let incOtherBase = 0;
    let exemptBase = 0;

    for (const l of lines) {
      if (l.taxType === 'iva') {
        if (l.taxRate === 19) {
          iva19Amount += l.taxAmount;
          iva19Base += l.taxableBase;
        } else if (l.taxRate === 5) {
          iva5Amount += l.taxAmount;
          iva5Base += l.taxableBase;
        } else {
          ivaOtherAmount += l.taxAmount;
          ivaOtherBase += l.taxableBase;
        }
      } else if (l.taxType === 'impoconsumo') {
        if (l.taxRate === 8) {
          inc8Amount += l.taxAmount;
          inc8Base += l.taxableBase;
        } else {
          incOtherAmount += l.taxAmount;
          incOtherBase += l.taxableBase;
        }
      } else {
        exemptBase += (l.netTotal ?? l.total ?? 0);
      }
    }

    // Si los comprobantes históricos no registraron el desglose por tarifa en ítems,
    // preservar fidedignamente los importes consolidados originales
    const finalIva = rawIva > 0 ? rawIva : iva19Amount + iva5Amount + ivaOtherAmount;
    const finalInc = rawImpoconsumo > 0 ? rawImpoconsumo : inc8Amount + incOtherAmount;
    const finalTaxAmount = (rawIva > 0 || rawImpoconsumo > 0) ? (finalIva + finalInc) : (rawTaxAmount > 0 ? rawTaxAmount : finalIva + finalInc);

    // Si la venta no tenía ítems pero tenía ivaAmount/impoconsumoAmount consolidados:
    if (lines.length > 0) {
      if (iva19Amount === 0 && iva5Amount === 0 && ivaOtherAmount === 0 && rawIva > 0) {
        iva19Amount = rawIva; // Atribución estándar solo si no había ninguna otra tarifa explicita
      }
      if (inc8Amount === 0 && incOtherAmount === 0 && rawImpoconsumo > 0) {
        inc8Amount = rawImpoconsumo;
      }
    }

    const totalTaxableBase = lines.filter((l) => l.taxType !== 'exento' && l.taxRate > 0).reduce((acc, l) => acc + l.taxableBase, 0);
    const calculatedBase = totalTaxableBase > 0
      ? totalTaxableBase
      : (finalTaxAmount > 0 ? Math.max(0, effectiveSubtotal - rawDiscount - finalTaxAmount) : 0);
    const netProductsTotal = targetNetTotal;


    return {
      saleId: sale.id,
      ticketNumber: sale.id.startsWith('tick-') ? sale.id.replace('tick-', '') : sale.id,
      timestamp: sale.timestamp || new Date().toISOString(),
      dateKey: (sale.timestamp || '').slice(0, 10),
      tableName: sale.tableName || 'Mesa',
      subaccountNames: sale.subaccountNames,
      isPartialTableCheckout: sale.isPartialTableCheckout,
      cashierName: sale.cashierName || 'Cajero',
      paymentMethod: sale.paymentMethod || 'efectivo',
      paymentBreakdown: sale.paymentBreakdown,
      customerName: fiscalData?.customerName || sale.customerName || 'Consumidor Final',
      documentType: fiscalData?.documentType || sale.customerDocumentType || 'CONSUMIDOR_FINAL',
      documentNumber: String(fiscalData?.documentNumber || sale.customerDocumentNumber || '222222222222').trim(),
      dv: fiscalData?.dv || undefined,
      email: fiscalData?.email || sale.customerEmail || undefined,
      phone: fiscalData?.phone || undefined,
      address: fiscalData?.address || undefined,
      city: fiscalData?.city || undefined,
      department: fiscalData?.department || undefined,
      subtotal: effectiveSubtotal,
      discountAmount: rawDiscount,
      discountPercent: Number(sale.discountPercent) || (effectiveSubtotal > 0 ? Math.round((rawDiscount / effectiveSubtotal) * 1000) / 10 : 0),
      netProductsTotal,
      taxableBase: calculatedBase,
      exemptBase,
      taxAmount: finalTaxAmount,
      ivaAmount: finalIva,
      iva19Amount,
      iva19Base,
      iva5Amount,
      iva5Base,
      ivaOtherAmount,
      ivaOtherBase,
      impoconsumoAmount: finalInc,
      inc8Amount,
      inc8Base,
      incOtherAmount,
      incOtherBase,
      tipAmount: rawTip,
      total: rawTotal > 0 ? rawTotal : netProductsTotal + rawTip,
      requestStatus,
      exportStatus,
      filingStatus,
      externalInvoiceNumber: meta?.externalInvoiceNumber,
      externalProviderUsed: meta?.externalProviderUsed,
      filingDate: meta?.filingDate,
      filingNotes: meta?.filingNotes,
      isIncompatible,
      incompatibilityReason,
      lines,
      originalReceipt: sale
    };
  });
}
