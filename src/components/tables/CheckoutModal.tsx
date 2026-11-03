import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  Table,
  PaymentMethod,
  SaleReceipt,
  CustomerDocumentType,
  ROLE_PERMISSIONS
} from '../../types';
import {
  DOCUMENT_TYPE_OPTIONS,
  extractTableBillingInfo,
  normalizeBillingInfo
} from '../../utils/billing';
import { auth, db } from '../../firebase';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { sanitizeForFirestore } from '../../services/firestoreUserStorage';
import {
  X,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  Receipt,
  ArrowRight,
  Calculator,
  Loader2,
  UserCheck,
  FileText,
  AlertCircle
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  onSuccessCheckout: (receipt: SaleReceipt) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  table,
  onSuccessCheckout
}) => {
  const { config, checkoutTable } = useApp();
  const { user, empleadoActivo } = useAuth();

  // Persona activa desde donde se realiza el cobro (perfil de empleado activo o titular de la sesión)
  const activeCashierName =
    empleadoActivo?.nombre?.trim() ||
    user?.name?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    auth.currentUser?.email?.split('@')[0] ||
    'Cajero';

  const activeCashierRole = empleadoActivo?.rol
    ? empleadoActivo.rol
    : user?.role
    ? ROLE_PERMISSIONS[user.role]?.label || user.role
    : 'Caja';

  const activeCashierId = empleadoActivo?.id || user?.id || '';

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerDocType, setCustomerDocType] = useState<CustomerDocumentType>('CONSUMIDOR_FINAL');
  const [customerDocNumber, setCustomerDocNumber] = useState<string>('');
  const [isFromCustomerQr, setIsFromCustomerQr] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && table?.order) {
      setCheckoutError(null);
      const ord = table.order;
      const ordItems = ord.items || (ord as any)?.productos || [];
      const sub = (ordItems || []).reduce((acc: number, item: any) => {
        const price = Number(item?.unitPrice ?? item?.price ?? 0) || 0;
        const qty = Number(item?.quantity ?? item?.cantidad ?? 0) || 0;
        return acc + price * qty;
      }, 0);
      const disc = sub * ((Number(ord.discountPercent) || 0) / 100);
      const tip = Number(ord.tipAmount) || 0;
      setCashTendered(Math.round(sub - disc + tip).toString());

      // Prellenar método de pago si el cliente lo indicó desde el QR
      const preferred = table.waiterCall?.preferredPaymentMethod;
      if (preferred === 'tarjeta') {
        setPaymentMethod('tarjeta');
      } else if (preferred === 'transferencia') {
        setPaymentMethod('bizum');
      } else if (preferred === 'efectivo') {
        setPaymentMethod('efectivo');
      }

      // Prellenar datos de facturación / cliente si fueron registrados desde el QR o en la comanda
      const { billing, fromQrCustomer } = extractTableBillingInfo(table);
      setCustomerName(
        billing.customerName && billing.customerName !== 'Consumidor Final'
          ? billing.customerName
          : ''
      );
      setCustomerDocType(billing.documentType || 'CONSUMIDOR_FINAL');
      setCustomerDocNumber(billing.documentNumber || '');
      setIsFromCustomerQr(fromQrCustomer);
    }
  }, [isOpen, table?.id, table?.order?.id, table?.waiterCall?.requestedAt]);

  if (!isOpen) return null;

  const order = table?.order;
  const items = order?.items || (order as any)?.productos || [];

  if (!table || !order || items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
        <div
          className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {table?.name || 'Mesa'}
            </h3>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-1">
              No hay datos en esta mesa
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              Esta mesa no tiene una comanda o productos activos para cobrar.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const subtotal = (items || []).reduce((acc: number, item: any) => {
    const price = Number(item?.unitPrice ?? item?.price ?? 0) || 0;
    const qty = Number(item?.quantity ?? item?.cantidad ?? 0) || 0;
    return acc + price * qty;
  }, 0);

  const discountPercent = Number(order?.discountPercent) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const productsTotal = subtotal - discountAmount;
  const taxPercent = Number(order?.taxPercent ?? config?.defaultTaxRate ?? 8) || 8;
  const taxAmount = taxPercent > 0 ? productsTotal - productsTotal / (1 + taxPercent / 100) : 0;
  const taxableBase = productsTotal - taxAmount;
  const tipAmount = Number(order?.tipAmount) || 0;
  const total = Math.round(productsTotal + tipAmount);

  const cashNumber = parseFloat(cashTendered) || 0;
  const change = Math.max(0, cashNumber - total);
  const isCashSufficient = paymentMethod !== 'efectivo' || cashNumber >= total;

  const handleQuickCash = (amount: number) => {
    setCashTendered(Math.round(amount).toString());
  };

  const cobrarMesa = async () => {
    setCheckoutError(null);

    if (!table?.id || typeof table.id !== 'string') {
      setCheckoutError('No se encontró el identificador de la mesa para procesar el cobro.');
      return;
    }

    if (!order?.id || typeof order.id !== 'string') {
      setCheckoutError('No se encontró el identificador de la comanda activa.');
      return;
    }

    const activeUid = auth.currentUser?.uid || user?.id;
    if (!activeUid) {
      setCheckoutError('No hay una sesión autenticada activa para registrar la venta.');
      return;
    }

    setIsProcessing(true);
    const nowIso = new Date().toISOString();
    const receiptId = `tick-${Date.now()}`;

    const resolvedBilling = normalizeBillingInfo({
      customerName: customerName.trim(),
      documentType: customerDocType,
      documentNumber: customerDocNumber.trim()
    });

    const receiptPayload = sanitizeForFirestore({
      id: receiptId,
      orderId: order.id,
      tableName: table.name || 'Mesa',
      items: items,
      subtotal: Math.round(subtotal),
      taxAmount: Math.round(taxAmount),
      taxPercent: taxPercent,
      discountAmount: Math.round(discountAmount),
      discountPercent: discountPercent,
      tipAmount: Math.round(tipAmount),
      total: Math.round(total),
      paymentMethod,
      cashTendered: paymentMethod === 'efectivo' && cashNumber > 0 ? Math.round(cashNumber) : undefined,
      change: paymentMethod === 'efectivo' && change >= 0 ? Math.round(change) : undefined,
      timestamp: nowIso,
      cashierName: activeCashierName,
      cashierRole: activeCashierRole,
      cashierId: activeCashierId,
      customerName: resolvedBilling.customerName,
      customerDocumentType: resolvedBilling.documentType,
      customerDocumentNumber: resolvedBilling.documentNumber,
      billingInfo: resolvedBilling,
      userId: activeUid
    });

    try {
      // 1. Guardar recibo único de venta en Firebase (users/uid/ventas/receiptId)
      const ventaRef = doc(db, 'users', activeUid, 'ventas', receiptId);
      await setDoc(ventaRef, receiptPayload, { merge: true });

      // 2. Liberar la mesa en Firebase (users/uid/mesas/table.id)
      const tableFreeData = sanitizeForFirestore({
        id: table.id,
        status: 'libre',
        estado: 'libre',
        order: null,
        currentOrder: null,
        pedidoActual: null,
        waiterCall: null,
        updatedAt: nowIso,
        userId: activeUid
      });
      const mesaRef = doc(db, 'users', activeUid, 'mesas', table.id);
      await setDoc(mesaRef, tableFreeData, { merge: true });

      // 3. Cerrar la comanda en Firebase (users/uid/pedidos/order.id)
      const orderClosedData = sanitizeForFirestore({
        id: order.id,
        estado: 'pagada',
        status: 'pagada',
        closed: true,
        closedAt: nowIso,
        cobradoPor: activeCashierName,
        cobradoPorRol: activeCashierRole,
        customerName: resolvedBilling.customerName,
        billingInfo: resolvedBilling,
        items: [],
        productos: []
      });

      const pedidoRef = doc(db, 'users', activeUid, 'pedidos', order.id);
      try {
        await updateDoc(pedidoRef, orderClosedData);
      } catch {
        await setDoc(pedidoRef, orderClosedData, { merge: true });
      }
    } catch (error) {
      console.error('Error al sincronizar el cobro en Firebase:', error);
      setCheckoutError(
        'Error al registrar el cobro en la nube: ' +
          (error instanceof Error ? error.message : String(error))
      );
      setIsProcessing(false);
      return;
    }

    // 4. Actualizar estado en AppContext con el mismo ID de ticket y datos exactos (sin duplicar escritura)
    const res = checkoutTable(
      table.id,
      paymentMethod,
      paymentMethod === 'efectivo' ? cashNumber : undefined,
      {
        receiptId,
        cashierName: activeCashierName,
        cashierRole: activeCashierRole,
        cashierId: activeCashierId,
        billingInfo: resolvedBilling,
        skipFirestore: true
      }
    );

    setIsProcessing(false);
    if (res.success && res.receipt) {
      onSuccessCheckout(res.receipt);
    } else {
      onSuccessCheckout(receiptPayload as unknown as SaleReceipt);
    }
    onClose();
  };

  const handleConfirm = async () => {
    await cobrarMesa();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div
        className="relative w-full max-w-lg max-h-[95vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-base text-slate-900 dark:text-white truncate">
                Cobrar y Cerrar {table.name}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {table.zone || 'Mesa'} · {items.length} productos · Cobrado por{' '}
                <strong className="text-slate-800 dark:text-slate-200">{activeCashierName}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar cobro"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer border border-slate-200 dark:border-slate-700 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto max-h-[calc(95vh-76px)]">
          {/* Active Operator / Cashier Attribution Bar */}
          <div className="px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-slate-500 dark:text-slate-400">Responsable del cobro:</span>
              <strong className="font-bold text-slate-900 dark:text-white truncate">
                {activeCashierName}
              </strong>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              {activeCashierRole}
            </span>
          </div>

          {/* Total Highlight Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Total a Cobrar
              </span>
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums mt-0.5">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(total))} COP
              </p>
            </div>
            <div className="text-right text-xs text-slate-300 space-y-0.5 font-mono tabular-nums">
              <p>Base: $ {new Intl.NumberFormat('es-CO').format(Math.round(taxableBase))}</p>
              {taxAmount > 0 && (
                <p>
                  Impoconsumo ({taxPercent}%): $ {new Intl.NumberFormat('es-CO').format(Math.round(taxAmount))}
                </p>
              )}
              {discountAmount > 0 && (
                <p className="text-rose-400 font-medium">
                  Desc. ({discountPercent}%): -$ {new Intl.NumberFormat('es-CO').format(Math.round(discountAmount))}
                </p>
              )}
              {tipAmount > 0 && (
                <p className="text-emerald-400 font-medium">
                  Propina: +$ {new Intl.NumberFormat('es-CO').format(Math.round(tipAmount))}
                </p>
              )}
            </div>
          </div>

          {/* Datos del Cliente / A nombre de quién se cobra (NIT, Cédula, etc.) */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>A nombre de quién se cobra / Facturación</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {isFromCustomerQr ? 'Recibido del cliente (QR)' : 'Opcional'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nombre del cliente o Razón Social
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Consumidor Final (o escribe nombre / empresa)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tipo de documento
                </label>
                <select
                  value={customerDocType}
                  onChange={(e) => {
                    const nextType = e.target.value as CustomerDocumentType;
                    setCustomerDocType(nextType);
                    if (nextType === 'CONSUMIDOR_FINAL') {
                      setCustomerDocNumber('');
                    }
                  }}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                >
                  <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
                  <option value="CC">Cédula (C.C.)</option>
                  <option value="NIT">NIT / Empresa</option>
                  <option value="CE">Cédula Extr. (C.E.)</option>
                  <option value="PAS">Pasaporte</option>
                  <option value="TI">Tarjeta Ident. (T.I.)</option>
                  <option value="PEP">PPT / PEP</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  {customerDocType === 'NIT' ? 'Número de NIT (ej. 900123456-7)' : 'Número de identificación'}
                </label>
                <input
                  type="text"
                  value={customerDocNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerDocNumber(val);
                    if (val.trim() && customerDocType === 'CONSUMIDOR_FINAL') {
                      setCustomerDocType('CC');
                    }
                  }}
                  placeholder={
                    DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === customerDocType)?.placeholder ||
                    'Ej. 1020304050'
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
            </div>
          </div>

          {/* Tabla Resumen de Productos de la Comanda */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
            <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>Detalle de Consumo ({items.length} productos)</span>
              <span>Importe</span>
            </div>
            <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 px-4 text-xs">
              {items.map((item: any, idx: number) => {
                const name = item?.productName || item?.name || item?.producto || 'Producto';
                const qty = Number(item?.quantity ?? item?.cantidad ?? 1) || 1;
                const price = Number(item?.unitPrice ?? item?.price ?? 0) || 0;
                const itemTotal = price * qty;
                return (
                  <div
                    key={item?.id || idx}
                    className="py-2 flex items-center justify-between text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="font-bold text-orange-600 dark:text-orange-400 font-mono tabular-nums">
                        {qty}x
                      </span>
                      <span className="truncate">{name}</span>
                      {item?.notes && (
                        <span className="text-[10px] text-slate-400 italic">({item.notes})</span>
                      )}
                    </div>
                    <span className="font-semibold font-mono tabular-nums shrink-0">
                      $ {new Intl.NumberFormat('es-CO').format(itemTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Método de Pago
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                id="pay-method-cash"
                onClick={() => {
                  setPaymentMethod('efectivo');
                  if (!cashTendered) setCashTendered(Math.round(total).toString());
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                  paymentMethod === 'efectivo'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Efectivo</span>
                <span className="text-[10px] opacity-75 font-normal">Caja registradora</span>
              </button>

              <button
                type="button"
                id="pay-method-card"
                onClick={() => setPaymentMethod('tarjeta')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                  paymentMethod === 'tarjeta'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Tarjeta / Datáfono</span>
                <span className="text-[10px] opacity-75 font-normal">Débito o crédito</span>
              </button>

              <button
                type="button"
                id="pay-method-transfer"
                onClick={() => setPaymentMethod('bizum')}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                  paymentMethod === 'bizum'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1.5" />
                <span className="text-xs">Transferencia / QR</span>
                <span className="text-[10px] opacity-75 font-normal">Nequi / Daviplata</span>
              </button>
            </div>
          </div>

          {/* Cash Tendered & Change Calculator (Only for Cash) */}
          {paymentMethod === 'efectivo' && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  Efectivo entregado por el cliente:
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-bold text-slate-500">$</span>
                  <input
                    type="number"
                    step="50"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="w-32 px-2 py-1 text-right rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white"
                  />
                  <span className="text-xs font-bold text-slate-500">COP</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleQuickCash(total)}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold font-mono tabular-nums hover:bg-slate-100 cursor-pointer"
                >
                  Exacto (${new Intl.NumberFormat('es-CO').format(Math.round(total))})
                </button>
                {[20000, 50000, 100000]
                  .filter((val) => val >= total)
                  .map((billete) => (
                    <button
                      key={billete}
                      type="button"
                      onClick={() => handleQuickCash(billete)}
                      className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 text-xs font-semibold font-mono tabular-nums hover:bg-slate-100 cursor-pointer"
                    >
                      ${new Intl.NumberFormat('es-CO').format(billete)}
                    </button>
                  ))}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Cambio a devolver:
                </span>
                <span
                  className={`text-base font-extrabold font-mono tabular-nums ${
                    change >= 0 && isCashSufficient
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600'
                  }`}
                >
                  {isCashSufficient
                    ? `$ ${new Intl.NumberFormat('es-CO').format(Math.round(change))} COP`
                    : 'Efectivo insuficiente'}
                </span>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {checkoutError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{checkoutError}</span>
            </div>
          )}

          {/* Automatic Inventory Notice */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 p-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              Al confirmar, el ticket quedará registrado a cargo de{' '}
              <strong className="text-slate-700 dark:text-slate-200">{activeCashierName}</strong>, se
              descontará el stock y la mesa quedará Libre.
            </span>
          </div>

          {/* Actions */}
          <div className="pt-1 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              Volver a la Mesa
            </button>

            <button
              type="button"
              id="btn-confirm-checkout"
              disabled={!isCashSufficient || isProcessing}
              onClick={handleConfirm}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando cobro...</span>
                </>
              ) : (
                <>
                  <span>Cobrar y Liberar Mesa</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
