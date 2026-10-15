"use client";

import { useRutaDelContrato } from "./ContratoProvider";

import { useRef, useState, useTransition, type FormEvent } from "react";
import Link from "@/components/contratos/Enlace";
import { useRouter } from "next/navigation";
import { IconPaperclip, IconX } from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import type { EstadoForm } from "@/lib/contratos/acreditacion-modelo";
import { MODULOS, type ModuloArranque, type Partida } from "@/lib/contratos/arranque-modelo";
import { AYUDA_DE_MODALIDAD, ETIQUETAS_DE_MODALIDAD, MODALIDADES } from "@/lib/contratos/gastos-modelo";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import {
  guardarPartidaAction,
  prepararSubidaDePartidaAction,
} from "@/app/(protegido)/contratos/[contrato]/acciones-partidas";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";

/** Un monto para volver a mostrarlo en el campo: «1500000» → «1.500.000». */
function montoEnCampo(monto: number | null): string {
  return monto === null ? "" : new Intl.NumberFormat("es-CL").format(monto);
}

/** «2 KB», «860 KB», «1,2 MB»: lo que se lee de un vistazo, sin «0.00 MB». */
function pesoLegible(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Alta y edición de una partida, el mismo formulario para Logística y Gastos de
 * arranque: lo que cambia entre uno y otro son las etiquetas (ver MODULOS).
 *
 * Los montos son campos de texto y no `type="number"`: el selector numérico del
 * navegador no admite los puntos de miles que la gente pega desde una planilla, y en
 * un celular abre un teclado que no siempre tiene el punto. El servidor los lee con
 * leerMonto(), que acepta «1.500.000» y rechaza decimales.
 *
 * Al CREAR se pueden adjuntar los documentos de una vez: primero se guarda la partida
 * —eso crea su número, que es el de su carpeta— y después los archivos se suben a esa
 * carpeta de SharePoint, todos a la misma. Al EDITAR, los documentos se manejan en el
 * bloque de arriba de la ficha, que también sube más, así que acá no se repite.
 */
export default function FormularioDePartida({
  modulo,
  partida,
  categorias,
  responsables,
  vinculables = [],
  sharePointConectado = false,
}: {
  modulo: ModuloArranque;
  /** Sin partida es un alta. */
  partida?: Partida;
  categorias: { id: string; nombre: string; activo: boolean }[];
  responsables: { internos: { id: string; nombre: string }[]; externos: { id: string; nombre: string }[] };
  /** Las partidas del OTRO módulo a las que se puede vincular (Gastos ↔ Logística). */
  vinculables?: { id: string; etiqueta: string }[];
  /** Si quien llena el formulario ya conectó su cuenta con SharePoint (solo para el alta). */
  sharePointConectado?: boolean;
}) {
  const config = MODULOS[modulo];
  const router = useRouter();
  const ruta = useRutaDelContrato();
  const edicion = useFormulario((previo, form) =>
    guardarPartidaAction(modulo, partida?.id ?? null, previo, form),
  );

  // --- El alta, con archivos
  const entrada = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [alta, iniciar] = useTransition();
  const [estadoAlta, setEstadoAlta] = useState<EstadoForm>({});
  const [subiendo, setSubiendo] = useState<{ nombre: string; avance: number; n: number } | null>(null);
  const [creadaId, setCreadaId] = useState<string | null>(null);

  function agregarArchivos(seleccion: FileList | null) {
    if (!seleccion) return;
    // Sin duplicados exactos (mismo nombre y tamaño): elegir dos veces el mismo
    // archivo es un error de dedo, y subirlo dos veces ensucia la carpeta.
    setArchivos((actuales) => {
      const nuevos = Array.from(seleccion).filter(
        (n) => !actuales.some((a) => a.name === n.name && a.size === n.size),
      );
      return [...actuales, ...nuevos];
    });
    if (entrada.current) entrada.current.value = "";
  }

  function enviarAlta(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setEstadoAlta({});

    iniciar(async () => {
      let id = creadaId;
      try {
        // Si ya se creó y fallaron los archivos, reintentar NO crea otra partida.
        if (!id) {
          const resultado = await guardarPartidaAction(modulo, null, {}, datos);
          if (resultado.error || !resultado.id) {
            setEstadoAlta({ error: resultado.error ?? "No se pudo crear." });
            return;
          }
          id = resultado.id;
          setCreadaId(id);
        }
      } catch (e) {
        setEstadoAlta({ error: mensajeDeError(e, "No se pudo crear.") });
        return;
      }

      // De a uno: en paralelo el ancho de subida se reparte y ninguno parece avanzar.
      // Todos caen en la carpeta de ESTA partida: el servidor la crea con el primero y
      // reutiliza la misma con los demás.
      const pendientes = [...archivos];
      const fallidos: string[] = [];
      let primerError = "";
      for (let i = 0; i < pendientes.length; i++) {
        const archivo = pendientes[i];
        try {
          setSubiendo({ nombre: archivo.name, avance: 0, n: i + 1 });
          const { url } = await prepararSubidaDePartidaAction(modulo, id, archivo.name);
          await subirPorTrozos(url, archivo, (avance) =>
            setSubiendo({ nombre: archivo.name, avance, n: i + 1 }),
          );
        } catch (e) {
          fallidos.push(archivo.name);
          primerError ||= mensajeDeError(e, "");
        }
      }
      setSubiendo(null);

      if (fallidos.length > 0) {
        // La partida YA existe: lo que falta se reintenta desde su ficha, y se dice
        // dónde, en vez de dejar a la persona creyendo que no se creó nada.
        setArchivos(pendientes.filter((a) => fallidos.includes(a.name)));
        setEstadoAlta({
          error:
            `La ${config.singular} se creó, pero no se pudo subir: ${fallidos.join(", ")}. ` +
            (primerError ? `${primerError} ` : "") +
            "Puedes volver a intentarlo aquí o desde su ficha.",
        });
        return;
      }

      router.push(ruta(`${config.ruta}/${id}`));
    });
  }

  const esAlta = !partida;

  return (
    <form
      onSubmit={esAlta ? enviarAlta : edicion.enviar}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <label className="sm:col-span-2">
        <span className={ETIQUETA}>Descripción</span>
        <input
          name="descripcion"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={partida?.descripcion ?? ""}
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>{modulo === "gastos" ? "Ítem" : "Categoría"}</span>
        <select
          name="categoria_id"
          required
          defaultValue={partida?.categoriaId ?? ""}
          className={CAMPO}
        >
          <option value="" disabled>
            {modulo === "gastos" ? "Elige un ítem…" : "Elige una categoría…"}
          </option>
          {categorias
            // Las desactivadas no se ofrecen para partidas nuevas, pero si ESTA partida
            // ya tiene una, tiene que seguir apareciendo: de lo contrario el select
            // mostraría otra y guardar la cambiaría sin que nadie lo haya pedido.
            .filter((c) => c.activo || c.id === partida?.categoriaId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.activo ? "" : " (desactivada)"}
              </option>
            ))}
        </select>
      </label>

      <label>
        <span className={ETIQUETA}>Estado</span>
        <select name="estado" defaultValue={partida?.estado ?? config.estados[0].clave} className={CAMPO}>
          {config.estados.map((e) => (
            <option key={e.clave} value={e.clave}>
              {e.etiqueta}
            </option>
          ))}
        </select>
      </label>

      {modulo === "gastos" && (
        <>
          <label>
            <span className={ETIQUETA}>
              Cantidad <span className="font-normal normal-case text-gris-suave">(unidades a comprar)</span>
            </span>
            <input
              name="cantidad"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={partida?.cantidad ?? 1}
              className={CAMPO}
            />
          </label>

          <label>
            <span className={ETIQUETA}>Cómo se compra</span>
            <select name="modalidad" defaultValue={partida?.modalidad ?? "cotizacion"} className={CAMPO}>
              {MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {ETIQUETAS_DE_MODALIDAD[m]} — {AYUDA_DE_MODALIDAD[m]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <label>
        <span className={ETIQUETA}>
          {config.etiquetaFecha} <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <input type="date" name="fecha" defaultValue={partida?.fecha ?? ""} className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>
          Responsable <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <select
          name="responsable_id"
          defaultValue={partida?.responsableId ?? partida?.responsableExternoId ?? ""}
          className={CAMPO}
        >
          <option value="">Sin responsable</option>
          {[...responsables.internos, ...responsables.externos].map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span className={ETIQUETA}>
          Proveedor <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <input name="proveedor" maxLength={120} defaultValue={partida?.proveedor ?? ""} className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>
          {config.etiquetaReferencia} <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <input name="referencia" maxLength={60} defaultValue={partida?.referencia ?? ""} className={CAMPO} />
      </label>

      <label>
        <span className={ETIQUETA}>
          {config.etiquetaPresupuesto} <span className="font-normal normal-case text-gris-suave">(CLP)</span>
        </span>
        <input
          name="monto_presupuestado"
          inputMode="numeric"
          autoComplete="off"
          placeholder="1.500.000"
          defaultValue={montoEnCampo(partida?.montoPresupuestado ?? null)}
          className={CAMPO}
        />
      </label>

      <label>
        <span className={ETIQUETA}>
          {config.etiquetaReal} <span className="font-normal normal-case text-gris-suave">(CLP)</span>
        </span>
        <input
          name="monto_real"
          inputMode="numeric"
          autoComplete="off"
          placeholder="1.500.000"
          defaultValue={montoEnCampo(partida?.montoReal ?? null)}
          className={CAMPO}
        />
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>
          {modulo === "gastos" ? "Requerimiento de logística relacionado" : "Gasto relacionado"}{" "}
          <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <select name="partida_vinculada_id" defaultValue={partida?.partidaVinculadaId ?? ""} className={CAMPO}>
          <option value="">Sin vínculo</option>
          {vinculables.map((v) => (
            <option key={v.id} value={v.id}>
              {v.etiqueta}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-gris-suave">
          {modulo === "gastos"
            ? "Por ejemplo, el despacho a Calama del equipo que se compra. Solo enlaza: no cambia estados ni montos."
            : "Por ejemplo, el gasto del equipo que se despacha. Solo enlaza: no cambia estados ni montos."}
        </span>
      </label>

      <label className="sm:col-span-2">
        <span className={ETIQUETA}>
          Notas <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <textarea
          name="notas"
          rows={3}
          maxLength={1000}
          defaultValue={partida?.notas ?? ""}
          className={`${CAMPO} resize-y`}
        />
      </label>

      {esAlta && (
        <div className="sm:col-span-2">
          <span className={ETIQUETA}>
            Documentos <span className="font-normal normal-case text-gris-suave">(opcional, puedes subir varios)</span>
          </span>

          {sharePointConectado ? (
            <>
              <input
                ref={entrada}
                type="file"
                multiple
                // PDF e imágenes primero: en el celular, un accept con imágenes es lo
                // que ofrece abrir la cámara además de la galería (una foto de la factura).
                accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.zip"
                className="hidden"
                onChange={(e) => agregarArchivos(e.target.files)}
              />
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={alta}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-borde bg-superficie px-4 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian disabled:opacity-60"
              >
                <IconPaperclip size={16} />
                Elegir archivos
              </button>
              <p className="mt-1.5 text-[11px] text-gris-suave">
                Se guardan en SharePoint, en una carpeta de este {config.singular}: todos los que
                subas, ahora o después, caen en la misma.
              </p>

              {archivos.length > 0 && (
                <ul className="mt-2.5 divide-y divide-borde overflow-hidden rounded-lg border border-borde bg-superficie">
                  {archivos.map((a) => (
                    <li key={`${a.name}-${a.size}`} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-tinta">{a.name}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-gris-suave">
                        {pesoLegible(a.size)}
                      </span>
                      <button
                        type="button"
                        disabled={alta}
                        onClick={() => setArchivos((x) => x.filter((y) => y !== a))}
                        aria-label={`Quitar ${a.name}`}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gris transition hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      >
                        <IconX size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-borde bg-fondo/60 px-3 py-2.5 text-xs text-gris">
              Para subir documentos hay que conectar tu cuenta con SharePoint. Guarda la{" "}
              {config.singular} y hazlo desde su ficha: el botón aparece ahí.
            </p>
          )}
        </div>
      )}

      {subiendo && (
        <div className="rounded-lg border border-borde bg-superficie px-3 py-2.5 sm:col-span-2" role="status">
          <div className="flex items-center justify-between gap-2 text-[11px] text-gris">
            <span className="truncate">
              Subiendo {subiendo.n} de {archivos.length}: {subiendo.nombre}
            </span>
            <span className="tabular-nums">{subiendo.avance}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-borde">
            <div className="h-full bg-cian transition-[width]" style={{ width: `${subiendo.avance}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <BotonGuardar pendiente={esAlta ? alta : edicion.pendiente} cargando={subiendo ? "Subiendo..." : "Guardando..."}>
          {partida
            ? "Guardar cambios"
            : creadaId
              ? "Reintentar la subida"
              : archivos.length > 0
                ? `Agregar ${config.singular} y subir ${archivos.length === 1 ? "el archivo" : `${archivos.length} archivos`}`
                : `Agregar ${config.singular}`}
        </BotonGuardar>
        <Link
          href={creadaId ? `${config.ruta}/${creadaId}` : config.ruta}
          className="inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
        >
          {creadaId ? `Ir a la ficha` : "Volver a la lista"}
        </Link>
        <MensajeDeForm estado={esAlta ? estadoAlta : edicion.estado} />
      </div>
    </form>
  );
}
