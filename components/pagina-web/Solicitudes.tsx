"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconBrandWhatsapp, IconMail, IconRefresh } from "@tabler/icons-react";
import VentanaModal from "@/components/inventario/VentanaModal";
import { CAMPO, PASTILLA_ESTADO, TARJETA } from "@/lib/estilos";
import {
  enlaceWhatsAppSolicitud,
  ESTADOS_SOLICITUD,
  TIPOS_SOLICITUD,
  type Solicitud,
} from "@/lib/pagina-web-modelo";
import { actualizarSolicitudAction, eliminarSolicitudAction } from "@/app/(protegido)/pagina-web/acciones";
import { PieFormulario } from "./Catalogo";

// CAMPO trae w-full, y sumarle w-auto no basta: cuál de las dos gana lo decide el orden
// del CSS de Tailwind, no el de las clases. Para los filtros se le saca el w-full.
const FILTRO = `${CAMPO.replace("w-full", "")} w-full sm:w-60`;

const etiquetaTipo = (t: string) => TIPOS_SOLICITUD.find((x) => x.valor === t)?.etiqueta ?? t;
const estado = (v: string) => ESTADOS_SOLICITUD.find((e) => e.valor === v) ?? ESTADOS_SOLICITUD[0];
// Armada a mano desde las partes numéricas: toLocaleString da textos distintos en Node y
// en el navegador ("a. m." con espacios de distinto tipo) y React reclama la diferencia
// al hidratar. Con hora de Santiago, para que no dependa de dónde corre el servidor.
const FORMATO_FECHA = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const fecha = (iso: string) => {
  if (!iso) return "—";
  const p = Object.fromEntries(FORMATO_FECHA.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
};

/** Las solicitudes que llegan del formulario de contacto de pertec.cl. */
export default function Solicitudes({ solicitudes }: { solicitudes: Solicitud[] }) {
  const router = useRouter();
  const [refrescando, iniciar] = useTransition();
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [abierta, setAbierta] = useState<Solicitud | null>(null);

  const visibles = solicitudes.filter(
    (s) => (filtroTipo === "todos" || s.tipo === filtroTipo) && (filtroEstado === "todos" || s.estado === filtroEstado),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={FILTRO} value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} aria-label="Tipo">
          <option value="todos">Todos los tipos</option>
          {TIPOS_SOLICITUD.map((t) => (
            <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
          ))}
        </select>
        <select className={FILTRO} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Estado">
          <option value="todos">Todos los estados</option>
          {ESTADOS_SOLICITUD.map((e) => (
            <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
          ))}
        </select>
        <span className="flex-1" />
        <p className="text-sm text-gris">{visibles.length} de {solicitudes.length}</p>
        <button
          type="button"
          onClick={() => iniciar(() => router.refresh())}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-gris transition hover:bg-borde/60 hover:text-tinta"
        >
          <IconRefresh size={15} className={refrescando ? "animate-spin" : ""} aria-hidden /> Refrescar
        </button>
      </div>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} p-10 text-center text-sm text-gris`}>
          {solicitudes.length === 0 ? "Todavía no llegan solicitudes del sitio." : "Ninguna solicitud con esos filtros."}
        </div>
      ) : (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {visibles.map((s) => {
                  const e = estado(s.estado);
                  return (
                    <tr key={s.id} onClick={() => setAbierta(s)} className="cursor-pointer transition hover:bg-borde/30">
                      <td className="px-4 py-3"><span className={`${PASTILLA_ESTADO} ${e.clase}`}>{e.etiqueta}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 text-gris">{etiquetaTipo(s.tipo)}</td>
                      <td className="px-4 py-3 font-semibold text-tinta">{s.nombre}</td>
                      <td className="px-4 py-3 text-gris">{s.empresa || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gris">
                        <span className="block">{s.email}</span>
                        <span className="block">{s.telefono}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gris">{fecha(s.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierta && <DetalleSolicitud key={abierta.id} s={abierta} alCerrar={() => setAbierta(null)} />}
    </div>
  );
}

function DetalleSolicitud({ s, alCerrar }: { s: Solicitud; alCerrar: () => void }) {
  const router = useRouter();
  const [estadoSel, setEstado] = useState<string>(s.estado);
  const [notas, setNotas] = useState(s.notas_internas);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();
  const cambiado = estadoSel !== s.estado || notas !== s.notas_internas;
  const whatsapp = useMemo(() => enlaceWhatsAppSolicitud(s), [s]);

  const cerrar = () => {
    if (cambiado && !confirm("Hay cambios sin guardar. ¿Cerrar igual?")) return;
    alCerrar();
  };
  const listo = () => {
    alCerrar();
    router.refresh();
  };

  const filas: [string, string][] = [
    ["Tipo", etiquetaTipo(s.tipo)],
    ["Empresa", s.empresa],
    ["Correo", s.email],
    ["Teléfono", s.telefono],
    ["Servicio", s.servicio],
    ["Tipo de equipo", s.tipo_equipo],
    ["Ancho de correa", s.ancho_correa],
    ["Recibida", fecha(s.created_at)],
  ];

  return (
    <VentanaModal abierta alCerrar={cerrar} titulo={s.nombre} descripcion="Lo que envió el cliente no se edita; el estado y las notas son internos.">
      <div className="space-y-4 px-5 py-4">
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
          {filas.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-xs font-semibold text-gris">{k}</dt>
              <dd className="break-words text-tinta">{v}</dd>
            </div>
          ))}
        </dl>
        {s.mensaje && <p className="whitespace-pre-wrap rounded-lg bg-crema p-3 text-sm text-tinta">{s.mensaje}</p>}

        <div className="flex flex-wrap gap-2">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta transition hover:border-teal hover:text-teal">
              <IconBrandWhatsapp size={16} aria-hidden /> Abrir en WhatsApp
            </a>
          )}
          {s.email && (
            <a href={`mailto:${s.email}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta transition hover:border-azul hover:text-azul">
              <IconMail size={16} aria-hidden /> Responder por correo
            </a>
          )}
        </div>

        <div className="grid gap-3 border-t border-borde pt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tinta/80">Estado</span>
            <select className={CAMPO} value={estadoSel} onChange={(e) => setEstado(e.target.value)}>
              {ESTADOS_SOLICITUD.map((e) => (
                <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-tinta/80">Notas internas</span>
            <textarea className={`${CAMPO} min-h-24`} rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="No las ve el cliente." />
          </label>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
      <PieFormulario
        eliminar={() => {
          if (!confirm(`¿Eliminar la solicitud de ${s.nombre}? No se puede deshacer.`)) return;
          iniciar(async () => {
            const r = await eliminarSolicitudAction(s.id);
            if (!r.ok) return setError(r.error);
            listo();
          });
        }}
        cancelar={cerrar}
        guardar={() =>
          iniciar(async () => {
            const r = await actualizarSolicitudAction(s.id, estadoSel, notas);
            if (!r.ok) return setError(r.error);
            listo();
          })
        }
        ocupado={guardando}
        textoOcupado="Guardando…"
      />
    </VentanaModal>
  );
}
