"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconExternalLink, IconPaperclip, IconTrash } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import type { ArchivoParaMostrar } from "./DocumentosDePartida";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import {
  eliminarArchivoDeCotizacionAction,
  prepararSubidaDeCotizacionAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-gastos";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

/**
 * Los archivos de UNA cotización: el PDF del proveedor, el correo, la foto del presupuesto.
 *
 * Viven en una subcarpeta propia dentro de la carpeta de la línea en SharePoint, así que cada
 * cotización tiene los suyos sin mezclarse con los de las demás. La lista sale de SharePoint cada
 * vez que se carga la ficha, igual que los documentos de la línea: lo que se suba o se elimine allá
 * se ve acá sin sincronizar nada.
 */
export default function ArchivosDeCotizacion({
  cotizacionId,
  archivos,
  carpetaUrl,
  errorDeLectura,
  conectado,
}: {
  cotizacionId: string;
  archivos: ArchivoParaMostrar[];
  carpetaUrl: string | null;
  errorDeLectura?: string | null;
  /** Si quien mira ya conectó su cuenta con SharePoint: sin eso no se puede subir ni listar. */
  conectado: boolean;
}) {
  const puedeEditar = usePuede("editar");
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<{ nombre: string; avance: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const ocupado = subiendo !== null || pendiente;

  async function subir(seleccion: FileList | null) {
    if (!seleccion || seleccion.length === 0) return;
    setError(null);
    try {
      // De a uno: en paralelo el ancho de subida se reparte y ninguno parece avanzar.
      for (const archivo of Array.from(seleccion)) {
        setSubiendo({ nombre: archivo.name, avance: 0 });
        const { url } = await prepararSubidaDeCotizacionAction(cotizacionId, archivo.name);
        await subirPorTrozos(url, archivo, (avance) => setSubiendo({ nombre: archivo.name, avance }));
      }
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo subir el archivo."));
    } finally {
      setSubiendo(null);
      if (entrada.current) entrada.current.value = "";
      // Aunque haya fallado el segundo de tres, el primero ya está en SharePoint.
      router.refresh();
    }
  }

  function eliminar(a: ArchivoParaMostrar) {
    if (!window.confirm(`¿Eliminar «${a.nombre}»?\n\nTambién se elimina en SharePoint: va a la papelera del sitio.`)) return;
    setError(null);
    setEliminando(a.id);
    iniciar(async () => {
      try {
        const r = await eliminarArchivoDeCotizacionAction(cotizacionId, a.id);
        if (r.error) setError(r.error);
        else router.refresh();
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar el archivo."));
      } finally {
        setEliminando(null);
      }
    });
  }

  return (
    <div className="mt-3 border-t border-borde pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-gris">
          Archivos{archivos.length > 0 ? ` (${archivos.length})` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {carpetaUrl && (
            <a
              href={carpetaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-azul hover:underline"
            >
              Abrir carpeta
              <IconExternalLink size={12} />
            </a>
          )}
          {conectado && (
            <>
              <input
                ref={entrada}
                type="file"
                multiple
                // PDF e imágenes primero: en el celular, un accept con imágenes ofrece abrir la cámara
                // además de la galería (una foto del presupuesto que mandaron por WhatsApp).
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.zip,.eml,.msg"
                className="hidden"
                onChange={(e) => void subir(e.target.files)}
              />
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={ocupado}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-borde px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian disabled:opacity-60"
              >
                {subiendo ? <RuedaCarga className="h-3.5 w-3.5" /> : <IconPaperclip size={14} />}
                Subir
              </button>
            </>
          )}
        </div>
      </div>

      {subiendo && (
        <div className="mt-2 rounded-lg border border-borde bg-fondo/60 px-3 py-2" role="status">
          <div className="flex items-center justify-between gap-2 text-[11px] text-gris">
            <span className="truncate">{subiendo.nombre}</span>
            <span className="tabular-nums">{subiendo.avance}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-borde">
            <div className="h-full bg-cian transition-[width]" style={{ width: `${subiendo.avance}%` }} />
          </div>
        </div>
      )}

      {(error || errorDeLectura) && (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
          {error ?? errorDeLectura}
        </p>
      )}

      {!conectado ? (
        <p className="mt-2 text-[11px] text-gris-suave">
          Para ver y subir archivos hay que conectar tu cuenta con SharePoint (el botón está arriba, en Documentos).
        </p>
      ) : archivos.length > 0 ? (
        <ul className="mt-2 divide-y divide-borde overflow-hidden rounded-lg border border-borde">
          {archivos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-1.5">
              <div className="min-w-0 flex-1">
                <a
                  href={a.webUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1 text-sm font-semibold text-azul hover:underline"
                >
                  <span className="truncate">{a.nombre}</span>
                  <IconExternalLink size={12} className="shrink-0" />
                </a>
                <p className="text-[11px] text-gris-suave">
                  {a.peso}
                  {a.subidoPor ? ` · ${a.subidoPor}` : ""}
                  {a.fecha ? ` · ${a.fecha}` : ""}
                </p>
              </div>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => eliminar(a)}
                  disabled={ocupado}
                  aria-label={`Eliminar ${a.nombre}`}
                  title="Eliminar (también en SharePoint)"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                >
                  {eliminando === a.id ? <RuedaCarga className="h-4 w-4" /> : <IconTrash size={16} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !errorDeLectura && (
          <p className="mt-2 text-[11px] text-gris-suave">
            Sin archivos todavía. Sube el PDF de la cotización o el correo del proveedor.
          </p>
        )
      )}
    </div>
  );
}
