/**
 * ePayco Standard Checkout Integration Service (Frontend)
 * Maneja la carga dinámica del script oficial de ePayco (checkout.js),
 * la configuración y apertura del modal OnPage/Standard y la validación de transacciones
 * contra la API oficial de ePayco y el webhook de confirmación del backend.
 */

export interface EpaycoValidationData {
  x_cust_id_cliente?: string;
  x_ref_payco: string;
  x_id_invoice: string;
  x_description: string;
  x_amount: number | string;
  x_tax: number | string;
  x_tax_ico?: number | string;
  x_tax_base: number | string;
  x_currency_code: string;
  x_bank_name?: string;
  x_cardnumber?: string;
  x_cod_response: number; // 1 = Aceptada, 2 = Rechazada, 3 = Pendiente, 4 = Fallida
  x_response: string; // 'Aceptada' | 'Rechazada' | 'Pendiente' | 'Fallida'
  x_response_reason_text?: string;
  x_transaction_id?: string;
  x_transaction_date?: string;
  x_approval_code?: string;
  x_extra1?: string;
  x_extra2?: string;
  x_extra3?: string;
}

export interface EpaycoValidationResponse {
  success: boolean;
  title?: string;
  text_response?: string;
  data?: EpaycoValidationData;
}

export interface EpaycoCheckoutParams {
  /** Nombre del comercio / restaurante */
  restaurantName: string;
  /** Descripción del cobro */
  description: string;
  /** ID de la comanda como referencia única */
  invoice: string;
  /** Monto total a cobrar en COP (entero) */
  amount: number;
  /** Base gravable antes de impoconsumo/IVA */
  taxBase?: number;
  /** Valor de IVA (0 si aplica impoconsumo) */
  tax?: number;
  /** Valor de Impoconsumo (8%) extraído del total */
  taxIco?: number;
  /** Datos adicionales para trazabilidad en el callback */
  extra1?: string;
  extra2?: string;
  extra3?: string;
  /** Nombre opcional del cliente/pagador */
  nameBilling?: string;
  emailBilling?: string;
}

export interface EpaycoCheckoutCallbacks {
  onApproved: (validation: EpaycoValidationData) => void | Promise<void>;
  onRejected?: (validation: EpaycoValidationData) => void;
  onPending?: (validation: EpaycoValidationData) => void;
  onModalClosed?: () => void;
  onError?: (errorMsg: string) => void;
}

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure: (config: { key: string; test: boolean }) => {
          open: (data: Record<string, string>) => void;
          onCloseModal?: () => void;
          onCreated?: (cb: (data: unknown) => void) => void;
          onResponse?: (cb: (response: unknown) => void) => void;
          onErrors?: (cb: (err: unknown) => void) => void;
        };
      };
    };
  }
}

let customRuntimePublicKey: string | null = null;

export function setRuntimeEpaycoPublicKey(key: string): void {
  customRuntimePublicKey = key.trim();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      sessionStorage.setItem('epayco_public_key', key.trim());
    } catch {}
  }
}

export function getBackendBaseUrl(): string {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export function getEpaycoPublicKey(): string {
  const envKey = (import.meta.env.VITE_EPAYCO_PUBLIC_KEY || '').trim();
  if (envKey && envKey !== 'TU_PUBLIC_KEY_DE_EPAYCO') return envKey;
  if (customRuntimePublicKey) return customRuntimePublicKey;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const stored = sessionStorage.getItem('epayco_public_key');
      if (stored) return stored.trim();
    } catch {}
  }
  return '';
}

export function getEpaycoTestMode(): boolean {
  const raw = (
    import.meta.env.VITE_EPAYCO_TEST_MODE ??
    import.meta.env.VITE_TEST_MODE ??
    'true'
  )
    .toString()
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1';
}

export interface SubscriptionVerificationResult {
  verified: boolean;
  status: 'approved' | 'pending' | 'rejected' | 'invalid_amount' | 'error';
  message?: string;
  error?: string;
  alreadyProcessed?: boolean;
  planId?: string;
  billedAmount?: number;
  refPayco?: string;
}

export async function verifySubscriptionWithBackend(params: {
  refPayco: string;
  planId: string;
  userEmail?: string;
  userId?: string;
}): Promise<SubscriptionVerificationResult> {
  const baseUrl = getBackendBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/epayco/verify-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });

    if (res.ok) {
      const data = await res.json();
      return data as SubscriptionVerificationResult;
    }
  } catch (err) {
    console.error('Error llamando a verify-subscription en backend:', err);
  }

  // Fallback a validación directa si el backend de verificación fallara
  const txData = await validateEpaycoReference(params.refPayco);
  if (txData) {
    const cod = Number(txData.x_cod_response);
    if (cod === 1) {
      return {
        verified: true,
        status: 'approved',
        planId: params.planId,
        billedAmount: Number(txData.x_amount),
        refPayco: txData.x_ref_payco
      };
    }
    if (cod === 3) {
      return {
        verified: false,
        status: 'pending',
        message: 'La transacción (PSE) se encuentra en proceso de verificación bancaria.'
      };
    }
  }

  return {
    verified: false,
    status: 'rejected',
    message: 'No se pudo verificar la transacción con ePayco.'
  };
}

