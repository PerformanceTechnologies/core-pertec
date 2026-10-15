"use client";

import { useMemo, useState } from "react";
import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue, IconSearch } from "@tabler/icons-react";
import BotonEliminarPersona from "./BotonEliminarPersona";
import ChipDeEtapa from "./ChipDeEtapa";
import { CAMPO_COMPACTO, TARJETA } from "@/lib/contratos/estilos";
import { ETIQUETAS_ETAPA, type Etapa } from "@/lib/contratos/acreditacion-modelo";
import { formatearRut } from "@/lib/contratos/rut";

export interface FilaDeNomina {
  id: string;
  numero: number;
  nombre: string;
  rut: string;
  cargoId: string;
  cargo: string;
  faena: string | null;
  turno: string | null;
  activo: boolean;
  etapa: Etapa;
  porcentaje: number;
  subidos: number;
  total: number;
  vencidos: number;
  porVencer: number;
  /** Días para el fin del contrato vigente; null si es indefinido o no hay fecha. */
  diasTermino: number | null;
  /** Para el aviso al eliminar: si borrarla se lleva también su carpeta. */
  tieneCarpeta: boolean;
  /** Si cuenta como contratada en la dotación (fecha de ingreso y sin «sin contrato aún»). */
  contratada: boolean;
}

