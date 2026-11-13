/**
 * Configuración centralizada de la aplicación SaaS.
 * Permite personalizar fácilmente el nombre, moneda, impuestos y límites de negocio.
 */

import { QrThemeId } from './qrThemes';

export interface QrMenuSettings {
  allowOrdering: boolean;     // Permitir hacer pedidos desde el móvil
  allowCallWaiter: boolean;   // Opción de llamar al mesero a la mesa
  allowRequestBill: boolean;  // Opción de pedir la cuenta
  menuOnlyMode: boolean;      // Modo sólo ver menú (desactiva pedidos desde QR)
  qrTheme?: QrThemeId;        // Tema visual para la carta QR del cliente
  menuViewMode?: 'list' | 'medium'; // Modo de visualización de productos
  bgImageUrl?: string;        // Imagen de fondo personalizada subida por el admin
  textColor?: string;         // Color de texto personalizado
  accentColor?: string;       // Color de acento para botones, precios y selección
  logoUrl?: string;           // Logo personalizado del restaurante para el menú QR (512x512)
  bannerUrl?: string;         // Banner horizontal del encabezado (1200x400)
  categories?: string[];      // Categorías configuradas para el menú QR

  // Personalización avanzada de Tarjetas de Productos
  cardBgColor?: string;               // Color HEX (ej. "#ffffff")
  cardBgOpacity?: number;             // Transparencia 0..100
  cardBgImageUrl?: string;            // Imagen de fondo JPG/PNG/WebP
  cardBgFit?: 'cover' | 'contain' | 'center'; // Ajuste de imagen
  cardOverlayColor?: string;          // Color HEX de superposición
  cardOverlayOpacity?: number;        // Opacidad de superposición 0..100
  cardTextColor?: string;             // Color de texto de la tarjeta o ''
  cardAutoContrast?: boolean;         // Opción de auto-contraste

  // Personalización avanzada del Contenedor de Categorías
  catBgColor?: string;                // Color HEX (ej. "#ffffff")
  catBgOpacity?: number;              // Transparencia 0..100
  catBgImageUrl?: string;             // Imagen de fondo JPG/PNG/WebP
  catBgFit?: 'cover' | 'contain' | 'center'; // Ajuste de imagen
  catOverlayColor?: string;           // Color HEX de superposición
  catOverlayOpacity?: number;         // Opacidad de superposición 0..100
  catTextColor?: string;              // Color de texto del contenedor o ''
  catAutoContrast?: boolean;          // Opción de auto-contraste

  // Subcuentas QR y Propina Voluntaria (Ley 1935/2018 Colombia)
  subaccountsMode?: 'disabled' | 'optional' | 'required';
  allowQrSubaccountJoin?: boolean;
  allowQrSharedItems?: boolean;
  allowQrVolunteerTip?: boolean;
  defaultSuggestedTipPercent?: number;
}

export type ComandaPaperWidth = '58mm' | '80mm';

export interface ComandaPrintSettings {
  enabled: boolean;
  paperWidth: ComandaPaperWidth;
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
  comandaPrintSettings?: ComandaPrintSettings;
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
    menuOnlyMode: false,
    qrTheme: 'default_normal',
    menuViewMode: 'medium',
    cardBgColor: '#ffffff',
    cardBgOpacity: 100,
    cardBgImageUrl: '',
    cardBgFit: 'cover',
    cardOverlayColor: '#000000',
    cardOverlayOpacity: 0,
    cardTextColor: '',
    cardAutoContrast: true,
    catBgColor: '#ffffff',
    catBgOpacity: 100,
    catBgImageUrl: '',
    catBgFit: 'cover',
    catOverlayColor: '#000000',
    catOverlayOpacity: 0,
    catTextColor: '',
    catAutoContrast: true,
    subaccountsMode: 'disabled',
    allowQrSubaccountJoin: true,
    allowQrSharedItems: true,
    allowQrVolunteerTip: true,
    defaultSuggestedTipPercent: 10,
  },
  comandaPrintSettings: {
    enabled: true,
    paperWidth: '80mm',
  }
};
