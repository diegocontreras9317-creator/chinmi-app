import React, { useState, useMemo } from 'react';
import {
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Download,
  Trash2,
  ClipboardCheck,
  Truck,
  Check
} from 'lucide-react';
import { SupplierOrder, SupplierOrderStatus } from '../../types';

interface SupplierOrdersSectionProps {
  orders: SupplierOrder[];
  onOpenNewOrder: () => void;
  onOpenConfirmModal: (order: SupplierOrder) => void;
  onQuickConfirmComplete: (order: SupplierOrder) => void;
  onDeleteOrder: (orderId: string) => void;
}

type OrderFilter = 'all' | SupplierOrderStatus;

function formatDatePart(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatTimePart(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function toLocalIsoDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getChannelLabel(channel: SupplierOrder['channel']): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'llamada') return 'Llamada';
  return 'Presencial';
}

export const SupplierOrdersSection: React.FC<SupplierOrdersSectionProps> = ({
  orders,
  onOpenNewOrder,
  onOpenConfirmModal,
  onQuickConfirmComplete,
  onDeleteOrder
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderFilter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const stats = useMemo(() => {
    let pending = 0;
    let complete = 0;
    let incomplete = 0;
    orders.forEach(o => {
      if (o.status === 'recibido_completo') complete++;
      else if (o.status === 'recibido_incompleto') incomplete++;
      else pending++;
    });
    return {
      total: orders.length,
      pending,
      complete,
      incomplete
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter(order => {
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      if (selectedDate) {
        const orderDay = toLocalIsoDate(order.orderedAt);
        if (orderDay !== selectedDate) return false;
      }
      if (!q) return true;

      const inSupplier =
        order.supplierName.toLowerCase().includes(q) ||
        (order.supplierPhone && order.supplierPhone.toLowerCase().includes(q));
      const inItems = (order.items || []).some(it => it.name.toLowerCase().includes(q));
      const inNotes =
        (order.notes && order.notes.toLowerCase().includes(q)) ||
        (order.receptionNotes && order.receptionNotes.toLowerCase().includes(q));

      return Boolean(inSupplier || inItems || inNotes);
    });
  }, [orders, searchQuery, selectedDate, statusFilter]);

  const handleExportOrdersCSV = () => {
    if (orders.length === 0) return;

    const headers = [
      'ID Pedido',
      'Fecha Pedido',
      'Hora Pedido',
      'Distribuidor',
      'Telefono',
      'Medio',
      'Productos Solicitados',
      'Estado',
      'Llego',
      'Llego Completo',
      'Fecha y Hora Confirmacion',
      'Recibido Por',
      'Notas Recepcion'
    ];

    const rows = orders.map(o => {
      const itemsText = (o.items || [])
        .map(it => `${it.quantity} ${it.unit} ${it.name}`)
        .join(' | ');
      const statusText =
        o.status === 'recibido_completo'
          ? 'Llego todo completo'
          : o.status === 'recibido_incompleto'
          ? 'Llego incompleto'
          : 'Pendiente';
      const confirmedStr = o.confirmedAt
        ? `${formatDatePart(o.confirmedAt)} ${formatTimePart(o.confirmedAt)}`
        : '';

      return [
        `"${o.id}"`,
        `"${formatDatePart(o.orderedAt)}"`,
        `"${formatTimePart(o.orderedAt)}"`,
        `"${o.supplierName.replace(/"/g, '""')}"`,
        `"${o.supplierPhone || ''}"`,
        `"${getChannelLabel(o.channel)}"`,
        `"${itemsText.replace(/"/g, '""')}"`,
        `"${statusText}"`,
        o.arrived ? 'SI' : 'NO',
        o.arrivedComplete ? 'SI' : 'NO',
        `"${confirmedStr}"`,
        `"${(o.confirmedBy || '').replace(/"/g, '""')}"`,
        `"${(o.receptionNotes || o.notes || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `pedidos_distribuidores_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* KPI Summary Strip - Single elevation, hairline dividers, tabular figures */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden">
        <div className="p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Pedidos registrados
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white font-mono tabular-nums mt-1 block">
            {stats.total}
          </span>
        </div>

        <div className="p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Pendientes por llegar
          </span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono tabular-nums mt-1 block">
            {stats.pending}
          </span>
        </div>

        <div className="p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Llegaron completos
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1 block">
            {stats.complete}
          </span>
        </div>

        <div className="p-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
            Con faltantes o novedad
          </span>
          <span className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tabular-nums mt-1 block">
            {stats.incomplete}
          </span>
        </div>
      </div>

      {/* Filters & Primary Action Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por distribuidor, producto solicitado o nota..."
              className="w-full pl-10 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 text-slate-900 dark:text-white placeholder:text-slate-400 outline-hidden focus:ring-2 focus:ring-rose-900/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Picker Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-850">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 bg-transparent outline-hidden cursor-pointer"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {orders.length > 0 && (
              <button
                type="button"
                onClick={handleExportOrdersCSV}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenNewOrder}
              className="px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Pedido</span>
            </button>
          </div>
        </div>

        {/* Segmented Status Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-850 rounded-lg border border-slate-200/70 dark:border-slate-800 overflow-x-auto">
          {(
            [
              { id: 'all', label: `Todos (${stats.total})` },
              { id: 'pendiente', label: `Pendientes (${stats.pending})` },
              { id: 'recibido_completo', label: `Llegó Completo (${stats.complete})` },
              { id: 'recibido_incompleto', label: `Incompletos (${stats.incomplete})` }
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div className="p-10 sm:p-12 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {orders.length === 0
              ? 'Aún no hay pedidos registrados a distribuidores'
              : 'No se encontraron pedidos con esos filtros'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {orders.length === 0
              ? 'Cada pedido que envíes por WhatsApp o registres manualmente aparecerá aquí con su fecha y hora para confirmar cuando llegue completo.'
              : 'Prueba limpiando la fecha seleccionada o cambiando el filtro de estado.'}
          </p>
          {orders.length === 0 && (
            <button
              type="button"
              onClick={onOpenNewOrder}
              className="px-4 py-2 rounded-lg bg-rose-950 hover:bg-rose-900 text-white text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Primer Pedido</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 whitespace-nowrap">Fecha y Hora</th>
                  <th className="py-3 px-4 whitespace-nowrap">Distribuidor</th>
                  <th className="py-3 px-4">Productos Solicitados</th>
                  <th className="py-3 px-4 whitespace-nowrap">Confirmación de Llegada</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredOrders.map(order => {
                  const isComplete = order.status === 'recibido_completo';
                  const isIncomplete = order.status === 'recibido_incompleto';

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors align-top"
                    >
                      {/* Fecha y hora del pedido */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                          {formatDatePart(order.orderedAt)}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 flex items-center gap-1.5">
                          <span>{formatTimePart(order.orderedAt)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{getChannelLabel(order.channel)}</span>
                        </div>
                      </td>

                      {/* Distribuidor */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{order.supplierName}</span>
                        </div>
                        {order.supplierPhone && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                            {order.supplierPhone}
                          </div>
                        )}
                      </td>

                      {/* Productos solicitados */}
                      <td className="py-3.5 px-4 min-w-[220px]">
                        <div className="space-y-1">
                          {(order.items || []).map(it => {
                            const hasShortfall =
                              isIncomplete &&
                              (it.received === false ||
                                (it.receivedQuantity !== undefined &&
                                  it.receivedQuantity < it.quantity));
                            return (
                              <div
                                key={it.id}
                                className="flex items-baseline justify-between gap-3 text-xs"
                              >
                                <span
                                  className={`font-medium ${
                                    hasShortfall
                                      ? 'text-amber-700 dark:text-amber-300'
                                      : 'text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {it.name}
                                </span>
                                <span className="font-mono tabular-nums text-[11px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                  {hasShortfall
                                    ? `${it.receivedQuantity ?? 0}/${it.quantity} ${it.unit}`
                                    : `${it.quantity} ${it.unit}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        {order.notes && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                            Nota pedido: {order.notes}
                          </p>
                        )}
                      </td>

                      {/* Estado y confirmación de llegada completa */}
                      <td className="py-3.5 px-4 min-w-[210px]">
                        {isComplete ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>Todo llegó y llegó completo</span>
                            </div>
                            {order.confirmedAt && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {formatDatePart(order.confirmedAt)} · {formatTimePart(order.confirmedAt)}
                                {order.confirmedBy ? ` · ${order.confirmedBy}` : ''}
                              </div>
                            )}
                            {order.stockUpdated && (
                              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                                Sumado al inventario de despensa
                              </div>
                            )}
                            {order.receptionNotes && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {order.receptionNotes}
                              </div>
                            )}
                          </div>
                        ) : isIncomplete ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              <span>Llegó incompleto / con novedad</span>
                            </div>
                            {order.confirmedAt && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                {formatDatePart(order.confirmedAt)} · {formatTimePart(order.confirmedAt)}
                                {order.confirmedBy ? ` · ${order.confirmedBy}` : ''}
                              </div>
                            )}
                            {order.receptionNotes && (
                              <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                                {order.receptionNotes}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Pendiente de entrega</span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Sin confirmar recepción aún
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {order.status === 'pendiente' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onQuickConfirmComplete(order)}
                                title="Confirmar en un clic que todo llegó y llegó completo"
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold transition inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Llegó Completo</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onOpenConfirmModal(order)}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
                              >
                                Verificar
                              </button>
                            </>
                          )}

                          {order.status === 'recibido_incompleto' && (
                            <button
                              type="button"
                              onClick={() => onOpenConfirmModal(order)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition cursor-pointer whitespace-nowrap"
                            >
                              Completar Entrega
                            </button>
                          )}

                          {order.status === 'recibido_completo' && (
                            <button
                              type="button"
                              onClick={() => onOpenConfirmModal(order)}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold transition cursor-pointer whitespace-nowrap"
                            >
                              Detalle
                            </button>
                          )}

                          {confirmDeleteId === order.id ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteOrder(order.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2 py-1 rounded-md bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold cursor-pointer"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(order.id)}
                              title="Eliminar registro de pedido"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
