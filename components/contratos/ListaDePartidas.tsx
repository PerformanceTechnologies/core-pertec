"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "@/components/contratos/Enlace";
import {
  IconAlertTriangle,
  IconCalendar,
  IconExternalLink,
  IconFolder,
  IconLink,
  IconSearch,
  IconUser,
} from "@tabler/icons-react";
import { CAMPO } from "@/lib/contratos/estilos";
import { fechaCorta } from "@/lib/contratos/acreditacion-modelo";
import {
  MODULOS,
  faseDe,
  formatearPesos,
  type Fase,
  type ModuloArranque,
} from "@/lib/contratos/arranque-modelo";
import { cambiarEstadoDePartidaAction } from "@/app/(protegido)/contratos/[contrato]/acciones-partidas";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

export interface FilaDePartida {
  id: string;
  descripcion: string;
  categoriaId: string;
  categoria: string;
  proveedor: string | null;
  referencia: string | null;
  estado: string;
  fecha: string | null;
  montoPresupuestado: number | null;
  montoReal: number | null;
  enlace: string | null;
  /** La carpeta de la partida en SharePoint; nula hasta que se sube el primer documento. */
  carpetaUrl: string | null;
  responsable: string | null;
  /** Atrasada (logística) o sobre presupuesto (gastos), ya calculado en el servidor. */
  alerta: boolean;
  /** Lo que la relaciona con el otro módulo: lo que ella apunta y lo que la apunta. */
  vinculos?: { texto: string; href: string }[];
}

/** El estado visual (el color de la franja y del chip) que corresponde a cada fase. */
const VISUAL_DE_FASE: Record<Fase, string> = {
  inicio: "sin",
  curso: "curso",
  final: "completa",
  fuera: "vacia",
};

/**
 * La lista de partidas de un módulo, con filtros.
 *
 * Los filtros son del navegador y no de la base: son decenas o cientos de filas que ya
 * llegaron enteras, y filtrar al teclear tiene que ser instantáneo. Si algún día pasan
 * de unos pocos miles, es el momento de paginar en el servidor.
 *
 * El estado se cambia desde la fila, sin abrir la partida: es lo que más se hace
 * (pasar de «Solicitado» a «Confirmado») y entrar a un formulario para eso era un
 * viaje de más. Si el servidor falla vuelve al valor anterior y lo dice.
 */
