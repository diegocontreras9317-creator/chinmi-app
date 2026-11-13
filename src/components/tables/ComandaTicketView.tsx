import React from 'react';
import { createPortal } from 'react-dom';
import { ComandaPaperWidth } from '../../config/appConfig';
import { ComandaTicketData } from '../../utils/comandaPrint';

interface ComandaTicketViewProps {
  data: ComandaTicketData;
  paperWidth: ComandaPaperWidth;
  className?: string;
}

/**
 * Vista de ticket térmico de comanda de preparación en alto contraste (negro sobre blanco).
 * Compatible con anchos de papel de 58 mm y 80 mm.
 * No incluye precios, impuestos, propinas, totales, imágenes ni fondos de color.
 */
export const ComandaTicketView: React.FC<ComandaTicketViewProps> = ({
  data,
  paperWidth,
  className = '',
}) => {
  const isNarrow = paperWidth === '58mm';

  return (
    <div
      data-paper={paperWidth}
      style={{
        width: isNarrow ? '58mm' : '80mm',
        maxWidth: '100%',
        backgroundColor: '#ffffff',
        color: '#000000',
      }}
      className={`font-mono bg-white text-black mx-auto box-border leading-snug ${
        isNarrow ? 'px-[2.5mm] py-[3mm] text-[11px]' : 'px-[3.5mm] py-[3.5mm] text-[12px]'
      } ${className}`}
    >
      {/* Cabecera: Restaurante y Título */}
      <div className="text-center pb-2 border-b border-dashed border-black space-y-1">
        <p
          className={`font-black uppercase tracking-wide break-words ${
            isNarrow ? 'text-[12px]' : 'text-[14px]'
          }`}
        >
          {data.restaurantName}
        </p>

        <p
          className={`font-black uppercase tracking-wider border-y border-black py-0.5 ${
            isNarrow ? 'text-[11px]' : 'text-[13px]'
          }`}
        >
          {data.title}
        </p>

        {data.isReprint && (
          <div className="border-2 border-black py-0.5 px-1 mt-1">
            <p className={`font-black uppercase tracking-widest ${isNarrow ? 'text-[11px]' : 'text-[12px]'}`}>
              *** REIMPRESIÓN ***
            </p>
            <p className="text-[10px] font-bold">
              Copia #{data.printNumber}
            </p>
          </div>
        )}

        {data.isTestTicket && (
          <p className="text-[10px] font-bold uppercase tracking-wider">
            [ TICKET DE PRUEBA ]
          </p>
        )}
      </div>

      {/* Metadatos de Mesa, Comanda, Fecha/Hora y Empleado */}
      <div className="py-2 border-b border-dashed border-black space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-black uppercase ${isNarrow ? 'text-[14px]' : 'text-[16px]'}`}>
            MESA {data.tableNumber}
          </span>
          <span className="font-bold text-[11px] shrink-0">
            #{data.orderNumber}
          </span>
        </div>

        {(data.tableName || data.tableZone) && (
          <p className="text-[10px] font-semibold">
            {data.tableName}
            {data.tableName && data.tableZone ? ' · ' : ''}
            {data.tableZone}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold pt-0.5">
          <span>Fecha: {data.dateLabel}</span>
          <span>Hora: {data.timeLabel}</span>
        </div>

        {data.employeeName && (
          <p className="text-[10px] font-bold break-words">
            Atiende: {data.employeeName}
          </p>
        )}
      </div>

      {/* Productos de la comanda (solo cantidad, nombre, modificadores y notas) */}
      <div className="py-2 border-b border-dashed border-black space-y-2">
        <div className="flex items-center justify-between border-b border-black pb-0.5 text-[10px] font-black uppercase">
          <span>Cant. / Producto</span>
        </div>

        {data.items.length === 0 ? (
          <p className="text-[11px] italic py-1">Sin productos registrados.</p>
        ) : (
          <div className="space-y-2">
            {data.items.map((item, idx) => (
              <div key={item.id || idx} className="break-inside-avoid">
                <div className="flex items-start gap-1.5">
                  <span
                    className={`font-black shrink-0 ${
                      isNarrow ? 'text-[12px]' : 'text-[13px]'
                    }`}
                  >
                    {item.quantityText}x
                  </span>
                  <span
                    className={`font-extrabold break-words flex-1 ${
                      isNarrow ? 'text-[12px]' : 'text-[13px]'
                    }`}
                  >
                    {item.name}
                  </span>
                </div>

                {item.modifiers.length > 0 && (
                  <div className="pl-4 mt-0.5 space-y-0.5">
                    {item.modifiers.map((mod, mIdx) => (
                      <p key={mIdx} className="text-[10px] font-semibold break-words">
                        + {mod}
                      </p>
                    ))}
                  </div>
                )}

                {item.notes && (
                  <p className="pl-4 mt-0.5 text-[10px] font-bold break-words">
                    * OBS: {item.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Observaciones Especiales Generales */}
      {data.specialNotes && (
        <div className="py-2 border-b border-dashed border-black break-inside-avoid">
          <p className="text-[10px] font-black uppercase">Observaciones Especiales:</p>
          <p className="text-[11px] font-bold break-words mt-0.5">
            {data.specialNotes}
          </p>
        </div>
      )}

      {/* Pie simple sin totales */}
      <div className="pt-2 text-center text-[10px] font-semibold space-y-0.5 break-inside-avoid">
        <p>Total ítems: {data.items.length}</p>
        <p className="text-[9px]">--- Fin de comanda ---</p>
      </div>
    </div>
  );
};

interface ComandaPrintPortalProps {
  data: ComandaTicketData | null;
  paperWidth: ComandaPaperWidth;
}

/**
 * Portal montado directamente en document.body para impresión limpia mediante @media print.
 */
export const ComandaPrintPortal: React.FC<ComandaPrintPortalProps> = ({
  data,
  paperWidth,
}) => {
  if (!data || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="chinmi-comanda-print-portal"
      data-paper={paperWidth}
      aria-hidden="true"
    >
      <ComandaTicketView data={data} paperWidth={paperWidth} />
    </div>,
    document.body
  );
};
