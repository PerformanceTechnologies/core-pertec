"use client";

import { useMemo, useState } from "react";
import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue, IconSearch } from "@tabler/icons-react";
import BotonEliminarVehiculo from "./BotonEliminarVehiculo";
import ChipDeEtapaDeVehiculo from "./ChipDeEtapaDeVehiculo";
import { CAMPO_COMPACTO, TARJETA } from "@/lib/contratos/estilos";
import { ETIQUETAS_ETAPA_VEHICULO, formatearPatente, type EtapaVehiculo } from "@/lib/contratos/vehiculos-modelo";

export interface FilaDeFlota {
  id: string;
  numero: number;
  patente: string;
  /** «Toyota Hilux», o vacío si no se anotó. */
  descripcion: string;
  categoriaId: string;
  categoria: string;
  conductor: string | null;
  faena: string | null;
  activo: boolean;
  etapa: EtapaVehiculo;
  porcentaje: number;
  subidos: number;
  total: number;
  vencidos: number;
  porVencer: number;
  /** Para el aviso al eliminar: si borrarla se lleva también su carpeta. */
  tieneCarpeta: boolean;
}

/** Sin acentos ni mayúsculas, para que «hilux» encuentre «Hilux» y «camion» a «Camión». */
function plano(texto: string): string {
  // ̀–ͯ es el bloque de acentos combinantes que deja NFD al separarlos.
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * La flota: una fila por vehículo, con su avance y lo que le falta.
 *
 * Filtra en el navegador. Son decenas de vehículos, no miles, y filtrar al instante mientras se
 * escribe vale más que ir al servidor por cada tecla. Es el hermano de ListaDeNomina.
 *
 * En el celular cada fila es una tarjeta apilada; en pantalla ancha, una fila de columnas. Es el
 * mismo marcado con otro `grid`, no dos listas distintas.
 */
export default function ListaDeFlota({
  filas,
  categorias,
  esAdmin,
}: {
  filas: FilaDeFlota[];
  categorias: { id: string; nombre: string }[];
  /** Eliminar una ficha es de administradores: borra documentos e historial. */
  esAdmin: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState("");
  const [etapa, setEtapa] = useState<EtapaVehiculo | "">("");
  const [conAlertas, setConAlertas] = useState(false);
  const [conBajas, setConBajas] = useState(false);

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    // La patente se compara sin guion ni espacios: «bcdf 12», «BCDF-12» y «bcdf12» son la misma.
    const qPatente = q.replace(/[^a-z0-9]/g, "");
    return filas.filter((f) => {
      if (!conBajas && !f.activo) return false;
      if (categoria && f.categoriaId !== categoria) return false;
      if (etapa && f.etapa !== etapa) return false;
      if (conAlertas && f.vencidos + f.porVencer === 0) return false;
      if (q) {
        const enPatente = qPatente !== "" && f.patente.toLowerCase().includes(qPatente);
        const enTexto = plano([f.descripcion, f.conductor ?? "", f.categoria].join(" ")).includes(q);
        if (!enPatente && !enTexto) return false;
      }
      return true;
    });
  }, [filas, busqueda, categoria, etapa, conAlertas, conBajas]);

  return (
    <div>
      {/* Todos los filtros en UNA fila (se parte en dos en el celular): el buscador, los dos
          desplegables y los dos interruptores en línea. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-[1_1_14rem]">
          <span className="sr-only">Buscar por patente, marca, modelo o conductor</span>
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por patente, marca o conductor"
            className={`${CAMPO_COMPACTO} pl-9`}
          />
        </label>

        <label className="min-w-0 flex-[1_1_9rem] lg:max-w-[11rem]">
          <span className="sr-only">Tipo de vehículo</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CAMPO_COMPACTO}>
            <option value="">Todos los tipos</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 flex-[1_1_9rem] lg:max-w-[11rem]">
          <span className="sr-only">Etapa</span>
          <select
            value={etapa}
            onChange={(e) => setEtapa(e.target.value as EtapaVehiculo | "")}
            className={CAMPO_COMPACTO}
          >
            <option value="">Todas las etapas</option>
            {(Object.keys(ETIQUETAS_ETAPA_VEHICULO) as EtapaVehiculo[]).map((k) => (
              <option key={k} value={k}>
                {ETIQUETAS_ETAPA_VEHICULO[k]}
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
        {visibles.length} de {filas.length} {filas.length === 1 ? "vehículo" : "vehículos"}
      </p>

      {visibles.length === 0 ? (
        <div className={`${TARJETA} mt-3 p-10 text-center`}>
          <p className="text-sm font-semibold text-tinta">
            {filas.length === 0 ? "Todavía no hay vehículos en la flota" : "Ningún vehículo coincide"}
          </p>
          <p className="mt-1 text-xs text-gris">
            {filas.length === 0 ? "Da de alta el primero con «Nuevo vehículo»." : "Prueba quitando algún filtro."}
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {visibles.map((f) => {
            const completa = f.etapa === "acreditado";
            return (
              <li key={f.id}>
                {/* La tarjeta es un <div> y el enlace se estira sobre ella con after:inset-0:
                    envolver todo en un <a> dejaría el botón de eliminar DENTRO del enlace, y un
                    <button> en un <a> es HTML inválido. Mismo patrón que TarjetaDeCarpeta. */}
                <div
                  className={`${TARJETA} group relative grid grid-cols-1 gap-x-4 gap-y-3 p-4 transition hover:border-cian md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center ${
                    f.activo ? "" : "opacity-60"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2">
                      <span className="text-[11px] font-bold tabular-nums text-gris-suave">#{f.numero}</span>
                      <Link
                        href={`/contratos/acreditacion-vehiculos/${f.id}`}
                        className="truncate text-sm font-bold text-azul after:absolute after:inset-0 after:content-['']"
                      >
                        {formatearPatente(f.patente)}
                      </Link>
                      {!f.activo && (
                        <span className="rounded-full bg-borde px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gris">
                          Baja
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gris">
                      {[f.descripcion, f.categoria, f.conductor, f.faena].filter(Boolean).join(" · ")}
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
                    <ChipDeEtapaDeVehiculo etapa={f.etapa} />
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

                    {/* z-10 para recibir el clic antes que el enlace estirado. Solo
                        administradores: dar de baja conserva el expediente y es lo que
                        corresponde casi siempre; esto lo borra. */}
                    {esAdmin && (
                      <span className="relative z-10 flex flex-wrap items-center justify-end gap-1">
                        <BotonEliminarVehiculo
                          compacto
                          vehiculoId={f.id}
                          nombre={formatearPatente(f.patente)}
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