/** Sin acentos ni mayúsculas, para que "perez" encuentre a "Pérez". */
function plano(texto: string): string {
  // ̀–ͯ es el bloque de acentos combinantes que deja NFD al separarlos.
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * La nómina: una fila por persona, con su avance y lo que le falta.
 *
 * Filtra en el navegador. Son decenas de personas, no miles, y filtrar al
 * instante mientras se escribe vale más que ir al servidor por cada tecla.
 *
 * En el celular cada fila es una tarjeta apilada; en pantalla ancha, una fila de
 * columnas. Es el mismo marcado con otro `grid`, no dos listas distintas.
 */
export default function ListaDeNomina({
  filas,
  cargos,
  esAdmin,
}: {
  filas: FilaDeNomina[];
  cargos: { id: string; nombre: string }[];
  /** Eliminar una ficha es de administradores: borra documentos, cursos e historial. */
  esAdmin: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [cargo, setCargo] = useState("");
  const [etapa, setEtapa] = useState<Etapa | "">("");
  const [conAlertas, setConAlertas] = useState(false);
  const [conBajas, setConBajas] = useState(false);

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return filas.filter((f) => {
      if (!conBajas && !f.activo) return false;
      if (cargo && f.cargoId !== cargo) return false;
      if (etapa && f.etapa !== etapa) return false;
      if (conAlertas && f.vencidos + f.porVencer === 0 && !(f.diasTermino !== null && f.diasTermino <= 30)) {
        return false;
      }
      if (q) {
        // El RUT se compara sin puntos ni guion, para que "12.669" y "12669"
        // encuentren lo mismo; el nombre se compara tal cual, con sus espacios.
        const qRut = q.replace(/[.\s-]/g, "");
        const enNombre = plano(f.nombre).includes(q);
        const enRut = qRut !== "" && f.rut.toLowerCase().replace("-", "").includes(qRut);
        if (!enNombre && !enRut) return false;
      }
      return true;
    });
  }, [filas, busqueda, cargo, etapa, conAlertas, conBajas]);

  return (
    <div>
      {/* Todos los filtros en UNA fila (se parte en dos en el celular): el buscador, los dos
          desplegables y los dos interruptores en línea, en vez de una segunda fila entera de
          casillas debajo. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[1_1_14rem]">
          <span className="sr-only">Buscar por nombre o RUT</span>
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o RUT"
            className={`${CAMPO_COMPACTO} pl-9`}
          />
        </label>

        <label className="min-w-0 flex-[1_1_9rem] lg:max-w-[11rem]">
          <span className="sr-only">Cargo</span>
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={CAMPO_COMPACTO}>
            <option value="">Todos los cargos</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 flex-[1_1_9rem] lg:max-w-[11rem]">
          <span className="sr-only">Etapa</span>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value as Etapa | "")} className={CAMPO_COMPACTO}>
            <option value="">Todas las etapas</option>
            {(Object.keys(ETIQUETAS_ETAPA) as Etapa[]).map((k) => (
              <option key={k} value={k}>
                {ETIQUETAS_ETAPA[k]}
              </option>
            ))}
          </select>
        </label>

        <label
          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold pointer-coarse:min-h-11 ${
            conAlertas ? "border-cian bg-cian-lavado text-azul" : "border-borde bg-superficie text-gris"
          }`}
        >
          <input
            type="checkbox"
            checked={conAlertas}
            onChange={(e) => setConAlertas(e.target.checked)}
            className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
          />
          Con alertas
        </label>
        <label
          className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-semibold pointer-coarse:min-h-11 ${
            conBajas ? "border-cian bg-cian-lavado text-azul" : "border-borde bg-superficie text-gris"
          }`}
        >
          <input
            type="checkbox"
            checked={conBajas}
            onChange={(e) => setConBajas(e.target.checked)}
            className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
          />
          Incluir bajas
        </label>
      </div>

      <p className="mt-2.5 text-xs text-gris" aria-live="polite">
        {visibles.length} de {filas.length} {filas.length === 1 ? "persona" : "personas"}
      </p>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} mt-3 p-10 text-center`}>
          <p className="text-sm font-semibold text-tinta">
            {filas.length === 0 ? "Todavía no hay personas en la nómina" : "Ninguna persona coincide"}
          </p>
          <p className="mt-1 text-xs text-gris">
            {filas.length === 0
              ? "Da de alta a la primera con «Nueva persona»."
              : "Prueba quitando algún filtro."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visibles.map((f) => {
            const completa = f.etapa === "acreditada";
            return (
              <li key={f.id}>
                {/* La tarjeta es un <div> y el enlace se estira sobre ella con
                    after:inset-0. Envolver todo en un <a> era más simple, pero
                    el botón de eliminar queda DENTRO del enlace: un <button> en
                    un <a> es HTML inválido y el navegador decide solo qué hace
                    el clic. Mismo patrón que TarjetaDeCarpeta. */}
                <div
                  className={`${TARJETA} group relative grid grid-cols-1 gap-x-4 gap-y-3 p-4 transition hover:border-cian md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center ${
                    f.activo ? "" : "opacity-60"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[11px] font-bold tabular-nums text-gris-suave">
                        #{f.numero}
                      </span>
                      <Link
                        href={`/contratos/acreditacion/${f.id}`}
                        className="truncate text-sm font-bold text-azul after:absolute after:inset-0 after:content-['']"
                      >
                        {f.nombre}
                      </Link>
                      {!f.activo && (
                        <span className="rounded-full bg-borde px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gris">
                          Baja
                        </span>
                      )}
                      {f.activo && !f.contratada && (
                        <span
                          title="No cuenta como contratada en la dotación: falta la fecha de ingreso en Datos, o está marcada «sin contrato aún»."
                          className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700"
                        >
                          Sin contrato
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gris">
                      {formatearRut(f.rut)} · {f.cargo}
                      {f.faena ? ` · ${f.faena}` : ""}
                      {f.turno ? ` · ${f.turno}` : ""}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-gris">
                        {f.total === 0 ? "Sin requisitos" : `${f.subidos} de ${f.total} documentos`}
                      </span>
                      <span className="font-extrabold tabular-nums text-tinta">{f.porcentaje}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-borde">
                      <div
                        className={`h-full rounded-full transition-[width] ${
                          completa || f.porcentaje === 100 ? "bg-emerald-500" : "bg-cian"
                        }`}
                        style={{ width: `${f.porcentaje}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                    <ChipDeEtapa etapa={f.etapa} />
                    {f.vencidos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700">
                        <IconAlertTriangle size={13} />
                        {f.vencidos} {f.vencidos === 1 ? "vencido" : "vencidos"}
                      </span>
                    )}
                    {f.porVencer > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                        <IconCalendarDue size={13} />
                        {f.porVencer} por vencer
                      </span>
                    )}
                    {f.diasTermino !== null && f.diasTermino <= 30 && (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                        {f.diasTermino < 0
                          ? "Contrato terminado"
                          : f.diasTermino === 0
                            ? "Contrato termina hoy"
                            : `Contrato termina en ${f.diasTermino} d`}
                      </span>
                    )}

                    {/* z-10 para recibir el clic antes que el enlace estirado.
                        Solo administradores: dar de baja conserva el expediente
                        y es lo que corresponde casi siempre; esto lo borra. */}
                    {esAdmin && (
                      <span className="relative z-10 flex flex-wrap items-center justify-end gap-1">
                        <BotonEliminarPersona
                          compacto
                          personaId={f.id}
                          nombre={f.nombre}
                          tieneCarpeta={f.tieneCarpeta}
                        />
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
