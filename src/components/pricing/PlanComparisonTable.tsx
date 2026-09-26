import React from 'react';
import { PLAN_DIFFERENCES } from '../../config/pricingPlans';
import { Check, X, Sparkles, Shield, AlertCircle } from 'lucide-react';

interface PlanComparisonTableProps {
  compact?: boolean;
}

export const PlanComparisonTable: React.FC<PlanComparisonTableProps> = ({ compact = false }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#e64980]" />
            <span>¿Cuál es la diferencia entre el Plan Gratis y el Plan PRO?</span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            El Plan Gratis te permite probar el sistema sin costo con límites; el Plan PRO elimina todas las restricciones.
          </p>
        </div>
      </div>

      {/* Responsive Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850">
              <th className="py-3 px-3.5 sm:px-4 font-bold text-slate-700 dark:text-slate-300 w-2/5">
                Característica
              </th>
              <th className="py-3 px-3 sm:px-4 font-bold text-slate-600 dark:text-slate-400 w-[30%]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>Plan Gratis ($0)</span>
                </div>
              </th>
              <th className="py-3 px-3 sm:px-4 font-bold text-[#681841] dark:text-pink-400 w-[30%] bg-pink-50/60 dark:bg-pink-950/20">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#e64980]" />
                  <span>Plan PRO ($89.000)</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {PLAN_DIFFERENCES.map((item, idx) => (
              <tr 
                key={idx}
                className={`transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/40 ${
                  item.highlight ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                }`}
              >
                <td className="py-2.5 px-3.5 sm:px-4">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    {item.feature}
                  </span>
                  {!compact && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                      {item.category}
                    </span>
                  )}
                </td>
                
                {/* Gratis */}
                <td className="py-2.5 px-3 sm:px-4 text-slate-600 dark:text-slate-400 align-middle">
                  <div className="flex items-start gap-1.5">
                    {item.freeText.includes('No disponible') || item.freeText.includes('Hasta') ? (
                      <span className="text-slate-400 dark:text-slate-500 font-bold shrink-0 mt-0.5">•</span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    )}
                    <span className={item.freeText.includes('No disponible') ? 'text-slate-400 dark:text-slate-500 line-through' : ''}>
                      {item.freeText}
                    </span>
                  </div>
                </td>

                {/* Pro */}
                <td className="py-2.5 px-3 sm:px-4 bg-pink-50/30 dark:bg-pink-950/10 font-semibold text-slate-900 dark:text-white align-middle">
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span className={item.highlight ? 'text-[#681841] dark:text-pink-300 font-bold' : ''}>
                      {item.proText}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Highlight Box */}
      <div className="p-3 sm:p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-bold">¿Cuándo conviene dar el salto a PRO?</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
            Si tu negocio tiene más de 6 mesas, más de 15 productos, o necesitas controlar mermas e insumos perecederos en cocina y sincronizar varias pantallas a la vez, el Plan PRO te da toda la libertad sin límites.
          </p>
        </div>
      </div>
    </div>
  );
};
