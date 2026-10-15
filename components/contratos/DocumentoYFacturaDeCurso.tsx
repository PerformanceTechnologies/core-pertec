"use client";

import Link from "@/components/contratos/Enlace";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconExternalLink,
  IconFileInvoice,
  IconFileText,
  IconPaperclip,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import BotonGuardar from "./BotonGuardar";
import RuedaCarga from "./RuedaCarga";
import VentanaModal from "./VentanaModal";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import { fechaCorta, type CursoPersona } from "@/lib/contratos/acreditacion-modelo";
import { formatearPesos } from "@/lib/contratos/arranque-modelo";
import {
  PLAZOS_DE_PAGO,
  documentosParaCapacitacion,
  normalizarNombre,
  situacionDePago,
  type FacturaDeCurso,
} from "@/lib/contratos/capacitaciones-modelo";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";
import {
  guardarFacturaDeCursoAction,
  prepararSubidaDeFacturaAction,
  prepararSubidaDocumentoAction,
  quitarFacturaDeCursoAction,
  registrarDocumentoDeCursoAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";
const BOTON_CHICO =
  "inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-1 rounded-md border border-borde px-2 text-[10px] font-bold uppercase tracking-wide text-azul transition hover:border-cian disabled:opacity-60";

/** Un documento del catálogo, para elegir en cuál queda el archivo. */
export interface TipoParaElegir {
  id: string;
  nombre: string;
  grupo: string;
}

/** Lo que ya hay subido en el documento del catálogo al que apunta el curso o examen. */
export interface DocumentoDelCurso {
  tipoId: string;
  nombre: string;
  archivos: { id: string; nombre: string; url: string }[];
}

export interface ArchivoDeFactura {
  id: string;
  nombre: string;
  url: string;
}

const ACEPTA = "application/pdf,image/*,.doc,.docx,.xls,.xlsx";

/** El documento del catálogo que mejor parece corresponder al nombre del curso o examen. */
export function tipoSugerido(curso: Pick<CursoPersona, "curso" | "documentoTipoId">, tipos: TipoParaElegir[]): string {
  if (curso.documentoTipoId && tipos.some((t) => t.id === curso.documentoTipoId)) return curso.documentoTipoId;
  const nombre = normalizarNombre(curso.curso);
  const exacto = tipos.find((t) => normalizarNombre(t.nombre) === nombre);
  if (exacto) return exacto.id;
  const parcial = tipos.find((t) => {
    const n = normalizarNombre(t.nombre);
    return n.includes(nombre) || nombre.includes(n);
  });
  return parcial?.id ?? "";
}

function Avance({ nombre, avance }: { nombre: string; avance: number }) {
  return (
    <div className="rounded-lg border border-borde bg-fondo/60 px-3 py-2" role="status">
      <div className="flex items-center justify-between gap-2 text-[11px] text-gris">
        <span className="truncate">{nombre}</span>
        <span className="tabular-nums">{avance}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-borde">
        <div className="h-full bg-cian transition-[width]" style={{ width: `${avance}%` }} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
//  Subir el documento (examen, certificado…): queda en la lista de documentos de la persona
// -----------------------------------------------------------------------------

function ModalDeDocumento({
  personaId,
  curso,
  tipos,
  abierta,
  alCerrar,
}: {
  personaId: string;
  curso: CursoPersona;
  tipos: TipoParaElegir[];
  abierta: boolean;
  alCerrar: () => void;
}) {
  const router = useRouter();
  // Solo los documentos de exámenes y cursos: el catálogo entero tiene contratos, cédulas, pólizas…
  const ofrecidos = documentosParaCapacitacion(tipos, curso.documentoTipoId);
  const [tipoId, setTipoId] = useState(() => tipoSugerido(curso, ofrecidos));
  const [emision, setEmision] = useState(curso.fecha ?? "");
  const [vence, setVence] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subiendo = avance !== null;

  const grupos = [...new Set(ofrecidos.map((t) => t.grupo))];

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo || !tipoId) return;
    setError(null);
    setAvance(0);
    try {
      // El mismo camino de siempre: carpeta de la persona y nombre «NN - Documento».
      const preparada = await prepararSubidaDocumentoAction(personaId, tipoId, archivo.name);
      if (preparada.error !== undefined) throw new Error(preparada.error);
      const creado = await subirPorTrozos(preparada.url, archivo, setAvance);

      const registro = await registrarDocumentoDeCursoAction(personaId, curso.id, tipoId, creado.id, {
        emision: emision || null,
        vencimiento: vence || null,
      });
      if (registro.error) throw new Error(registro.error);

      router.refresh();
      alCerrar();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo subir el documento."));
    } finally {
      setAvance(null);
    }
  }

  return (
    <VentanaModal
      abierta={abierta}
      alCerrar={subiendo ? () => {} : alCerrar}
      titulo="Subir documento"
      descripcion={`${curso.curso}: el archivo queda en la lista de documentos de la persona.`}
      ancho="max-w-lg"
    >
      <form onSubmit={enviar} className="space-y-3">
        <label className="block">
          <span className={ETIQUETA}>¿En qué documento queda?</span>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} required className={CAMPO_COMPACTO}>
            <option value="" disabled>
              Elige un documento del catálogo…
            </option>
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {ofrecidos
                  .filter((t) => t.grupo === g)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-gris-suave">
            Son los documentos de exámenes y cursos del listado de la pestaña Documentos: suma al avance de la persona.
          </span>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label>
            <span className={ETIQUETA}>Fecha de emisión</span>
            <input type="date" value={emision} onChange={(e) => setEmision(e.target.value)} className={CAMPO_COMPACTO} />
          </label>
          <label>
            <span className={ETIQUETA}>
              Vigente hasta <span className="font-normal normal-case text-gris-suave">(opcional)</span>
            </span>
            <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className={CAMPO_COMPACTO} />
          </label>
        </div>
        <p className="-mt-1 text-[11px] text-gris-suave">
          Si lo indicas, el documento avisa cuando esté por vencer, como cualquier otro.
        </p>

        <label className="block">
          <span className={ETIQUETA}>Archivo</span>
          <input
            type="file"
            required
            accept={ACEPTA}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-tinta file:mr-3 file:rounded-lg file:border file:border-borde file:bg-superficie file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-wide file:text-azul"
          />
        </label>

        {archivo && avance !== null && <Avance nombre={archivo.name} avance={avance} />}
        {error && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <BotonGuardar pendiente={subiendo} cargando="Subiendo...">
            Subir documento
          </BotonGuardar>
          <button
            type="button"
            onClick={alCerrar}
            disabled={subiendo}
            className="min-h-11 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </form>
    </VentanaModal>
  );
}

// -----------------------------------------------------------------------------
//  Subir la factura: se registra como un gasto en Gastos de arranque
// -----------------------------------------------------------------------------

function ModalDeFactura({
  personaId,
  curso,
  factura,
  abierta,
  alCerrar,
}: {
  personaId: string;
  curso: CursoPersona;
  factura: FacturaDeCurso | null;
  abierta: boolean;
  alCerrar: () => void;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pagada, setPagada] = useState(factura?.pagada ?? false);
  const plazoInicial = curso.facturaPlazoDias && PLAZOS_DE_PAGO.includes(curso.facturaPlazoDias) ? String(curso.facturaPlazoDias) : "";
  const categoria = curso.tipo === "examen" ? "Exámenes y salud ocupacional" : "Acreditaciones y cursos";

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    setGuardando(true);
    try {
      const guardada = await guardarFacturaDeCursoAction(personaId, curso.id, {}, datos);
      if (guardada.error) throw new Error(guardada.error);

      if (archivo) {
        setAvance(0);
        try {
          const preparada = await prepararSubidaDeFacturaAction(personaId, curso.id, archivo.name);
          if (preparada.error !== undefined) throw new Error(preparada.error);
          await subirPorTrozos(preparada.url, archivo, setAvance);
        } catch (err) {
          // Los datos ya quedaron en Gastos: se dice, para que no se registre dos veces.
          router.refresh();
          throw new Error(
            `La factura quedó registrada en Gastos, pero el archivo no se subió: ${mensajeDeError(err, "error desconocido")} Usa «Adjuntar archivo» para reintentarlo.`,
          );
        }
      }

      router.refresh();
      alCerrar();
    } catch (err) {
      setError(mensajeDeError(err, "No se pudo registrar la factura."));
    } finally {
      setAvance(null);
      setGuardando(false);
    }
  }

  return (
    <VentanaModal
      abierta={abierta}
      alCerrar={guardando ? () => {} : alCerrar}
      titulo={factura ? "Editar factura" : "Subir factura"}
      descripcion={`Se registra como un gasto en Gastos de arranque, categoría «${categoria}».`}
      ancho="max-w-lg"
    >
      <form onSubmit={enviar} className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
        <label>
          <span className={ETIQUETA}>N.º de factura</span>
          <input name="referencia" required maxLength={60} defaultValue={factura?.referencia ?? ""} className={CAMPO_COMPACTO} />
        </label>
        <label>
          <span className={ETIQUETA}>Fecha de la factura</span>
          <input name="fecha" type="date" defaultValue={factura?.fecha ?? ""} className={CAMPO_COMPACTO} />
        </label>
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>Proveedor</span>
          <input
            name="proveedor"
            required
            maxLength={120}
            defaultValue={factura?.proveedor ?? ""}
            placeholder="Clínica, centro o empresa que facturó"
            className={CAMPO_COMPACTO}
          />
        </label>
        <label>
          <span className={ETIQUETA}>Monto neto ($)</span>
          <input
            name="monto"
            required
            inputMode="numeric"
            defaultValue={factura?.monto ?? ""}
            placeholder="Ej.: 185.000"
            className={CAMPO_COMPACTO}
          />
          <span className="mt-1 block text-[11px] text-gris-suave">Sin IVA, como todo el presupuesto.</span>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 self-start rounded-lg border border-borde px-3 py-2 text-sm text-tinta sm:mt-[1.15rem]">
          <input
            name="pagada"
            type="checkbox"
            checked={pagada}
            onChange={(e) => setPagada(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-azul)]"
          />
          Ya está pagada
        </label>
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>Plazo de pago</span>
          <select
            name="plazo"
            defaultValue={plazoInicial}
            disabled={pagada}
            className={CAMPO_COMPACTO}
          >
            <option value="">Sin plazo definido</option>
            {PLAZOS_DE_PAGO.map((d) => (
              <option key={d} value={d}>
                Pago a {d} días
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-gris-suave">
            {pagada
              ? "Ya está pagada: no hay plazo que esperar."
              : "El vencimiento se cuenta desde la fecha de la factura (por eso hay que indicarla)."}
          </span>
        </label>
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>
            Nota <span className="font-normal normal-case text-gris-suave">(opcional)</span>
          </span>
          <input name="notas" maxLength={500} className={CAMPO_COMPACTO} />
        </label>
        <label className="sm:col-span-2">
          <span className={ETIQUETA}>
            Archivo de la factura{" "}
            {factura && <span className="font-normal normal-case text-gris-suave">(opcional: ya hay una registrada)</span>}
          </span>
          <input
            type="file"
            required={!factura}
            accept={ACEPTA}
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-tinta file:mr-3 file:rounded-lg file:border file:border-borde file:bg-superficie file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase file:tracking-wide file:text-azul"
          />
        </label>

        {archivo && avance !== null && (
          <div className="sm:col-span-2">
            <Avance nombre={archivo.name} avance={avance} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs font-semibold text-red-600 sm:col-span-2">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <BotonGuardar pendiente={guardando} cargando="Guardando...">
            {factura ? "Guardar cambios" : "Registrar factura"}
          </BotonGuardar>
          <button
            type="button"
            onClick={alCerrar}
            disabled={guardando}
            className="min-h-11 rounded-lg border border-borde px-4 text-xs font-bold uppercase tracking-wide text-gris transition hover:border-cian hover:text-azul disabled:opacity-60"
          >
            Cancelar
          </button>
        </div>
      </form>
    </VentanaModal>
  );
}

// -----------------------------------------------------------------------------
//  La franja de una fila: Documento y Factura, uno al lado del otro
// -----------------------------------------------------------------------------

/**
 * Lo que cuelga de un curso o examen: su documento (en la lista de documentos de la persona) y su
 * factura (un gasto en Gastos de arranque). Subir es de todos los roles; corregir o quitar la
 * factura, de quien puede editar.
 */
export default function DocumentoYFacturaDeCurso({
  personaId,
  curso,
  tipos,
  documento,
  factura,
  archivosDeFactura,
  errorDeArchivos,
  conectado,
  puedeFacturar,
  puedeEditar,
  puedeVerGastos,
  hoy,
}: {
  personaId: string;
  curso: CursoPersona;
  tipos: TipoParaElegir[];
  documento: DocumentoDelCurso | null;
  factura: FacturaDeCurso | null;
  archivosDeFactura: ArchivoDeFactura[];
  errorDeArchivos: boolean;
  conectado: boolean;
  /** Si quien mira tiene Gastos de arranque y puede crear ahí: sin eso, la factura no se registra. */
  puedeFacturar: boolean;
  puedeEditar: boolean;
  puedeVerGastos: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [verDocumento, setVerDocumento] = useState(false);
  const [verFactura, setVerFactura] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const [adjuntando, setAdjuntando] = useState<{ nombre: string; avance: number } | null>(null);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una factura cuya línea se borró desde Gastos: el vínculo se soltó solo (on delete set null).
  const hayFactura = factura !== null;
  const pago = factura ? situacionDePago(factura, curso.facturaPlazoDias, hoy) : null;
  const puedeCorregir = puedeFacturar && puedeEditar;

  async function adjuntar(seleccion: FileList | null) {
    const archivo = seleccion?.[0];
    if (!archivo) return;
    setError(null);
    setAdjuntando({ nombre: archivo.name, avance: 0 });
    try {
      const preparada = await prepararSubidaDeFacturaAction(personaId, curso.id, archivo.name);
      if (preparada.error !== undefined) throw new Error(preparada.error);
      await subirPorTrozos(preparada.url, archivo, (avance) => setAdjuntando({ nombre: archivo.name, avance }));
      router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo subir el archivo."));
    } finally {
      setAdjuntando(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function quitarFactura() {
    if (
      !window.confirm(
        "¿Quitar la factura?\n\nSe elimina el gasto que creó en Gastos de arranque, con su carpeta (va a la papelera de SharePoint).",
      )
    ) {
      return;
    }
    setError(null);
    setQuitando(true);
    try {
      const r = await quitarFacturaDeCursoAction(personaId, curso.id);
      if (r.error) setError(r.error);
      else router.refresh();
    } catch (e) {
      setError(mensajeDeError(e, "No se pudo quitar la factura."));
    } finally {
      setQuitando(false);
    }
  }

  const CAJA = "rounded-lg border border-borde bg-fondo/50 p-2.5";
  const TITULO = "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gris";

  return (
    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {/* ── Documento ─────────────────────────────────────────────────────────── */}
      <div className={CAJA}>
        <p className={TITULO}>
          <IconFileText size={13} aria-hidden /> Documento
        </p>
        {documento && documento.archivos.length > 0 ? (
          <div className="mt-1 text-xs text-tinta">
            <p className="font-semibold leading-tight">{documento.nombre}</p>
            <ul className="mt-0.5 space-y-0.5">
              {documento.archivos.slice(-2).map((a) => (
                <li key={a.id}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-azul hover:underline"
                  >
                    <span className="truncate">{a.nombre}</span>
                    <IconExternalLink size={11} className="shrink-0" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
            <Link href="?tab=documentos" className="mt-0.5 inline-block text-[11px] text-gris hover:text-azul hover:underline">
              Ver en Documentos
              {documento.archivos.length > 2 ? ` (${documento.archivos.length} archivos)` : ""}
            </Link>
          </div>
        ) : (
          <p className="mt-1 text-xs text-gris-suave">Sin documento todavía.</p>
        )}
        <button type="button" onClick={() => setVerDocumento(true)} disabled={!conectado} className={`${BOTON_CHICO} mt-1.5`}>
          <IconPaperclip size={13} aria-hidden />
          {documento && documento.archivos.length > 0 ? "Subir otro" : "Subir documento"}
        </button>
      </div>

      {/* ── Factura ───────────────────────────────────────────────────────────── */}
      <div className={CAJA}>
        <p className={TITULO}>
          <IconFileInvoice size={13} aria-hidden /> Factura
        </p>

        {hayFactura && factura ? (
          <div className="mt-1 text-xs text-tinta">
            <p className="font-semibold leading-tight">
              {factura.referencia ? `N.º ${factura.referencia}` : "Sin número"}
              {factura.proveedor ? ` · ${factura.proveedor}` : ""}
            </p>
            <p className="mt-0.5 text-gris">
              <strong className="text-tinta">{formatearPesos(factura.monto)}</strong> neto
              {factura.fecha ? ` · ${fechaCorta(factura.fecha)}` : ""}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide ${
                  factura.anulada
                    ? "border-borde bg-fondo text-gris-suave line-through"
                    : factura.pagada
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {factura.anulada ? "Anulada" : factura.pagada ? "Pagada" : "Por pagar"}
              </span>
              {pago && pago.vence && (
                <span
                  className={`text-[11px] ${
                    pago.clave === "vencido" ? "font-semibold text-red-600" : pago.clave === "vence_hoy" ? "font-semibold text-amber-700" : "text-gris"
                  }`}
                >
                  A {curso.facturaPlazoDias} días · vence el {fechaCorta(pago.vence)}
                  {pago.clave === "vencido" && ` (hace ${-(pago.dias ?? 0)} d)`}
                  {pago.clave === "vence_hoy" && " (hoy)"}
                  {pago.clave === "a_tiempo" && ` (en ${pago.dias} d)`}
                </span>
              )}
              {puedeVerGastos && (
                <Link
                  href={`/contratos/gastos-arranque/${factura.partidaId}`}
                  className="inline-flex items-center gap-1 text-[11px] text-gris hover:text-azul hover:underline"
                >
                  Ver en Gastos #{factura.numero}
                  <IconExternalLink size={11} aria-hidden />
                </Link>
              )}
            </p>

            {archivosDeFactura.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {archivosDeFactura.slice(0, 3).map((a) => (
                  <li key={a.id}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-azul hover:underline"
                    >
                      <span className="truncate">{a.nombre}</span>
                      <IconExternalLink size={11} className="shrink-0" aria-hidden />
                    </a>
                  </li>
                ))}
                {archivosDeFactura.length > 3 && (
                  <li className="text-[11px] text-gris-suave">y {archivosDeFactura.length - 3} más en la carpeta del gasto</li>
                )}
              </ul>
            )}
            {archivosDeFactura.length === 0 && conectado && !errorDeArchivos && (
              <p className="mt-1 text-[11px] text-amber-700">Todavía no tiene archivo adjunto.</p>
            )}
            {errorDeArchivos && <p className="mt-1 text-[11px] text-gris-suave">No se pudieron leer los archivos de SharePoint.</p>}
          </div>
        ) : (
          <p className="mt-1 text-xs text-gris-suave">
            Sin factura. Al subirla se registra sola en Gastos de arranque.
          </p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {!hayFactura && (
            <button
              type="button"
              onClick={() => setVerFactura(true)}
              disabled={!conectado || !puedeFacturar}
              title={!puedeFacturar ? "Necesitas acceso a Gastos de arranque para registrar facturas." : undefined}
              className={BOTON_CHICO}
            >
              <IconFileInvoice size={13} aria-hidden />
              Subir factura
            </button>
          )}
          {hayFactura && (
            <>
              <input ref={entrada} type="file" accept={ACEPTA} className="hidden" onChange={(e) => void adjuntar(e.target.files)} />
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                disabled={!conectado || !puedeFacturar || adjuntando !== null}
                className={BOTON_CHICO}
              >
                {adjuntando ? <RuedaCarga className="h-3 w-3" /> : <IconPaperclip size={13} aria-hidden />}
                Adjuntar archivo
              </button>
              {puedeCorregir && (
                <>
                  <button type="button" onClick={() => setVerFactura(true)} className={BOTON_CHICO}>
                    <IconPencil size={13} aria-hidden />
                    Corregir
                  </button>
                  <button
                    type="button"
                    onClick={() => void quitarFactura()}
                    disabled={quitando}
                    className={`${BOTON_CHICO} hover:!border-red-300 hover:!text-red-600`}
                  >
                    {quitando ? <RuedaCarga className="h-3 w-3" /> : <IconTrash size={13} aria-hidden />}
                    Quitar
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {adjuntando && (
          <div className="mt-2">
            <Avance nombre={adjuntando.nombre} avance={adjuntando.avance} />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>

      <ModalDeDocumento
        personaId={personaId}
        curso={curso}
        tipos={tipos}
        abierta={verDocumento}
        alCerrar={() => setVerDocumento(false)}
      />
      <ModalDeFactura
        personaId={personaId}
        curso={curso}
        factura={factura}
        abierta={verFactura}
        alCerrar={() => setVerFactura(false)}
      />
    </div>
  );
}
