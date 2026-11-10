import React, { useState, useEffect } from 'react';
import { RestaurantFiscalProfile } from '../adapters/types';
import {
  getRestaurantFiscalProfile,
  saveRestaurantFiscalProfile
} from '../billingStorageService';
import {
  calculateColombiaNitDV,
  COLOMBIAN_CITIES_DANE,
  isValidEmailFormat
} from '../../../utils/billing';
import {
  Building2,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileCheck
} from 'lucide-react';

interface FiscalSettingsSectionProps {
  onProfileUpdated?: (profile: RestaurantFiscalProfile) => void;
}

const COMMON_RESPONSIBILITIES = [
  { code: 'R-99-PN', label: 'R-99-PN: No responsable de IVA (Persona Natural)' },
  { code: 'O-13', label: 'O-13: Gran contribuyente' },
  { code: 'O-15', label: 'O-15: Autorretenedor' },
  { code: 'O-23', label: 'O-23: Agente de retención IVA' },
  { code: 'O-47', label: 'O-47: Régimen Simple de Tributación (RST)' },
  { code: 'O-48', label: 'O-48: Impuesto Nacional al Consumo' },
  { code: 'O-49', label: 'O-49: No responsable del impuesto al consumo' }
];

export const FiscalSettingsSection: React.FC<FiscalSettingsSectionProps> = ({
  onProfileUpdated
}) => {
  const [profile, setProfile] = useState<RestaurantFiscalProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cargar configuración fiscal
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const loaded = await getRestaurantFiscalProfile();
        if (isMounted) {
          setProfile(loaded);
        }
      } catch (err: any) {
        console.error('Error cargando perfil fiscal:', err);
        if (isMounted) {
          setErrorMsg('No se pudo cargar la configuración fiscal del establecimiento.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Actualizar DV automáticamente cuando cambia el NIT
  const handleNitChange = (val: string) => {
    if (!profile) return;
    const cleanNit = val.replace(/\D/g, '');
    const calculatedDv = calculateColombiaNitDV(cleanNit);
    setProfile({
      ...profile,
      nit: cleanNit,
      dv: calculatedDv
    });
  };

  // Cambio de ciudad DANE
  const handleCityChange = (cityName: string) => {
    if (!profile) return;
    const found = COLOMBIAN_CITIES_DANE.find((c) => c.city === cityName);
    setProfile({
      ...profile,
      city: cityName,
      department: found?.department || profile.department,
      daneCode: found?.cityCode || profile.daneCode
    });
  };

  // Toggle de responsabilidades fiscales
  const toggleResponsibility = (code: string) => {
    if (!profile) return;
    const set = new Set(profile.fiscalResponsibilities || []);
    if (set.has(code)) {
      set.delete(code);
    } else {
      set.add(code);
    }
    setProfile({
      ...profile,
      fiscalResponsibilities: Array.from(set)
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validar email
    if (profile.email && !isValidEmailFormat(profile.email)) {
      setErrorMsg('Por favor ingresa un correo electrónico de facturación válido.');
      return;
    }

    if (!profile.businessName.trim() || !profile.nit.trim()) {
      setErrorMsg('La Razón Social y el NIT son obligatorios.');
      return;
    }

    setIsSaving(true);
    try {
      await saveRestaurantFiscalProfile(profile);
      setSuccessMsg('Configuración fiscal guardada exitosamente.');
      if (onProfileUpdated) {
        onProfileUpdated(profile);
      }
    } catch (err: any) {
      console.error('Error guardando perfil fiscal:', err);
      setErrorMsg(err?.message || 'Error al guardar la configuración fiscal.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="inline-block animate-spin w-6 h-6 border-2 border-rose-900 border-t-transparent rounded-full mb-2" />
        <p className="text-xs text-slate-500">Cargando datos fiscales del restaurante...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
        <p className="text-xs text-rose-600 font-semibold">{errorMsg || 'No se pudo cargar el perfil.'}</p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div>
        <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
          <Building2 className="w-4 h-4 text-rose-900 dark:text-rose-400" />
          Configuración Fiscal del Establecimiento
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Estos datos se usarán en el encabezado de las exportaciones contables para tu software contable o contador.
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-2 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-center gap-2 text-xs">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {/* Identificación de la Empresa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Razón Social (Nombre Legal registrado en RUT)
            </label>
            <input
              type="text"
              required
              value={profile.businessName}
              onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
              placeholder="Ej. Inversiones Gastronómicas SAS"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nombre Comercial (Marca del Restaurante)
            </label>
            <input
              type="text"
              value={profile.tradeName || ''}
              onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
              placeholder="Ej. Chinmi Bistro & Bar"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>
        </div>

        {/* NIT y DV */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              NIT de la Empresa (sin puntos ni guiones)
            </label>
            <input
              type="text"
              required
              value={profile.nit}
              onChange={(e) => handleNitChange(e.target.value)}
              placeholder="Ej. 901234567"
              className="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Dígito Verificación (DV)
            </label>
            <input
              type="text"
              readOnly
              value={profile.dv || '0'}
              title="Dígito de verificación calculado automáticamente"
              className="w-full px-3 py-2 text-center font-mono font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            />
          </div>
        </div>

        {/* Ubicación y Contacto */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ciudad / Municipio (DANE)
            </label>
            <select
              value={profile.city}
              onChange={(e) => handleCityChange(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            >
              {COLOMBIAN_CITIES_DANE.map((c) => (
                <option key={c.cityCode} value={c.city}>
                  {c.city} ({c.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Dirección Principal
            </label>
            <input
              type="text"
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              placeholder="Ej. Carrera 15 # 85-30"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Código DANE
            </label>
            <input
              type="text"
              readOnly
              value={profile.daneCode || '11001'}
              className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Correo Electrónico de Facturación
            </label>
            <input
              type="email"
              required
              value={profile.email}
              onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              placeholder="facturacion@mirestaurante.com"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Teléfono de Contacto
            </label>
            <input
              type="tel"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="Ej. 3001234567"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>
        </div>

        {/* Régimen e Impuesto Predeterminado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Régimen Tributario
            </label>
            <select
              value={profile.taxRegime}
              onChange={(e) => setProfile({ ...profile, taxRegime: e.target.value as any })}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            >
              <option value="no_responsable_iva">No responsable de IVA</option>
              <option value="responsable_iva">Responsable de IVA (Común)</option>
              <option value="regimen_simple">Régimen Simple de Tributación (RST)</option>
              <option value="gran_contribuyente">Gran Contribuyente</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Impuesto Predeterminado
            </label>
            <select
              value={profile.defaultTaxType}
              onChange={(e) => {
                const type = e.target.value as any;
                const rate = type === 'impoconsumo' ? 8 : type === 'iva' ? 19 : 0;
                setProfile({ ...profile, defaultTaxType: type, defaultTaxRate: rate });
              }}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            >
              <option value="impoconsumo">Impuesto al Consumo (8%) - Restaurantes y Bares</option>
              <option value="iva">IVA General (19%)</option>
              <option value="exento">Exento (0%)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Actividad Económica CIIU
            </label>
            <input
              type="text"
              value={profile.economicActivityCode || '5611'}
              onChange={(e) => setProfile({ ...profile, economicActivityCode: e.target.value })}
              placeholder="Ej. 5611 (Restaurantes)"
              className="w-full px-3 py-2 font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-rose-600 outline-hidden"
            />
          </div>
        </div>

        {/* Responsabilidades Fiscales RUT */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="block font-semibold text-slate-700 dark:text-slate-300">
            Responsabilidades Fiscales RUT (Casilla 53)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {COMMON_RESPONSIBILITIES.map((r) => {
              const checked = (profile.fiscalResponsibilities || []).includes(r.code);
              return (
                <label
                  key={r.code}
                  className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleResponsibility(r.code)}
                    className="w-4 h-4 rounded text-rose-900 border-slate-300 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-700 dark:text-slate-300">{r.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Botón de Guardado */}
        <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-rose-900 hover:bg-rose-800 text-white transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Guardando configuración...' : 'Guardar Perfil Fiscal'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
