import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  Table,
  PaymentMethod,
  PaymentBreakdownEntry,
  PrivateQrBillingRecord,
  SaleReceipt,
  CustomerDocumentType,
  CustomerTaxRegime,
  ROLE_PERMISSIONS
} from '../../types';
import {
  calculateColombiaNitDV,
  COLOMBIAN_CITIES_DANE,
  DOCUMENT_TYPE_OPTIONS,
  extractKnownCustomersFromSales,
  extractTableBillingInfo,
  formatCustomerDocument,
  isValidEmailFormat,
  normalizeBillingInfo,
  searchKnownCustomers,
  TAX_REGIME_OPTIONS
} from '../../utils/billing';
import { resolveOrderItemTax } from '../../utils/taxes';
import {
  buildSubaccountCheckoutPlan,
  computeOrderSubaccountsSummary,
  UNASSIGNED_SUBACCOUNT_ID
} from '../../utils/subaccounts';
import { formatCOP } from '../../utils/currency';
import { auth } from '../../firebase';
import { getPrivateQrBillingForSession } from '../../services/firestoreUserStorage';
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
  Mail,
  AlertCircle,
  MapPin,
  Phone,
  Users,
  Layers,
  ShieldCheck
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  preselectedSubaccountIds?: string[];
  onSuccessCheckout: (receipt: SaleReceipt) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  table,
  preselectedSubaccountIds,
  onSuccessCheckout
}) => {
  const { config, products, sales, processSubaccountsCheckout } = useApp();
  const { user, empleadoActivo } = useAuth();
  const knownCustomers = useMemo(() => extractKnownCustomersFromSales(sales), [sales]);

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

  // Scope / Subaccounts selection
  const [checkoutScope, setCheckoutScope] = useState<'all' | 'selected'>('all');
  const [selectedSubIds, setSelectedSubIds] = useState<string[]>([]);
  const [includeUnassigned, setIncludeUnassigned] = useState<boolean>(false);

  // Payment methods (Simple + Mixto)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [useMixedPayment, setUseMixedPayment] = useState<boolean>(false);
  const [mixCashAmount, setMixCashAmount] = useState<string>('0');
  const [mixCardAmount, setMixCardAmount] = useState<string>('0');
  const [mixTransferAmount, setMixTransferAmount] = useState<string>('0');
  const [mixCashTendered, setMixCashTendered] = useState<string>('');

  // Voluntary Tip (Ley 1935 / 2018 - 0% impuesto)
  const [tipMode, setTipMode] = useState<'none' | '10' | '15' | 'custom'>('none');
  const [customTipInput, setCustomTipInput] = useState<string>('0');

  // Fiscal / Billing PII (isolated per subaccount / private QR dropbox)
  const [privateBillingRecords, setPrivateBillingRecords] = useState<PrivateQrBillingRecord[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerDocType, setCustomerDocType] = useState<CustomerDocumentType>('CONSUMIDOR_FINAL');
  const [customerDocNumber, setCustomerDocNumber] = useState<string>('');
  const [customerEmail, setCustomerEmail] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerCity, setCustomerCity] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [customerTaxRegime, setCustomerTaxRegime] = useState<CustomerTaxRegime>('no_responsable_iva');
  const [requiresElectronicInvoice, setRequiresElectronicInvoice] = useState<boolean>(false);
  const [showExtendedFiscalFields, setShowExtendedFiscalFields] = useState<boolean>(false);
  const [isFromCustomerQr, setIsFromCustomerQr] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const fallbackTaxRate = Number(table?.order?.taxPercent ?? config?.defaultTaxRate ?? 8) || 8;

  const orderOverview = useMemo(() => {
    if (!table?.order) return null;
    const enrichedItems = (table.order.items || (table.order as any)?.productos || []).map((item: any) => {
      const resolved = resolveOrderItemTax(item, products, fallbackTaxRate);
      return {
        ...item,
        taxType: resolved.taxType,
        taxRate: resolved.taxRate
      };
    });
    return computeOrderSubaccountsSummary(
      {
        ...table.order,
        items: enrichedItems,
        subaccounts: table.order.subaccounts || table.subaccounts || []
      },
      fallbackTaxRate
    );
  }, [table?.order, table?.subaccounts, products, fallbackTaxRate]);

  const unpaidSubaccounts = useMemo(
    () => (orderOverview?.subaccounts || []).filter((s) => s.pendingGross > 0),
    [orderOverview]
  );

  const hasSubaccountsOnTable = (orderOverview?.subaccounts?.length || 0) > 0;

  // Load private QR billing dropbox records for this table session (strictly POS-side)
  useEffect(() => {
    if (!isOpen || !table?.order) return;
    const activeUid = auth.currentUser?.uid || user?.id;
    const sessionId = table.order.tableSessionId || table.tableSessionId || table.order.id;
    let cancelled = false;

    if (activeUid && activeUid !== 'default' && sessionId) {
      getPrivateQrBillingForSession(activeUid, sessionId)
        .then((records) => {
          if (!cancelled) setPrivateBillingRecords(records);
        })
        .catch(() => {
          if (!cancelled) setPrivateBillingRecords([]);
        });
    } else {
      setPrivateBillingRecords([]);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, table?.id, table?.order?.id, table?.order?.tableSessionId, table?.tableSessionId, user?.id]);

  // Initialize scope, payment, tip & fiscal state when modal opens
  useEffect(() => {
    if (!isOpen || !table?.order) return;
    setCheckoutError(null);
    setUseMixedPayment(false);
    setMixCashAmount('0');
    setMixCardAmount('0');
    setMixTransferAmount('0');
    setMixCashTendered('');

    const validPreselected = (preselectedSubaccountIds || []).filter((id) =>
      unpaidSubaccounts.some((s) => s.subaccountId === id)
    );

    if (validPreselected.length > 0) {
      setCheckoutScope('selected');
      setSelectedSubIds(validPreselected);
      setIncludeUnassigned(false);
    } else {
      setCheckoutScope('all');
      setSelectedSubIds(unpaidSubaccounts.map((s) => s.subaccountId));
      setIncludeUnassigned((orderOverview?.unassignedPendingGross || 0) > 0);
    }

    const orderTip = Math.max(0, Math.round(Number(table.order.tipAmount || 0)));
    if (orderTip > 0 && validPreselected.length === 0) {
      setTipMode('custom');
      setCustomTipInput(String(orderTip));
    } else {
      setTipMode('none');
      setCustomTipInput('0');
    }

    const preferred = table.waiterCall?.preferredPaymentMethod;
    if (preferred === 'tarjeta') {
      setPaymentMethod('tarjeta');
    } else if (preferred === 'transferencia') {
      setPaymentMethod('bizum');
    } else {
      setPaymentMethod('efectivo');
    }
  }, [isOpen, table?.id, table?.order?.id, preselectedSubaccountIds]);

  // Determine which PrivateQrBillingRecord applies to the active checkout scope (no cross-guest PII leak)
  const matchedPrivateBilling = useMemo(() => {
    if (!table?.order) return undefined;
    if (checkoutScope === 'selected') {
      if (selectedSubIds.length === 1 && !includeUnassigned) {
        return privateBillingRecords.find((r) => r.subaccountId === selectedSubIds[0]);
      }
      if (selectedSubIds.length === 0 && includeUnassigned) {
        return privateBillingRecords.find((r) => r.subaccountId === 'mesa_general');
      }
      return undefined;
    }

    // checkoutScope === 'all'
    if (unpaidSubaccounts.length === 0) {
      return privateBillingRecords.find((r) => r.subaccountId === 'mesa_general');
    }
    if (unpaidSubaccounts.length === 1 && (orderOverview?.unassignedPendingGross || 0) === 0) {
      return privateBillingRecords.find((r) => r.subaccountId === unpaidSubaccounts[0].subaccountId);
    }
    return privateBillingRecords.find((r) => r.subaccountId === 'mesa_general');
  }, [
    table?.order,
    checkoutScope,
    selectedSubIds,
    includeUnassigned,
    privateBillingRecords,
    unpaidSubaccounts,
    orderOverview?.unassignedPendingGross
  ]);

  // Hydrate fiscal fields and requested tip/method cleanly per selected scope
  useEffect(() => {
    if (!isOpen || !table?.order) return;

    if (matchedPrivateBilling) {
      const b = matchedPrivateBilling.billingInfo;
      const wantsFe = Boolean(matchedPrivateBilling.requiresElectronicInvoice || b.requiresElectronicInvoice || b.email);
      setCustomerName(b.customerName && b.customerName !== 'Consumidor Final' ? b.customerName : '');
      setCustomerDocType(b.documentType || 'CONSUMIDOR_FINAL');
      setCustomerDocNumber(b.documentNumber || '');
      setCustomerEmail(b.email || '');
      setCustomerPhone(b.phone || '');
      setCustomerCity(b.city || '');
      setCustomerAddress(b.address || '');
      setCustomerTaxRegime(
        b.taxRegime || (b.documentType === 'NIT' ? 'responsable_iva' : 'no_responsable_iva')
      );
      setRequiresElectronicInvoice(wantsFe);
      setShowExtendedFiscalFields(Boolean(wantsFe || b.phone || b.address || b.city));
      setIsFromCustomerQr(true);

      if (matchedPrivateBilling.preferredPaymentMethod === 'tarjeta') setPaymentMethod('tarjeta');
      else if (matchedPrivateBilling.preferredPaymentMethod === 'transferencia') setPaymentMethod('bizum');
      else if (matchedPrivateBilling.preferredPaymentMethod === 'efectivo') setPaymentMethod('efectivo');

      if ((matchedPrivateBilling.requestedTipAmount || 0) > 0) {
        setTipMode('custom');
        setCustomTipInput(String(Math.round(matchedPrivateBilling.requestedTipAmount || 0)));
      }
      return;
    }

    // Legacy fallback only when there are NO subaccounts on the table
    if (!hasSubaccountsOnTable) {
      const { billing, fromQrCustomer } = extractTableBillingInfo(table);
      const wantsFe = Boolean(billing.requiresElectronicInvoice || billing.email);
      setCustomerName(
        billing.customerName && billing.customerName !== 'Consumidor Final' ? billing.customerName : ''
      );
      setCustomerDocType(billing.documentType || 'CONSUMIDOR_FINAL');
      setCustomerDocNumber(billing.documentNumber || '');
      setCustomerEmail(billing.email || '');
      setCustomerPhone(billing.phone || '');
      setCustomerCity(billing.city || '');
      setCustomerAddress(billing.address || '');
      setCustomerTaxRegime(
        billing.taxRegime || (billing.documentType === 'NIT' ? 'responsable_iva' : 'no_responsable_iva')
      );
      setRequiresElectronicInvoice(wantsFe);
      setShowExtendedFiscalFields(Boolean(wantsFe || billing.phone || billing.address || billing.city));
      setIsFromCustomerQr(fromQrCustomer);
      return;
    }

    // Subaccounts present, but the chosen scope has no private QR FE record -> clean Consumidor Final
    const selectedSingleSub =
      checkoutScope === 'selected' && selectedSubIds.length === 1 && !includeUnassigned
        ? unpaidSubaccounts.find((s) => s.subaccountId === selectedSubIds[0])
        : undefined;

    setCustomerName(selectedSingleSub ? selectedSingleSub.displayName : '');
    setCustomerDocType('CONSUMIDOR_FINAL');
    setCustomerDocNumber('');
    setCustomerEmail('');
    setCustomerPhone('');
    setCustomerCity('');
    setCustomerAddress('');
    setCustomerTaxRegime('no_responsable_iva');
    setRequiresElectronicInvoice(Boolean(selectedSingleSub?.requiresElectronicInvoice));
    setShowExtendedFiscalFields(Boolean(selectedSingleSub?.requiresElectronicInvoice));
    setIsFromCustomerQr(false);

    if ((selectedSingleSub?.requestedTipAmount || 0) > 0) {
      setTipMode('custom');
      setCustomTipInput(String(Math.round(selectedSingleSub?.requestedTipAmount || 0)));
    }
  }, [isOpen, matchedPrivateBilling, hasSubaccountsOnTable, checkoutScope, selectedSubIds, includeUnassigned]);

  const enrichedItems = useMemo(() => {
    const rawItems = table?.order?.items || (table?.order as any)?.productos || [];
    return (rawItems || []).map((item: any) => {
      const resolvedTax = resolveOrderItemTax(item, products, fallbackTaxRate);
      return {
        ...item,
        taxType: resolvedTax.taxType,
        taxRate: resolvedTax.taxRate
      };
    });
  }, [table?.order, products, fallbackTaxRate]);

  // First compute consumption plan (without tip yet) so percentage voluntary tips calculate cleanly on consumption
  const consumptionPreviewPlan = useMemo(() => {
    if (!table?.order || enrichedItems.length === 0) return null;
    try {
      const enrichedOrder = {
        ...table.order,
        items: enrichedItems,
        subaccounts: table.order.subaccounts || table.subaccounts || [],
        tableSessionId: table.order.tableSessionId || table.tableSessionId || table.order.id
      };
      return buildSubaccountCheckoutPlan({
        order: enrichedOrder,
        targetSubaccountIds: checkoutScope === 'selected' ? selectedSubIds : undefined,
        includeUnassigned: checkoutScope === 'selected' ? includeUnassigned : false,
        tipAmount: 0,
        defaultTaxRate: fallbackTaxRate
      });
    } catch {
      return null;
    }
  }, [
    table?.order,
    table?.subaccounts,
    table?.tableSessionId,
    enrichedItems,
    checkoutScope,
    selectedSubIds,
    includeUnassigned,
    fallbackTaxRate
  ]);

  const productsTotalToCharge = consumptionPreviewPlan ? consumptionPreviewPlan.total : 0;

  const resolvedTipAmount = useMemo(() => {
    if (tipMode === 'none') return 0;
    if (tipMode === '10') return Math.round(productsTotalToCharge * 0.1);
    if (tipMode === '15') return Math.round(productsTotalToCharge * 0.15);
    return Math.max(0, Math.round(Number(customTipInput) || 0));
  }, [tipMode, productsTotalToCharge, customTipInput]);

  const total = Math.round(productsTotalToCharge + resolvedTipAmount);

  // Sync suggested cash tendered when total or payment mode changes
  useEffect(() => {
    if (!isOpen) return;
    if (!useMixedPayment) {
      setCashTendered(total > 0 ? String(total) : '0');
    } else {
      const cashVal = Math.max(0, Math.round(Number(mixCashAmount) || 0));
      setMixCashTendered(cashVal > 0 ? String(cashVal) : '');
    }
  }, [total, isOpen, useMixedPayment]);

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

  const subtotal = consumptionPreviewPlan?.subtotal || 0;
  const discountAmount = consumptionPreviewPlan?.discountAmount || 0;
  const discountPercent = consumptionPreviewPlan?.discountPercent || 0;
  const ivaAmount = consumptionPreviewPlan?.ivaAmount || 0;
  const incAmount = consumptionPreviewPlan?.impoconsumoAmount || 0;
  const remainingAfterThisCheckout = consumptionPreviewPlan?.remainingPendingBalance ?? 0;
  const willReleaseTable = consumptionPreviewPlan ? consumptionPreviewPlan.shouldReleaseTable : true;

  // Payment validations
  const cashNumber = parseFloat(cashTendered) || 0;
  const simpleChange = Math.max(0, cashNumber - total);
  const mixCash = Math.max(0, Math.round(Number(mixCashAmount) || 0));
  const mixCard = Math.max(0, Math.round(Number(mixCardAmount) || 0));
  const mixTransfer = Math.max(0, Math.round(Number(mixTransferAmount) || 0));
  const mixSum = mixCash + mixCard + mixTransfer;
  const mixDiff = total - mixSum;
  const mixCashTenderNum = Math.max(0, Math.round(Number(mixCashTendered) || mixCash));
  const mixCashChange = Math.max(0, mixCashTenderNum - mixCash);

  const isPaymentValid =
    total > 0 &&
    Boolean(consumptionPreviewPlan) &&
    (useMixedPayment
      ? mixDiff === 0 && (mixCash === 0 || mixCashTenderNum >= mixCash)
      : paymentMethod !== 'efectivo' || cashNumber >= total);

  const suggestedNitDv =
    customerDocType === 'NIT' ? calculateColombiaNitDV(customerDocNumber) : '';

  const handleQuickCash = (amount: number) => {
    setCashTendered(Math.round(amount).toString());
  };

  const toggleSubaccountSelection = (subId: string) => {
    setCheckoutScope('selected');
    setSelectedSubIds((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  };

  const cobrarMesa = async () => {
    setCheckoutError(null);

    if (!table?.id || !order?.id) {
      setCheckoutError('No se encontró la mesa o la comanda activa para procesar el cobro.');
      return;
    }

    if (!consumptionPreviewPlan) {
      setCheckoutError('Selecciona al menos una subcuenta o consumo pendiente para cobrar.');
      return;
    }

    const activeUid = auth.currentUser?.uid || user?.id;
    if (!activeUid) {
      setCheckoutError('No hay una sesión autenticada activa para registrar la venta.');
      return;
    }

    if (useMixedPayment) {
      if (mixDiff !== 0) {
        setCheckoutError(
          `En pago mixto la suma (${formatCOP(mixSum)}) debe coincidir exactamente con el total (${formatCOP(total)}).`
        );
        return;
      }
      if (mixCash > 0 && mixCashTenderNum < mixCash) {
        setCheckoutError('El efectivo entregado para la parte en efectivo del pago mixto es insuficiente.');
        return;
      }
    } else if (paymentMethod === 'efectivo' && cashNumber < total) {
      setCheckoutError('El efectivo entregado es menor al total a cobrar.');
      return;
    }

    const cleanEmail = customerEmail.trim().toLowerCase();
    const wantsElectronic = Boolean(requiresElectronicInvoice || cleanEmail);

    if (wantsElectronic && !cleanEmail) {
      setCheckoutError(
        'Ingresa el correo electrónico del cliente para poder enviarle su Facturación Electrónica.'
      );
      return;
    }

    if (cleanEmail && !isValidEmailFormat(cleanEmail)) {
      setCheckoutError('Ingresa un correo electrónico válido (ejemplo: cliente@correo.com).');
      return;
    }

    setIsProcessing(true);

    const resolvedBilling = normalizeBillingInfo({
      customerName: customerName.trim(),
      documentType: customerDocType,
      documentNumber: customerDocNumber.trim(),
      email: cleanEmail,
      phone: customerPhone.trim(),
      city: customerCity.trim(),
      address: customerAddress.trim(),
      taxRegime: customerTaxRegime,
      requiresElectronicInvoice: wantsElectronic
    });

    const paymentBreakdown: PaymentBreakdownEntry[] | undefined = useMixedPayment
      ? ([
          mixCash > 0
            ? {
                method: 'efectivo' as PaymentMethod,
                amount: mixCash,
                cashTendered: mixCashTenderNum,
                change: mixCashChange
              }
            : null,
          mixCard > 0 ? { method: 'tarjeta' as PaymentMethod, amount: mixCard } : null,
          mixTransfer > 0 ? { method: 'bizum' as PaymentMethod, amount: mixTransfer } : null
        ].filter(Boolean) as PaymentBreakdownEntry[])
      : undefined;

    try {
      const res = await processSubaccountsCheckout({
        tableId: table.id,
        targetSubaccountIds: checkoutScope === 'selected' ? selectedSubIds : undefined,
        includeUnassigned: checkoutScope === 'selected' ? includeUnassigned : false,
        tipAmount: resolvedTipAmount,
        paymentMethod: useMixedPayment ? undefined : paymentMethod,
        paymentBreakdown,
        cashTendered: !useMixedPayment && paymentMethod === 'efectivo' ? Math.round(cashNumber) : undefined,
        billingInfo: resolvedBilling,
        privateQrBillingId: matchedPrivateBilling?.id,
        cashierName: activeCashierName,
        cashierRole: activeCashierRole,
        cashierId: activeCashierId
      });

      setIsProcessing(false);
      if (res.success && res.receipt) {
        onSuccessCheckout(res.receipt);
        onClose();
      } else {
        setCheckoutError('No fue posible completar el cobro en este momento.');
      }
    } catch (error) {
      console.error('Error al procesar cobro transaccional de subcuenta/mesa:', error);
      setCheckoutError(
        'Error al registrar el cobro en la nube: ' +
          (error instanceof Error ? error.message : String(error))
      );
      setIsProcessing(false);
    }
  };

  const previewItems = consumptionPreviewPlan?.receiptItems || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in">
      <div
        className="relative w-full max-w-xl max-h-[95vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
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
                {willReleaseTable ? `Cobrar y Cerrar ${table.name}` : `Cobro Parcial · ${table.name}`}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {table.zone || 'Mesa'} · {previewItems.length} líneas a cobrar · Cobrado por{' '}
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

          {/* Subaccount Scope Selector (visible whenever the table has subaccounts) */}
          {hasSubaccountsOnTable && (
            <div className="p-3.5 rounded-xl border border-indigo-200 dark:border-indigo-900/70 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>¿Qué subcuenta(s) vas a cobrar en este pago?</span>
                </span>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutScope('all');
                      setSelectedSubIds(unpaidSubaccounts.map((s) => s.subaccountId));
                      setIncludeUnassigned((orderOverview?.unassignedPendingGross || 0) > 0);
                    }}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      checkoutScope === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Toda la mesa pendiente
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutScope('selected')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      checkoutScope === 'selected'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Por subcuenta
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {unpaidSubaccounts.map((sub) => {
                  const isChecked =
                    checkoutScope === 'all' || selectedSubIds.includes(sub.subaccountId);
                  return (
                    <button
                      key={sub.subaccountId}
                      type="button"
                      onClick={() => toggleSubaccountSelection(sub.subaccountId)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                        isChecked
                          ? 'border-indigo-500 bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          sub.status === 'pidiendo_cuenta'
                            ? 'bg-amber-500'
                            : isChecked
                            ? 'bg-indigo-600'
                            : 'bg-slate-400'
                        }`}
                      />
                      <span>{sub.displayName}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatCOP(sub.pendingNetWithTax)}
                      </span>
                      {sub.requiresElectronicInvoice && (
                        <span className="px-1 py-0.2 rounded bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-[9px] font-bold">
                          FE
                        </span>
                      )}
                    </button>
                  );
                })}

                {(orderOverview?.unassignedPendingGross || 0) > 0 && (
                  <button
                    key={UNASSIGNED_SUBACCOUNT_ID}
                    type="button"
                    onClick={() => {
                      setCheckoutScope('selected');
                      setIncludeUnassigned((prev) => !prev);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                      checkoutScope === 'all' || includeUnassigned
                        ? 'border-indigo-500 bg-white dark:bg-slate-900 text-indigo-900 dark:text-indigo-200 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span>Cuenta General</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatCOP(orderOverview?.unassignedPendingGross || 0)}
                    </span>
                  </button>
                )}
              </div>

              {!willReleaseTable && remainingAfterThisCheckout > 0 && (
                <div className="px-3 py-1.5 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-[11px] font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                  <span>Cobro parcial: la mesa permanecerá abierta hasta saldar el resto.</span>
                  <span className="font-mono font-bold shrink-0">
                    Pendiente después: {formatCOP(remainingAfterThisCheckout)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Total Highlight Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {willReleaseTable ? 'Total a Cobrar (Saldo Final)' : 'Total Cobro Parcial'}
              </span>
              <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums mt-0.5">
                $ {new Intl.NumberFormat('es-CO').format(Math.round(total))} COP
              </p>
              {matchedPrivateBilling && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold mt-1">
                  <ShieldCheck className="w-3 h-3" />
                  Datos fiscales cargados desde buzón privado QR ({matchedPrivateBilling.subaccountName})
                </span>
              )}
            </div>
            <div className="text-right text-xs text-slate-300 space-y-0.5 font-mono tabular-nums">
              <p>Base: $ {new Intl.NumberFormat('es-CO').format(Math.round(subtotal))}</p>
              {ivaAmount > 0 && (
                <p>IVA: $ {new Intl.NumberFormat('es-CO').format(Math.round(ivaAmount))}</p>
              )}
              {incAmount > 0 && (
                <p>INC: $ {new Intl.NumberFormat('es-CO').format(Math.round(incAmount))}</p>
              )}
              {ivaAmount === 0 && incAmount === 0 && <p>Exento (0%): $ 0</p>}
              {discountAmount > 0 && (
                <p className="text-rose-400 font-medium">
                  Desc. ({discountPercent}%): -$ {new Intl.NumberFormat('es-CO').format(Math.round(discountAmount))}
                </p>
              )}
              {resolvedTipAmount > 0 && (
                <p className="text-emerald-400 font-medium">
                  Propina Vol. (0% imp.): +$ {new Intl.NumberFormat('es-CO').format(Math.round(resolvedTipAmount))}
                </p>
              )}
            </div>
          </div>

          {/* Propina Voluntaria (Ley 1935 de 2018 - Colombia) */}
          <div className="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Propina Voluntaria (Ley 1935/2018 · 0% IVA/INC)
              </span>
              <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {formatCOP(resolvedTipAmount)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'none', label: 'Sin propina ($0)' },
                { id: '10', label: `10% (${formatCOP(Math.round(productsTotalToCharge * 0.1))})` },
                { id: '15', label: `15% (${formatCOP(Math.round(productsTotalToCharge * 0.15))})` },
                { id: 'custom', label: 'Otro monto' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTipMode(opt.id as 'none' | '10' | '15' | 'custom')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                    tipMode === opt.id
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {tipMode === 'custom' && (
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-xs font-bold text-slate-500">$</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={customTipInput}
                    onChange={(e) => setCustomTipInput(e.target.value)}
                    placeholder="0"
                    className="w-28 px-2 py-1 text-right rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Datos del Cliente / Facturación Electrónica lista para Contadora / Siigo */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                <span>Datos del cliente y Facturación Electrónica</span>
              </span>

              <div className="flex items-center gap-2">
                {isFromCustomerQr && (
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                    Recibido por QR
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const next = !requiresElectronicInvoice;
                    setRequiresElectronicInvoice(next);
                    if (next) {
                      setShowExtendedFiscalFields(true);
                      if (customerDocType === 'CONSUMIDOR_FINAL') {
                        setCustomerDocType('CC');
                      }
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                    requiresElectronicInvoice
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Mail className="w-3 h-3 shrink-0" />
                  <span>{requiresElectronicInvoice ? 'Factura Electrónica: Sí' : 'Requiere Factura Electrónica'}</span>
                </button>
              </div>
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
                    } else if (nextType === 'NIT') {
                      setCustomerTaxRegime('responsable_iva');
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
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    {customerDocType === 'NIT' ? 'NIT (auto-calcula DV)' : 'Número de NIT o Cédula'}
                  </label>
                  {customerDocType === 'NIT' && suggestedNitDv && (
                    <span className="text-[10px] font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      DV DIAN: {suggestedNitDv}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={customerDocNumber}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerDocNumber(val);
                    if (val.trim() && customerDocType === 'CONSUMIDOR_FINAL') {
                      const inferred = val.includes('-') ? 'NIT' : 'CC';
                      setCustomerDocType(inferred);
                      if (inferred === 'NIT') setCustomerTaxRegime('responsable_iva');
                    }
                  }}
                  placeholder={
                    DOCUMENT_TYPE_OPTIONS.find((opt) => opt.value === customerDocType)?.placeholder ||
                    'Buscar o digitar NIT / Cédula'
                  }
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
            </div>

            {customerDocNumber.trim().length >= 4 &&
              (() => {
                const matches = searchKnownCustomers(knownCustomers, customerDocNumber, 3).filter(
                  (prof) =>
                    !(
                      prof.documentNumber === customerDocNumber.trim() &&
                      prof.customerName.toLowerCase() === customerName.trim().toLowerCase() &&
                      (!prof.email || prof.email.toLowerCase() === customerEmail.trim().toLowerCase())
                    )
                );
                if (matches.length === 0) return null;
                return (
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Clientes encontrados en historial (toca para cargar todos sus datos fiscales):
                    </span>
                    <div className="flex flex-col gap-1">
                      {matches.map((prof) => (
                        <button
                          key={prof.key}
                          type="button"
                          onClick={() => {
                            const loadedType =
                              prof.documentType === 'CONSUMIDOR_FINAL' ? 'CC' : prof.documentType;
                            setCustomerDocType(loadedType);
                            setCustomerDocNumber(prof.documentNumber);
                            setCustomerName(prof.customerName);
                            if (prof.email) {
                              setCustomerEmail(prof.email);
                              setRequiresElectronicInvoice(true);
                            }
                            if (prof.phone) setCustomerPhone(prof.phone);
                            if (prof.city) setCustomerCity(prof.city);
                            if (prof.address) setCustomerAddress(prof.address);
                            if (prof.taxRegime) setCustomerTaxRegime(prof.taxRegime);
                            if (prof.phone || prof.city || prof.address) {
                              setShowExtendedFiscalFields(true);
                            }
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 text-left text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 transition cursor-pointer"
                        >
                          <span className="truncate">
                            <strong className="font-mono tabular-nums">
                              {formatCustomerDocument(prof.documentType, prof.documentNumber, prof.dv)}
                            </strong>{' '}
                            · {prof.customerName}
                            {prof.email ? ` · ${prof.email}` : ''}
                            {prof.city ? ` · ${prof.city}` : ''}
                          </span>
                          <span className="font-bold shrink-0">Cargar</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Nombre completo o Razón Social{requiresElectronicInvoice ? ' *' : ''}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Consumidor Final (o escribe nombre completo / razón social)"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3 text-orange-500 shrink-0" />
                  <span>
                    Correo electrónico para envío de Factura Electrónica
                    {requiresElectronicInvoice ? ' *' : ''}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowExtendedFiscalFields((prev) => !prev)}
                  className="text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline cursor-pointer whitespace-nowrap"
                >
                  {showExtendedFiscalFields
                    ? 'Ocultar datos contables'
                    : '+ Teléfono / Dirección / Ciudad'}
                </button>
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerEmail(val);
                  if (val.trim()) {
                    setRequiresElectronicInvoice(true);
                    setShowExtendedFiscalFields(true);
                  }
                  if (checkoutError) setCheckoutError(null);
                }}
                placeholder="cliente@correo.com (para enviarle la Factura Electrónica)"
                className={`w-full px-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40 ${
                  requiresElectronicInvoice && !customerEmail.trim()
                    ? 'border-orange-400 dark:border-orange-500'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              />
            </div>

            {(showExtendedFiscalFields || requiresElectronicInvoice) && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Teléfono / Celular</span>
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej. 3001234567"
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Ciudad / Municipio (DANE)</span>
                  </label>
                  <input
                    type="text"
                    list="checkout-colombia-cities"
                    value={customerCity}
                    onChange={(e) => setCustomerCity(e.target.value)}
                    placeholder="Ej. Bogotá D.C., Medellín..."
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                  />
                  <datalist id="checkout-colombia-cities">
                    {COLOMBIAN_CITIES_DANE.map((c) => (
                      <option key={c.cityCode} value={c.city}>
                        {c.department} ({c.cityCode})
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Dirección fiscal (Para Siigo / DIAN)
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Ej. Calle 93 # 12-40"
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Régimen tributario cliente
                  </label>
                  <select
                    value={customerTaxRegime}
                    onChange={(e) => setCustomerTaxRegime(e.target.value as CustomerTaxRegime)}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-orange-500/40"
                  >
                    {TAX_REGIME_OPTIONS.map((reg) => (
                      <option key={reg.value} value={reg.value}>
                        {reg.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Tabla Resumen de Productos de este Cobro */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
            <div className="px-4 py-2 bg-slate-100/70 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>Detalle de Consumo a Cobrar ({previewItems.length} líneas)</span>
              <span>Importe</span>
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 px-4 text-xs">
              {previewItems.length === 0 ? (
                <div className="py-4 text-center text-slate-400">
                  Selecciona al menos una subcuenta con saldo pendiente.
                </div>
              ) : (
                previewItems.map((item: any, idx: number) => {
                  const name = item?.productName || item?.name || item?.producto || 'Producto';
                  const qty = Number(item?.quantity ?? item?.cantidad ?? 1) || 1;
                  const price = Number(item?.unitPrice ?? item?.price ?? 0) || 0;
                  const itemTotal = Math.round(price * qty);
                  const itemTaxInfo = resolveOrderItemTax(item, products, fallbackTaxRate);
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
                        {item.subaccountName && (
                          <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold shrink-0">
                            {item.subaccountName}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 shrink-0">
                          · {itemTaxInfo.shortLabel}
                        </span>
                      </div>
                      <span className="font-semibold font-mono tabular-nums shrink-0">
                        $ {new Intl.NumberFormat('es-CO').format(itemTotal)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Payment Method Selector + Pago Mixto */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Método de Pago
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !useMixedPayment;
                  setUseMixedPayment(next);
                  if (next) {
                    setMixCashAmount(String(total));
                    setMixCardAmount('0');
                    setMixTransferAmount('0');
                    setMixCashTendered(String(total));
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  useMixedPayment
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>{useMixedPayment ? 'Modo Pago Mixto Activo' : 'Dividir en Pago Mixto'}</span>
              </button>
            </div>

            {!useMixedPayment ? (
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
            ) : (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Efectivo (COP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={mixCashAmount}
                      onChange={(e) => {
                        setMixCashAmount(e.target.value);
                        setMixCashTendered(e.target.value);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-right text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Tarjeta / Datáfono (COP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={mixCardAmount}
                      onChange={(e) => setMixCardAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-right text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      Transferencia / QR (COP)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={mixTransferAmount}
                      onChange={(e) => setMixTransferAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-right text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {mixCash > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Efectivo recibido para parte en efectivo:
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="500"
                        value={mixCashTendered}
                        onChange={(e) => setMixCashTendered(e.target.value)}
                        className="w-28 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono font-bold text-right text-slate-900 dark:text-white"
                      />
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        Cambio: {formatCOP(mixCashChange)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-[11px]">
                  <span className="text-slate-500">Suma registrada: {formatCOP(mixSum)}</span>
                  <span
                    className={`font-mono font-bold ${
                      mixDiff === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {mixDiff === 0
                      ? 'Cuadre exacto (100%)'
                      : mixDiff > 0
                      ? `Faltan ${formatCOP(mixDiff)}`
                      : `Excede por ${formatCOP(Math.abs(mixDiff))}`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Cash Tendered & Change Calculator (Simple cash mode) */}
          {!useMixedPayment && paymentMethod === 'efectivo' && (
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
                    simpleChange >= 0 && cashNumber >= total
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600'
                  }`}
                >
                  {cashNumber >= total
                    ? `$ ${new Intl.NumberFormat('es-CO').format(Math.round(simpleChange))} COP`
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

          {/* Automatic Inventory & Accounting Notice */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/40 p-2.5 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>
              {willReleaseTable
                ? `Al confirmar, se emitirá el comprobante final, el inventario quedará cuadrado sin duplicaciones y ${activeCashierName} figurará como responsable.`
                : `Al confirmar este cobro parcial, se generará un comprobante independiente y la mesa seguirá abierta con saldo pendiente de ${formatCOP(remainingAfterThisCheckout)}.`}
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
              disabled={!isPaymentValid || isProcessing}
              onClick={cobrarMesa}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Procesando cobro...</span>
                </>
              ) : (
                <>
                  <span>
                    {willReleaseTable ? 'Cobrar y Liberar Mesa' : 'Registrar Cobro Parcial'}
                  </span>
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
