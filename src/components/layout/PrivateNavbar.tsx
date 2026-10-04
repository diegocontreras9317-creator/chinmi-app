import React from 'react';
import { Navbar } from './Navbar';

/**
 * PrivateNavbar
 * Barra de navegación superior EXCLUSIVA para rutas privadas / autenticadas (Dashboard, TPV Mesas, Inventario, Reportes).
 * Consume el logo personalizado del restaurante registrado (o el default del sistema) y su configuración propia.
 */
export const PrivateNavbar = Navbar;
export default PrivateNavbar;