export default function ListaDePartidas({
  modulo,
  filas,
  categorias,
}: {
  modulo: ModuloArranque;
  filas: FilaDePartida[];
  categorias: { id: string; nombre: string }[];
}) {
  const puedeEditar = usePuede("editar");
  const config = MODULOS[modulo];
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("");
  const [soloAlertas, setSoloAlertas] = useState(false);

  // Los estados cambiados desde acá, por encima de lo que llegó del servidor: la fila
  // refleja el cambio al instante y no espera a que la página se vuelva a pedir.
  const [cambiados, setCambiados] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const estadoDe = (f: FilaDePartida) => cambiados[f.id] ?? f.estado;

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return filas.filter((f) => {
      if (categoria && f.categoriaId !== categoria) return false;
      if (estado && (cambiados[f.id] ?? f.estado) !== estado) return false;
      if (soloAlertas && !f.alerta) return false;
      if (!q) return true;
      return [f.descripcion, f.proveedor, f.referencia, f.categoria, f.responsable]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [filas, cambiados, texto, categoria, estado, soloAlertas]);

  function cambiarEstado(fila: FilaDePartida, nuevo: string) {
    const anterior = estadoDe(fila);
    setCambiados((c) => ({ ...c, [fila.id]: nuevo }));
    setError(null);

    iniciar(async () => {
      try {
        const resultado = await cambiarEstadoDePartidaAction(modulo, fila.id, nuevo);
        if (resultado.error) throw new Error(resultado.error);
      } catch (e) {
        setCambiados((c) => ({ ...c, [fila.id]: anterior }));
        setError(mensajeDeError(e, "No se pudo cambiar el estado."));
      }
    });
  }

  const hayFiltros = Boolean(texto || categoria || estado || soloAlertas);

  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_14rem_12rem_auto]">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Buscar</span>
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-suave"
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={`Buscar por descripción, proveedor o referencia`}
            className={`${CAMPO} pl-9`}
          />
        </label>

        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoría"
          className={CAMPO}
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>

        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Estado"
          className={CAMPO}
        >
          <option value="">Todos los estados</option>
          {config.estados.map((e) => (
            <option key={e.clave} value={e.clave}>
              {e.etiqueta}
            </option>
          ))}
        </select>

        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-borde bg-superficie px-3 text-xs font-bold uppercase tracking-wide text-gris">
          <input
            type="checkbox"
            checked={soloAlertas}
            onChange={(e) => setSoloAlertas(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-azul)]"
          />
          Solo {config.etiquetaAlerta}
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <IconAlertTriangle size={15} className="shrink-0" />
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-gris" aria-live="polite">
        {visibles.length === filas.length
          ? `${filas.length} ${filas.length === 1 ? config.singular : config.plural}`
          : `${visibles.length} de ${filas.length} ${config.plural}`}
      </p>

      {visibles.length === 0 ? (
        <div className="mt-3 rounded-xl border border-borde bg-superficie p-8 text-center shadow-[var(--sombra-tarjeta)]">
          <p className="text-sm font-semibold text-tinta">
            {hayFiltros
              ? "Ningún resultado con esos filtros"
              : `Todavía no hay ${config.plural} registrados`}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gris">
            {hayFiltros
              ? "Prueba quitando alguno."
              : `Agrega el primero con «Nuevo ${config.singular}».`}
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
          {visibles.map((f) => {
            const actual = estadoDe(f);
            const fase = faseDe(modulo, actual);
            const visual = f.alerta && fase !== "final" && fase !== "fuera" ? "alerta" : VISUAL_DE_FASE[fase];
            const sobre = modulo === "gastos" && f.alerta;

            return (
              <li
                key={f.id}
                data-estado={visual}
                className="fila-estado flex flex-col gap-2 py-3 pl-5 pr-4 lg:grid lg:grid-cols-[minmax(0,1fr)_9rem_11rem_11rem] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`${config.ruta}/${f.id}`}
                    className="titular block text-sm leading-snug text-azul [overflow-wrap:anywhere] hover:underline"
                  >
                    {f.descripcion}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gris">
                    <span className="font-bold">{f.categoria}</span>
                    {f.proveedor && <span>· {f.proveedor}</span>}
                    {f.referencia && <span>· {f.referencia}</span>}
                    {f.responsable && (
                      <span className="inline-flex items-center gap-0.5">
                        · <IconUser size={11} aria-hidden /> {f.responsable}
                      </span>
                    )}
                    {f.carpetaUrl && (
                      <a
                        href={f.carpetaUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir la carpeta en SharePoint"
                        className="inline-flex items-center gap-0.5 font-bold text-cian-texto hover:text-azul"
                      >
                        · carpeta <IconFolder size={11} aria-hidden />
                      </a>
                    )}
                    {f.enlace && (
                      <a
                        href={f.enlace}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Abrir el respaldo"
                        className="inline-flex items-center gap-0.5 font-bold text-cian-texto hover:text-azul"
                      >
                        · respaldo <IconExternalLink size={11} aria-hidden />
                      </a>
                    )}
                  </p>
                  {f.vinculos && f.vinculos.length > 0 && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                      {f.vinculos.map((v) => (
                        <Link key={v.href} href={v.href} className="inline-flex items-center gap-1 font-semibold text-azul hover:underline">
                          <IconLink size={11} aria-hidden />
                          {v.texto}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>

                <div className="text-xs text-gris">
                  {f.fecha ? (
                    <span
                      className={`inline-flex items-center gap-1 ${
                        modulo === "logistica" && f.alerta ? "font-bold text-red-600" : ""
                      }`}
                    >
                      <IconCalendar size={13} aria-hidden />
                      {fechaCorta(f.fecha)}
                      {modulo === "logistica" && f.alerta && " · atrasado"}
                    </span>
                  ) : (
                    <span className="text-gris-suave">Sin fecha</span>
                  )}
                </div>

                <div className="text-xs tabular-nums">
                  {f.montoPresupuestado === null && f.montoReal === null ? (
                    <span className="text-gris-suave">Sin monto</span>
                  ) : (
                    <>
                      <p className="text-gris">
                        {config.etiquetaPresupuesto}:{" "}
                        <span className="font-bold text-tinta">{formatearPesos(f.montoPresupuestado)}</span>
                      </p>
                      {f.montoReal !== null && (
                        <p className="text-gris">
                          {config.etiquetaReal}:{" "}
                          <span className={`font-bold ${sobre ? "text-red-600" : "text-tinta"}`}>
                            {formatearPesos(f.montoReal)}
                          </span>
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={actual}
                    disabled={!puedeEditar}
                    onChange={(e) => cambiarEstado(f, e.target.value)}
                    aria-label={`Estado de ${f.descripcion}`}
                    className="min-h-11 w-full rounded-lg border border-borde bg-superficie px-2.5 text-xs font-bold text-tinta transition hover:border-cian focus:border-cian focus:outline-none disabled:cursor-default disabled:opacity-70 disabled:hover:border-borde"
                  >
                    {config.estados.map((e) => (
                      <option key={e.clave} value={e.clave}>
                        {e.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
