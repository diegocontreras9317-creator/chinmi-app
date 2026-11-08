/**
 * Validaciones estrictas para impedir registros con correos falsos,
 * temporales o con dominios desechables.
 */

const DISPOSABLE_DOMAINS = new Set([
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'dispostable.com',
  'trashmail.com',
  'fake.com',
  'test.com',
  'asdf.com',
  '123.com',
  'example.com',
  'invalid.com',
  'mailnesia.com',
  'sharklasers.com',
  'getnada.com',
  'throwawaymail.com',
  'temp-mail.org',
  '10minutemail.com',
  '10minutemail.net',
  'byom.de',
  'mytemp.email',
  'anonymbox.com',
  'mohmal.com',
  'fakemail.com',
  'maildrop.cc',
  'getairmail.com',
  'inboxalias.com',
  'nada.ltd',
  'disposable.com',
  'mailcatch.com',
  'dropmail.me'
]);

export function isValidRealEmail(email: string): { valid: boolean; reason?: string } {
  const clean = String(email || '').trim().toLowerCase();

  if (!clean) {
    return { valid: false, reason: 'Ingresa un correo electrónico.' };
  }

  // 1. Verificación de sintaxis estricta
  const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!EMAIL_REGEX.test(clean)) {
    return {
      valid: false,
      reason: 'El formato del correo electrónico no es válido. Debe tener la estructura usuario@dominio.com'
    };
  }

  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { valid: false, reason: 'El correo electrónico ingresado no es válido.' };
  }

  const localPart = parts[0];
  const domain = parts[1];

  // 2. Verificación de extensión de dominio TLD
  if (!domain.includes('.')) {
    return { valid: false, reason: 'El dominio del correo debe incluir una extensión válida (ej. .com, .co, .net).' };
  }

  const domainParts = domain.split('.');
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) {
    return { valid: false, reason: 'La extensión del dominio del correo no es válida.' };
  }

  // 3. Verificación de lista negra de dominios desechables y temporales
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      reason: 'No se admiten correos electrónicos temporales o desechables. Ingresa un correo electrónico personal o corporativo real.'
    };
  }

  // 4. Bloquear patrones ficticios evidentes
  if (
    domain === 'test.com' ||
    domain === 'fake.com' ||
    domain === 'correo.com' ||
    domain === 'ejemplo.com' ||
    domain === 'asdf.com' ||
    domain === '123.com' ||
    domain === 'abc.com'
  ) {
    return {
      valid: false,
      reason: 'No se permiten dominios de prueba ficticios. Por favor ingresa tu correo real.'
    };
  }

  if (
    (localPart === 'asdf' ||
      localPart === 'qwerty' ||
      localPart === '123456' ||
      localPart === 'fake' ||
      localPart === 'test' ||
      localPart === 'prueba' ||
      localPart === 'falso') &&
    (domain.startsWith('gmail') || domain.startsWith('hotmail') || domain.startsWith('yahoo') || domain.startsWith('outlook'))
  ) {
    // Si es asdf@gmail.com o prueba@hotmail.com o 123456@gmail.com
    if (localPart === 'asdf' || localPart === 'qwerty' || localPart === '123456' || localPart === 'falso') {
      return {
        valid: false,
        reason: 'Por favor ingresa un correo electrónico real de tu propiedad.'
      };
    }
  }

  return { valid: true };
}
