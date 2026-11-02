import React from 'react';
import { PLAN_DIFFERENCES } from '../../config/pricingPlans';
import { Check } from 'lucide-react';

interface PlanComparisonTableProps {
  compact?: boolean;
}

export const PlanComparisonTable: React.FC<PlanComparisonTableProps> = ({ compact = false }) => {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
        Comparativa de planes
      </h4>

      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-900">
              <th className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200 w-2/5">
                Capacidad
              </th>
              <th className="py-3 px-4 font-semibold text-slate-600 dark:text-slate-400 w-[30%] tabular-nums">
                Inicial ($0)
              </th>
              <th className="py-3 px-4 font-semibold text-rose-900 dark:text-rose-400 w-[30%] bg-stone-100/60 dark:bg-slate-800/50 tabular-nums">
                PRO ($89.000/mes)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {PLAN_DIFFERENCES.map((item, idx) => (
              <tr
                key={idx}
                className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
              >
                <td className="py-2.5 px-4">
                  <span className="font-semibold text-slate-900 dark:text-white block">
                    {item.feature}
                  </span>
                  {!compact && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      {item.category}
                    </span>
                  )}
                </td>

                <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 align-middle">
                  <span
                    className={
                      item.freeText.includes('No disponible')
                        ? 'text-slate-400 dark:text-slate-500'
                        : ''
                    }
                  >
                    {item.freeText}
                  </span>
                </td>

                <td className="py-2.5 px-4 bg-stone-50/50 dark:bg-slate-800/20 font-medium text-slate-900 dark:text-slate-100 align-middle">
                  <div className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{item.proText}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
