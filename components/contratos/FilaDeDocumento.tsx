"use client";

import { useRef, useState, useTransition } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconExternalLink,
  IconMinus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useSoltarArchivos } from "./useSoltarArchivos";
import RuedaCarga from "./RuedaCarga";
import { usePuede } from "./PermisosDelUsuario";
import { CAMPO } from "@/lib/contratos/estilos";
import {
  DIAS_AVISO_VENCIMIENTO,
  ETIQUETAS_DOCUMENTO,
  diasHasta,
  estadoVisible,
  fechaCorta,
  type ArchivoDeDocumento,
  type DocumentoPersona,
  type EstadoDocumento,
  type EstadoVisible,
} from "@/lib/contratos/acreditacion-modelo";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import {
  TERMINOS_DE_PERSONA,
  type AccionesDeDocumento,
  type TerminosDeDocumento,
} from "@/lib/contratos/acciones-de-documento";

const ESTILO: Record<EstadoVisible, { chip: string; icono: React.ReactNode }> = {
  pendiente: {
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    icono: <IconClock size={15} />,
  },
  cargado: {
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icono: <IconCheck size={15} />,
  },
  observado: {
    chip: "border-red-200 bg-red-50 text-red-700",
    icono: <IconAlertTriangle size={15} />,
  },
  vencido: {
    chip: "border-red-200 bg-red-50 text-red-700",
    icono: <IconAlertTriangle size={15} />,
  },
  no_aplica: { chip: "border-borde bg-fondo text-gris", icono: <IconMinus size={15} /> },
};

const ESTADOS_ELEGIBLES: EstadoDocumento[] = ["pendiente", "cargado", "observado", "no_aplica"];

export interface TipoParaFila {
  id: string;
  nombre: string;
  tieneVencimiento: boolean;
}

/**
 * Un documento del checklist de una persona o de un vehículo: su estado, subirlo y, desplegado,
 * corregir el estado, las fechas y la nota.
 *
 * Subir es lo que más se hace, así que es el botón que está siempre a la vista.
 * El resto —estado a mano, fechas, nota— es ocasional y vive detrás del
 * desplegable: ocho botones por fila, con veinte filas, hacen ilegible la lista
 * justo en el celular, que es donde más se va a usar.
 */
