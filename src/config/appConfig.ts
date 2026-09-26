/**
 * Configuración centralizada de la aplicación SaaS.
 * Permite personalizar fácilmente el nombre, moneda, impuestos y límites de negocio.
 */

export interface QrMenuSettings {
  allowOrdering: boolean;     // Permitir hacer pedidos desde el móvil
  allowCallWaiter: boolean;   // Opción de llamar al mesero a la mesa
  allowRequestBill: boolean;  // Opción de pedir la cuenta
  menuOnlyMode: boolean;      // Modo sólo ver menú (desactiva pedidos desde QR)
}

export interface AppConfig {
  appName: string;
  appSubtitle: string;
  businessName: string;
  businessAddress: string;
  businessTaxId: string;
  businessPhone: string;
  currency: string;
  currencyPosition: 'prefix' | 'suffix';
  logoUrl?: string;
  defaultTaxRate: number; // Porcentaje de IVA por defecto (ej. 10%)
  availableTaxRates: number[];
  freemiumLimits: {
    freeMaxTables: number;
    freeMaxProducts: number;
  };
  zones: string[];
  categories: string[];
  syncIntervalMs: number;
  qrSettings: QrMenuSettings;
}

export const defaultAppConfig: AppConfig = {
  appName: 'Chinmi App',
  appSubtitle: 'Gestión Inteligente para Restaurantes y Bares',
  businessName: 'Chinmi GastroBar & Terraza',
  businessAddress: 'Calle 85 # 14-05, Zona T, Bogotá, Colombia',
  businessTaxId: 'NIT 901.542.890-1',
  businessPhone: '+57 (601) 743 8920',
  currency: 'COP$',
  currencyPosition: 'prefix',
  logoUrl: '/src/assets/images/regenerated_image_1790196085462.png',
  defaultTaxRate: 8,
  availableTaxRates: [0, 8, 19],
  freemiumLimits: {
    freeMaxTables: 6,
    freeMaxProducts: 15,
  },
  zones: ['Terraza Exterior', 'Salón Principal', 'Barra Alta', 'Zona Reservados / VIP'],
  categories: [
    'Todas las categorías',
    'Cervezas & Vinos',
    'Bebidas & Refrescos',
    'Tapas & Entrantes',
    'Platos Principales',
    'Cafés & Postres',
    'Licores & Cócteles'
  ],
  syncIntervalMs: 2500,
  qrSettings: {
    allowOrdering: true,
    allowCallWaiter: true,
    allowRequestBill: true,
    menuOnlyMode: false
  }
};
