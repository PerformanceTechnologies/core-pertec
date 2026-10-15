"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconExternalLink, IconFolder, IconTrash, IconUpload } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { MODULOS, type ModuloArranque } from "@/lib/contratos/arranque-modelo";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import {
  eliminarArchivoDePartidaAction,
  prepararSubidaDePartidaAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-partidas";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import { usePuede } from "./PermisosDelUsuario";

export interface ArchivoParaMostrar {
  id: string;
  nombre: string;
  /** Ya formateado en el servidor: este componente no importa lib/sharepoint (es de servidor). */
  peso: string;
  fecha: string;
  subidoPor: string | null;
  webUrl: string;
}

/**
 * Los documentos de una partida: lo que hay en su carpeta de SharePoint, y subir más.
 *
 * La lista sale de SharePoint cada vez que se carga la ficha, no de una copia en la
 * base: lo que alguien deja directo en la carpeta aparece acá, y lo que se elimina allá
 * deja de aparecer, sin sincronizar nada. Tras subir o eliminar se recarga la ficha.
 */
export default function DocumentosDePartida({
  modulo,
  partidaId,
  archivos,
  carpetaUrl,
  errorDeLectura,
}: {
  modulo: ModuloArranque;
  partidaId: string;
  archivos: ArchivoParaMostrar[];
  carpetaUrl: string | null;
  /** Si SharePoint no dejó leer la carpeta, el motivo: se muestra en vez de una lista vacía. */
  errorDeLectura?: string | null;
}) {
  const puedeEditar = usePuede("editar");
  const config = MODULOS[modulo];
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

    // De a uno: en paralelo el ancho de subida se reparte y ninguno parece avanzar.
    try {
      for (const archivo of Array.from(seleccion)) {
        setSubiendo({ nombre: archivo.name, avance: 0 });
        const { url } = await prepararSubidaDePartidaAction(modulo, partidaId, archivo.name);
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

  function eliminar(archivo: ArchivoParaMostrar) {
    const aviso =
      `¿Eliminar «${archivo.nombre}»?\n\n` +
      "También se elimina en SharePoint: va a la papelera del sitio, de donde se puede restaurar.";
    if (!window.confirm(aviso)) return;

    setError(null);
    setEliminando(archivo.id);
    iniciar(async () => {
      try {
        const resultado = await eliminarArchivoDePartidaAction(modulo, partidaId, archivo.id);
        if (resultado.error) setError(resultado.error);
        else router.refresh();
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo eliminar el archivo."));
      } finally {
        setEliminando(null);
      }
    });
  }

  return (
    <section aria-labelledby="documentos-titulo" className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="documentos-titulo" className="titular text-lg text-azul">
            Documentos
          </h2>
          <p className="text-xs text-gris">
            Se guardan en SharePoint, en la carpeta de este {config.singular}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {carpetaUrl && (
            <a
              href={carpetaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-borde px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-azul transition hover:border-cian"
            >
              <IconFolder size={15} />
              Abrir carpeta
              <IconExternalLink size={12} />
            </a>
          )}
          <input
            ref={entrada}
            type="file"
            multiple
            // PDF e imágenes primero: en el celular, un accept con imágenes es lo que
            // ofrece abrir la cámara además de la galería (una foto de la factura).
            accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.zip"
            className="hidden"
            onChange={(e) => void subir(e.target.files)}
          />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-azul px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:cursor-progress disabled:opacity-60"
          >
            {subiendo ? <RuedaCarga className="h-3.5 w-3.5" /> : <IconUpload size={15} />}
            Subir documentos
          </button>
        </div>
      </div>

      {subiendo && (
        <div className="mt-3 rounded-lg border border-borde bg-superficie px-3 py-2.5">
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
        <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
          {error ?? errorDeLectura}
        </p>
      )}

      {archivos.length > 0 ? (
        <ul className="mt-3 divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie shadow-[var(--sombra-tarjeta)]">
          {archivos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                >
                  {eliminando === a.id ? <RuedaCarga className="h-4 w-4" /> : <IconTrash size={17} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !errorDeLectura && (
          <p className="mt-3 rounded-xl border border-dashed border-borde bg-superficie/60 p-5 text-center text-xs text-gris">
            Todavía no hay documentos. Sube la cotización, la factura o la guía de despacho; la
            carpeta se crea sola con el primero.
          </p>
        )
      )}
    </section>
  );
}
