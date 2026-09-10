"use client";

import { useEffect } from "react";
import { money, fechaCl } from "@/lib/cotizador/formato";
import { PASTILLA_ESTADO } from "@/lib/estilos";
import type { FilaLead } from "@/lib/panel-odoo/datos";
import { diasDesde, estaAtrasada, estaEstancada, hoyEnChileIso } from "@/lib/panel-odoo/crm-filtro";
import { traducir, ETAPAS_CRM } from "@/lib/panel-odoo/traducciones";

type Fila = [string, string];

// Solo las filas con valor: una oportunidad recién creada no tiene motivo de pérdida ni
// campaña, y diez guiones seguidos son peor que no mostrar la fila.
function conValor(filas: (Fila | null)[]): Fila[] {
  return filas.filter((f): f is Fila => f !== null && f[1] !== "" && f[1] !== "-");
}

function Grupo({ titulo, filas }: { titulo: string; filas: Fila[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <dl className="mt-1 divide-y divide-borde text-sm">
        {filas.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-tinta/55">{etiqueta}</dt>
            <dd className="min-w-0 break-words text-right font-medium text-tinta">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const CLASES_ESTADO: Record<string, string> = {
  ganada: "bg-teal/10 text-teal",
  perdida: "bg-red-500/10 text-red-600",
  abierta: "bg-naranjo-suave/15 text-naranjo",
};
const ETIQUETAS_ESTADO: Record<string, string> = {
  ganada: "Ganada",
  perdida: "Perdida",
  abierta: "Abierta",
};

export default function ModalDetalleLead({ lead, onCerrar }: { lead: FilaLead; onCerrar: () => void }) {
  useEffect(() => {
    const alPresionarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [onCerrar]);

  const hoy = hoyEnChileIso();
  const diasSinMoverse = diasDesde(lead.fecha_ultimo_movimiento ?? lead.fecha_creacion, hoy);
  const diasDeVida = diasDesde(lead.fecha_creacion, hoy);
  const estancada = estaEstancada(lead, hoy);
  const atrasada = estaAtrasada(lead, hoy);

  const negocio = conValor([
    ["Tipo", lead.tipo === "opportunity" ? "Oportunidad" : "Lead sin calificar"],
    ["Etapa", traducir(ETAPAS_CRM, lead.etapa)],
    ["Vendedor", lead.vendedor ?? "Sin asignar"],
    ["Equipo", lead.equipo ?? "-"],
    ["Prioridad", lead.prioridad ?? "-"],
    lead.etiquetas && lead.etiquetas.length > 0 ? ["Etiquetas", lead.etiquetas.join(" · ")] : null,
  ]);

  const contraparte = conValor([
    ["Cliente", lead.partner_nombre ?? "-"],
    ["Contacto", lead.contacto ?? "-"],
    ["Correo", lead.correo ?? "-"],
    ["Teléfono", lead.telefono ?? "-"],
    ["Ciudad", lead.ciudad ?? "-"],
  ]);

  const montos = conValor([
    [
      "Monto esperado",
      (lead.monto_esperado ?? 0) > 0 ? money(lead.monto_esperado) : "sin monto cargado en Odoo",
    ],
    ["Probabilidad", `${Math.round(lead.probabilidad ?? 0)}%`],
    lead.monto_ponderado !== null && (lead.monto_esperado ?? 0) > 0
      ? ["Ponderado por probabilidad", money(lead.monto_ponderado)]
      : null,
  ]);

  const tiempos = conValor([
    ["Creada", lead.fecha_creacion ? fechaCl(lead.fecha_creacion) : "-"],
    diasDeVida !== null ? ["Antigüedad", `${diasDeVida} día${diasDeVida === 1 ? "" : "s"}`] : null,
    ["Último movimiento de etapa", lead.fecha_ultimo_movimiento ? fechaCl(lead.fecha_ultimo_movimiento) : "-"],
    lead.estado === "abierta" && diasSinMoverse !== null
      ? ["Sin moverse", `${diasSinMoverse} día${diasSinMoverse === 1 ? "" : "s"}`]
      : null,
    ["Cierre estimado", lead.fecha_cierre_estimada ? fechaCl(lead.fecha_cierre_estimada) : "-"],
    ["Cierre real", lead.fecha_cierre_real ? fechaCl(lead.fecha_cierre_real) : "-"],
    lead.dias_para_cerrar !== null ? ["Días hasta el cierre", String(Math.round(lead.dias_para_cerrar))] : null,
  ]);

  const siguiente = conValor([
    ["Próxima actividad", lead.actividad_proxima ? fechaCl(lead.actividad_proxima) : "ninguna agendada"],
    ["Tipo", lead.actividad_tipo ?? "-"],
    ["Resumen", lead.actividad_resumen ?? "-"],
  ]);

  const origen = conValor([
    ["Origen", lead.origen ?? "-"],
    ["Medio", lead.medio ?? "-"],
    ["Campaña", lead.campana ?? "-"],
  ]);

  const cierre = conValor([lead.motivo_perdida ? ["Motivo de pérdida", lead.motivo_perdida] : null]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-tinta/40 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-borde bg-white shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-condensed text-lg font-bold uppercase leading-tight text-tinta">{lead.nombre}</h2>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className={`${PASTILLA_ESTADO} ${CLASES_ESTADO[lead.estado ?? ""] ?? "bg-gris/15 text-gris"}`}>
                {ETIQUETAS_ESTADO[lead.estado ?? ""] ?? "—"}
              </span>
              {estancada && (
                <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Estancada
                </span>
              )}
              {atrasada && (
                <span className="rounded-full border border-naranjo/30 bg-naranjo/10 px-2 py-0.5 text-[11px] font-semibold text-naranjo">
                  Cierre vencido
                </span>
              )}
              {lead.estado === "abierta" && !lead.actividad_proxima && (
                <span className="rounded-full border border-borde bg-crema px-2 py-0.5 text-[11px] font-semibold text-tinta/55">
                  Sin próxima actividad
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="shrink-0 rounded-full p-1 text-tinta/50 hover:bg-crema hover:text-tinta"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          {/* El aviso arriba y no deducido de dos fechas en dos grupos distintos. */}
          {estancada && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Lleva {diasSinMoverse} días sin cambiar de etapa. Sigue contando como pipeline abierto
              {(lead.monto_esperado ?? 0) > 0 ? ` por ${money(lead.monto_esperado)}` : ""}.
            </p>
          )}
          {(lead.monto_esperado ?? 0) <= 0 && lead.estado === "abierta" && (
            <p className="mt-4 rounded-lg border border-naranjo/30 bg-naranjo/10 px-3 py-2 text-xs text-naranjo">
              No tiene monto esperado en Odoo, así que no entra en ninguna proyección del panel.
            </p>
          )}
          <Grupo titulo="Negocio" filas={negocio} />
          <Grupo titulo="Contraparte" filas={contraparte} />
          <Grupo titulo="Montos" filas={montos} />
          <Grupo titulo="Tiempos" filas={tiempos} />
          <Grupo titulo="Lo que sigue" filas={siguiente} />
          <Grupo titulo="Origen" filas={origen} />
          <Grupo titulo="Cierre" filas={cierre} />
        </div>
      </div>
    </div>
  );
}