/**
 * Carga dinámicamente el script oficial del Checkout Estándar de ePayco
 */
export function loadEpaycoCheckoutScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.ePayco?.checkout) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="checkout.epayco.co/checkout.js"]'
    );

    if (existingScript) {
      const checkReady = setInterval(() => {
        if (window.ePayco?.checkout) {
          clearInterval(checkReady);
          resolve(true);
        }
      }, 150);

      setTimeout(() => {
        clearInterval(checkReady);
        resolve(Boolean(window.ePayco?.checkout));
      }, 6000);
      return;
    }

    const script = document.createElement('script');
    script.id = 'epayco-checkout-script';
    script.type = 'text/javascript';
    script.src = 'https://checkout.epayco.co/checkout.js';
    script.async = true;
    script.onload = () => resolve(Boolean(window.ePayco?.checkout));
    script.onerror = () => {
      console.error('No se pudo cargar https://checkout.epayco.co/checkout.js');
      resolve(false);
    };
    document.head.appendChild(script);
  });
}

/**
 * Valida una referencia ref_payco contra el servicio oficial de validación de ePayco
 */
export async function validateEpaycoReference(
  refPayco: string
): Promise<EpaycoValidationData | null> {
  const cleanRef = refPayco.trim();
  if (!cleanRef) return null;

  try {
    const res = await fetch(
      `https://secure.epayco.co/validation/v1/reference/${encodeURIComponent(cleanRef)}`
    );
    if (res.ok) {
      const json: EpaycoValidationResponse = await res.json();
      if (json?.success && json?.data) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('Validación directa ePayco falló, intentando vía proxy backend:', err);
  }

  try {
    const baseUrl = getBackendBaseUrl();
    const proxyRes = await fetch(
      `${baseUrl}/api/epayco/validate/${encodeURIComponent(cleanRef)}`
    );
    if (proxyRes.ok) {
      const json: EpaycoValidationResponse = await proxyRes.json();
      if (json?.success && json?.data) {
        return json.data;
      }
    }
  } catch (proxyErr) {
    console.error('Error validando referencia ePayco en backend:', proxyErr);
  }

  return null;
}

/**
 * Consulta si el webhook de confirmación (/api/epayco/confirmation) ya registró estado para esta factura
 */
export async function checkBackendOrderPaymentStatus(
  invoiceId: string
): Promise<EpaycoValidationData | null> {
  try {
    const baseUrl = getBackendBaseUrl();
    const res = await fetch(
      `${baseUrl}/api/epayco/status/${encodeURIComponent(invoiceId)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.found && json?.transaction) {
      return json.transaction as EpaycoValidationData;
    }
  } catch {
    // silencioso si el webhook aún no ha llegado
  }
  return null;
}

/**
 * Evalúa el estado retornado por ePayco y dispara el callback correspondiente.
 * Retorna true si ya obtuvo un estado definitivo (aprobado, rechazado o pendiente).
 */
export async function dispatchEpaycoResult(
  txData: EpaycoValidationData,
  callbacks: EpaycoCheckoutCallbacks
): Promise<boolean> {
  const cod = Number(txData.x_cod_response);
  const responseText = (txData.x_response || '').toLowerCase();

  if (cod === 1 || responseText === 'aceptada' || responseText === 'aprobada') {
    await callbacks.onApproved(txData);
    return true;
  }

  if (cod === 2 || cod === 4 || responseText === 'rechazada' || responseText === 'fallida') {
    callbacks.onRejected?.(txData);
    return true;
  }

  if (cod === 3 || responseText === 'pendiente') {
    callbacks.onPending?.(txData);
    return true;
  }

  return false;
}

/**
 * Abre el Checkout Estándar de ePayco (OnPage Modal) con validación automática de respuesta
 */
export async function openEpaycoCheckout(
  params: EpaycoCheckoutParams,
  callbacks: EpaycoCheckoutCallbacks
): Promise<void> {
  const publicKey = getEpaycoPublicKey();
  if (!publicKey || publicKey === 'TU_PUBLIC_KEY_DE_EPAYCO') {
    callbacks.onError?.(
      'Falta configurar VITE_EPAYCO_PUBLIC_KEY en tu archivo .env con tu llave pública de ePayco.'
    );
    return;
  }

  const scriptLoaded = await loadEpaycoCheckoutScript();
  if (!scriptLoaded || !window.ePayco?.checkout) {
    callbacks.onError?.(
      'No fue posible cargar el script oficial de ePayco (checkout.epayco.co/checkout.js). Verifica tu conexión a internet.'
    );
    return;
  }

  const isTestMode = getEpaycoTestMode();
  const roundedAmount = Math.max(0, Math.round(params.amount));
  const roundedTax = Math.max(0, Math.round(params.tax ?? 0));
  const roundedTaxIco = Math.max(0, Math.round(params.taxIco ?? 0));
  // Regla matemática obligatoria en ePayco Colombia: amount === tax_base + tax + tax_ico
  const roundedTaxBase = Math.max(0, roundedAmount - roundedTax - roundedTaxIco);

  const responseUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : '';
  const confirmationUrl = `${getBackendBaseUrl()}/api/epayco/confirmation`;

  let settled = false;

  const handleMessage = async (event: MessageEvent) => {
    if (settled) return;
    if (!event.origin || !event.origin.includes('epayco')) return;

    const payload = event.data;
    if (!payload || typeof payload !== 'object') return;

    const candidateRef =
      payload.ref_payco ||
      payload.x_ref_payco ||
      payload.data?.ref_payco ||
      payload.data?.x_ref_payco;

    if (typeof candidateRef === 'string' && candidateRef.trim() !== '') {
      const validated = await validateEpaycoReference(candidateRef);
      if (validated && !settled) {
        settled = await dispatchEpaycoResult(validated, callbacks);
        if (settled) {
          window.removeEventListener('message', handleMessage);
        }
      }
    }
  };

  window.addEventListener('message', handleMessage);

  try {
    const handler = window.ePayco.checkout.configure({
      key: publicKey,
      test: isTestMode
    });

    // Si la versión cargada expone hook directo onResponse
    if (typeof handler.onResponse === 'function') {
      handler.onResponse(async (res: any) => {
        if (settled) return;
        const ref = res?.ref_payco || res?.x_ref_payco || res?.data?.x_ref_payco;
        if (ref) {
          const validated = await validateEpaycoReference(String(ref));
          if (validated && !settled) {
            settled = await dispatchEpaycoResult(validated, callbacks);
          }
        } else if (res?.x_cod_response !== undefined || res?.cod_respuesta !== undefined) {
          const normalized: EpaycoValidationData = {
            x_ref_payco: String(res.ref_payco || res.x_ref_payco || ''),
            x_id_invoice: String(res.x_id_invoice || params.invoice),
            x_description: params.description,
            x_amount: roundedAmount,
            x_tax: roundedTax,
            x_tax_ico: roundedTaxIco,
            x_tax_base: roundedTaxBase,
            x_currency_code: 'COP',
            x_cod_response: Number(res.x_cod_response ?? res.cod_respuesta),
            x_response: String(res.x_response ?? res.estado ?? '')
          };
          settled = await dispatchEpaycoResult(normalized, callbacks);
        }
      });
    }

    handler.onCloseModal = async () => {
      window.removeEventListener('message', handleMessage);
      if (settled) return;

      // Verificar si el webhook de confirmación en el backend ya registró aprobación
      const webhookTx = await checkBackendOrderPaymentStatus(params.invoice);
      if (webhookTx && !settled) {
        settled = await dispatchEpaycoResult(webhookTx, callbacks);
        if (settled) return;
      }

      callbacks.onModalClosed?.();
    };

    const checkoutData: Record<string, string> = {
      name: params.restaurantName || 'Restaurante',
      description: params.description,
      invoice: params.invoice,
      currency: 'cop',
      amount: String(roundedAmount),
      tax_base: String(roundedTaxBase),
      tax: String(roundedTax),
      tax_ico: String(roundedTaxIco),
      country: 'co',
      lang: 'es',
      external: 'false',
      response: responseUrl,
      confirmation: confirmationUrl,
      extra1: params.extra1 || params.invoice,
      extra2: params.extra2 || '',
      extra3: params.extra3 || ''
    };

    if (params.nameBilling) {
      checkoutData.name_billing = params.nameBilling;
    }
    if (params.emailBilling) {
      checkoutData.email_billing = params.emailBilling;
    }

    handler.open(checkoutData);
  } catch (err) {
    window.removeEventListener('message', handleMessage);
    console.error('Error abriendo Checkout de ePayco:', err);
    callbacks.onError?.(
      err instanceof Error
        ? err.message
        : 'Error inesperado al inicializar el Checkout de ePayco.'
    );
  }
}