export default function FilaDeDocumento({
  personaId,
  acciones,
  terminos = TERMINOS_DE_PERSONA,
  tipo,
  doc,
  requerido,
  delCargo,
  hoy,
}: {
  /** El id de lo que se acredita: la persona o el vehículo (el nombre es de cuando solo había personas). */
  personaId: string;
  /** Las acciones del submódulo de turno: cada una escribe en SUS tablas. */
  acciones: AccionesDeDocumento;
  terminos?: TerminosDeDocumento;
  tipo: TipoParaFila;
  doc: DocumentoPersona | null;
  /** ¿Cuenta para el avance de esta persona? */
  requerido: boolean;
  /** ¿Lo pide su cargo? Si no, es un "pedir también" puesto a mano. */
  delCargo: boolean;
  hoy: string;
}) {
  // Cambiar el estado, quitar archivos o marcar «también pedirlo» es editar; subir y anotar fechas no.
  const puedeEditar = usePuede("editar");
  const entrada = useRef<HTMLInputElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [subiendo, setSubiendo] = useState<{ nombre: string; avance: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [emision, setEmision] = useState(doc?.fechaEmision ?? "");
  const [vencimiento, setVencimiento] = useState(doc?.fechaVencimiento ?? "");
  const [nota, setNota] = useState(doc?.nota ?? "");

  const visible = estadoVisible(doc ?? undefined, hoy);
  const estilo = ESTILO[visible];
  const dias = diasHasta(doc?.fechaVencimiento, hoy);

  const ocupada = pendiente || subiendo !== null;
  const [eliminando, setEliminando] = useState<string | null>(null);

  function eliminarArchivo(archivo: ArchivoDeDocumento) {
    const aviso =
      `¿Eliminar «${archivo.nombre}»?\n\n` +
      "También se elimina en SharePoint: va a la papelera del sitio, de donde se puede restaurar.";
    if (!window.confirm(aviso)) return;

    setError(null);
    setEliminando(archivo.id);
    iniciar(async () => {
      try {
        const resultado = await acciones.eliminarArchivo(personaId, archivo.id);
        if (resultado.error) setError(resultado.error);
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar el archivo."));
      } finally {
        setEliminando(null);
      }
    });
  }

  function ejecutar(tarea: () => Promise<void>) {
    setError(null);
    iniciar(async () => {
      try {
        await tarea();
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo guardar."));
      }
    });
  }

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);

    // De a uno, como en Contratos: en paralelo el ancho de subida se reparte y
    // ninguno parece avanzar.
    try {
      for (const archivo of Array.from(archivos)) {
        setSubiendo({ nombre: archivo.name, avance: 0 });

        // Las dos acciones DEVUELVEN su error en vez de lanzarlo, así que acá se
        // mira. Lanzado, Next lo reemplazaría por un texto de React antes de que
        // llegue — que es justo lo que se veía en pantalla.
        const preparada = await acciones.prepararSubida(personaId, tipo.id, archivo.name);
        // Se mira la URL y no el error: con `error: string` en la unión,
        // TypeScript no puede descartar una cadena vacía y no estrecha el tipo.
        if (!preparada.url) return setError(preparada.error ?? "No se pudo preparar la subida.");

        const creado = await subirPorTrozos(preparada.url, archivo, (avance) =>
          setSubiendo({ nombre: archivo.name, avance }),
        );

        const registro = await acciones.registrarSubida(personaId, tipo.id, creado.id);
        if (registro.error) return setError(registro.error);
      }
      // Lo que se acaba de subir y vence: lo normal es querer ponerle la fecha
      // ahora, mientras uno tiene el documento a la vista.
      if (tipo.tieneVencimiento && !vencimiento) setAbierta(true);
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo subir el archivo."));
    } finally {
      setSubiendo(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  // Soltar archivos sobre la fila los sube a ESTE documento, igual que el botón. Es lo que la
  // gente intenta primero, y antes el navegador abría el archivo y sacaba a la persona del core.
  const soltar = useSoltarArchivos((archivos) => void subir(archivos), visible !== "no_aplica" && !ocupada);

  const mensajeFecha = !doc
    ? null
    : doc.estado === "cargado" && tipo.tieneVencimiento && !doc.fechaVencimiento
      ? { texto: "Falta indicar el vencimiento", alerta: true }
      : dias === null || doc.estado !== "cargado"
        ? null
        : dias < 0
          ? { texto: `Venció hace ${-dias} ${-dias === 1 ? "día" : "días"}`, alerta: true }
          : dias <= DIAS_AVISO_VENCIMIENTO
            ? { texto: dias === 0 ? "Vence hoy" : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`, alerta: true }
            : { texto: `Vence el ${fechaCorta(doc.fechaVencimiento)}`, alerta: false };

  return (
    <li
      {...soltar.props}
      className={`relative rounded-xl border bg-superficie transition ${
        soltar.encima ? "border-cian ring-2 ring-cian/40" : "border-borde"
      } ${requerido ? "" : "opacity-80"}`}
    >
      {soltar.encima && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-cian-lavado/90">
          <span className="flex items-center gap-2 text-sm font-bold text-azul">
            <IconUpload size={18} />
            Suelta para subir a «{tipo.nombre}»
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${estilo.chip}`}
          aria-hidden
        >
          {estilo.icono}
        </span>

        <div className="min-w-0 flex-1 basis-40">
          <p className="text-sm font-semibold leading-snug text-tinta">
            {tipo.nombre}
            {!requerido && (
              <span className="ml-2 rounded-full bg-borde px-1.5 py-0.5 align-middle text-[9px] font-bold uppercase tracking-wide text-gris">
                {terminos.noLoPide}
              </span>
            )}
          </p>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gris">
            {doc?.archivoUrl ? (
              <a
                href={doc.archivoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 text-azul hover:underline"
              >
                <span className="truncate">{doc.archivoNombre ?? "Ver archivo"}</span>
                <IconExternalLink size={12} className="shrink-0" />
              </a>
            ) : (
              <span className="text-gris-suave">Sin archivo</span>
            )}
            {doc && doc.cantidadArchivos > 1 && <span>· {doc.cantidadArchivos} archivos</span>}
            {mensajeFecha && (
              <span className={mensajeFecha.alerta ? "font-semibold text-amber-600" : ""}>
                · {mensajeFecha.texto}
              </span>
            )}
          </p>
        </div>

        <span
          className={`inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${estilo.chip}`}
        >
          {ETIQUETAS_DOCUMENTO[visible]}
        </span>

        {visible !== "no_aplica" && (
          <>
            <input
              ref={entrada}
              type="file"
              multiple
              // PDF e imágenes primero: en el celular, un accept con imágenes es lo
              // que ofrece abrir la cámara además de la galería.
              accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => void subir(e.target.files)}
            />
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={ocupada}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-azul px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:cursor-progress disabled:opacity-60"
            >
              {subiendo ? <RuedaCarga className="h-3.5 w-3.5" /> : <IconUpload size={15} />}
              {doc?.archivoUrl ? "Subir otro" : "Subir"}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setAbierta((a) => !a)}
          aria-expanded={abierta}
          aria-label={abierta ? "Ocultar detalles" : "Ver detalles"}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-borde text-gris transition hover:border-cian hover:text-azul"
        >
          <IconChevronDown size={16} className={`transition ${abierta ? "rotate-180" : ""}`} />
        </button>
      </div>

      {subiendo && (
        <div className="px-3 pb-3">
          <div className="flex items-center justify-between gap-2 text-[11px] text-gris">
            <span className="truncate">{subiendo.nombre}</span>
            <span className="tabular-nums">{subiendo.avance}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-borde">
            <div className="h-full bg-cian transition-[width]" style={{ width: `${subiendo.avance}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="px-3 pb-3 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      )}

      {abierta && (
        <div className="space-y-4 border-t border-borde bg-fondo/50 p-3">
          {doc && doc.archivos.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">
                Archivos ({doc.archivos.length})
              </p>
              <ul className="divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
                {doc.archivos.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1 text-sm text-azul hover:underline"
                      >
                        <span className="truncate">{a.nombre}</span>
                        <IconExternalLink size={12} className="shrink-0" />
                      </a>
                      <p className="text-[11px] text-gris-suave">
                        {a.subidoPorNombre ? `${a.subidoPorNombre}, ` : ""}
                        {fechaCorta(a.subidoEn)}
                      </p>
                    </div>
                    {puedeEditar && (
                      <button
                        type="button"
                        onClick={() => eliminarArchivo(a)}
                        disabled={ocupada}
                        aria-label={`Eliminar ${a.nombre}`}
                        title="Eliminar (también en SharePoint)"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      >
                        {eliminando === a.id ? <RuedaCarga className="h-4 w-4" /> : <IconTrash size={17} />}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-gris-suave">
                Eliminar un archivo lo manda a la papelera de SharePoint. Si era el único, el
                documento vuelve a «Pendiente».
              </p>
            </div>
          )}

          {puedeEditar && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gris">Estado</p>
            <div className="flex flex-wrap gap-1.5">
              {ESTADOS_ELEGIBLES.map((e) => {
                const activo = (doc?.estado ?? "pendiente") === e;
                return (
                  <button
                    key={e}
                    type="button"
                    disabled={ocupada}
                    aria-pressed={activo}
                    onClick={() =>
                      !activo && ejecutar(() => acciones.cambiarEstado(personaId, tipo.id, e))
                    }
                    className={`min-h-11 rounded-lg border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
                      activo
                        ? ESTILO[e].chip
                        : "border-borde text-gris-suave hover:border-cian hover:text-azul"
                    }`}
                  >
                    {ETIQUETAS_DOCUMENTO[e]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-gris-suave">
              «No aplica» saca este documento {terminos.avanceDe}.
            </p>
          </div>
          )}

          {!delCargo && puedeEditar && (
            <label className="flex items-center gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                checked={requerido}
                disabled={ocupada}
                onChange={(e) =>
                  ejecutar(() => acciones.cambiarRequeridoExtra(personaId, tipo.id, e.target.checked))
                }
                className="h-4 w-4 rounded border-borde text-azul focus:ring-cian"
              />
              {terminos.pedirTambien}
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {tipo.tieneVencimiento && (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
                    Fecha de emisión
                  </span>
                  <input
                    type="date"
                    value={emision}
                    onChange={(e) => setEmision(e.target.value)}
                    className={CAMPO}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
                    Fecha de vencimiento
                  </span>
                  <input
                    type="date"
                    value={vencimiento}
                    onChange={(e) => setVencimiento(e.target.value)}
                    className={CAMPO}
                  />
                </label>
              </>
            )}
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
                Nota
              </span>
              <input
                type="text"
                value={nota}
                maxLength={500}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Por ejemplo: viene sin firma, se pidió de nuevo…"
                className={CAMPO}
              />
            </label>
          </div>

          <button
            type="button"
            disabled={ocupada}
            onClick={() =>
              ejecutar(() =>
                acciones.guardarDetalle(personaId, tipo.id, {
                  fechaEmision: emision,
                  fechaVencimiento: vencimiento,
                  nota,
                }),
              )
            }
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian disabled:opacity-60"
          >
            {pendiente && <RuedaCarga className="h-3.5 w-3.5" />}
            Guardar detalle
          </button>

          {doc?.actualizadoPorNombre && (
            <p className="text-[11px] text-gris-suave">
              Último cambio: {doc.actualizadoPorNombre}
              {doc.actualizadoEn ? `, ${fechaCorta(doc.actualizadoEn)}` : ""}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
