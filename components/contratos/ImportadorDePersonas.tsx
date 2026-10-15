"use client";

import { useRef, useState, useTransition } from "react";
import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCheck, IconFileUpload } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { CAMPO, TARJETA } from "@/lib/contratos/estilos";
import type { ResultadoDeImportacion, RevisionDeImportacion } from "@/lib/contratos/acreditacion-importar";
import { formatearRut } from "@/lib/contratos/rut";
import {
  importarPersonasAction,
  revisarImportacionAction,
} from "@/app/(protegido)/contratos/[contrato]/acreditacion/acciones";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

const EJEMPLO = "Nombre\tRUT\tCargo\tFaena\tTurno\nJuan Pérez Soto\t12.345.678-5\tActivador\tCCH\t7x7";

/**
 * Pegar una tabla, revisarla y recién entonces crear.
 *
 * La revisión va primero y no es opcional: crear cien personas de golpe y
 * descubrir después que veinte tenían el RUT mal tipeado deja una nómina que hay
 * que limpiar a mano. Revisar muestra fila por fila qué entra y qué no, y por qué.
 *
 * Se pega desde Excel y no se sube el .xlsx: leer un Excel obligaría a mover
 * código de lectura de archivos al servidor para una tabla de cinco columnas.
 */
export default function ImportadorDePersonas({ cargos }: { cargos: string[] }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState("");
  const [revision, setRevision] = useState<RevisionDeImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoDeImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisando, iniciarRevision] = useTransition();
  const [importando, iniciarImportacion] = useTransition();

  const buenas = revision?.filas.filter((f) => f.estado === "ok").length ?? 0;
  const malas = revision ? revision.filas.length - buenas : 0;

  function cambiarTexto(valor: string) {
    setTexto(valor);
    // Lo revisado ya no corresponde a lo que hay en el cuadro: si no se limpia,
    // se podría importar una lista distinta de la que se está viendo.
    setRevision(null);
    setResultado(null);
    setError(null);
  }

  function revisar() {
    setError(null);
    setResultado(null);
    iniciarRevision(async () => {
      try {
        setRevision(await revisarImportacionAction(texto));
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo revisar la lista."));
      }
    });
  }

  function importar() {
    setError(null);
    iniciarImportacion(async () => {
      try {
        const r = await importarPersonasAction(texto);
        setResultado(r);
        if (!r.error) {
          setRevision(null);
          setTexto("");
        }
      } catch (e) {
        setError(mensajeDeError(e, "No se pudo importar."));
      }
    });
  }

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    // Un .xlsx es un zip: leído como texto sale basura, y esa basura se
    // "revisaría" sin avisar que no era una tabla.
    if (/\.xlsx?$/i.test(archivo.name)) {
      setError("Un Excel no se puede leer directo: ábrelo, copia las celdas y pégalas acá. O guárdalo como CSV.");
      return;
    }
    cambiarTexto(await archivo.text());
    if (entrada.current) entrada.current.value = "";
  }

  return (
    <div className="space-y-6">
      <div className={`${TARJETA} p-5 sm:p-6`}>
        <p className="text-sm text-tinta">
          Copia las celdas desde Excel y pégalas acá. Columnas:{" "}
          <strong>Nombre, RUT, Cargo</strong> y, si quieres, <strong>Faena, Turno</strong>. Si la
          primera fila tiene los títulos, no importa el orden.
        </p>
        <p className="mt-2 text-xs text-gris">
          Cargos que existen:{" "}
          {cargos.length > 0 ? cargos.join(", ") : "ninguno todavía"}. Si uno no existe, créalo antes
          en Configuración.
        </p>

        <label className="mt-4 block">
          <span className="sr-only">Lista de personas</span>
          <textarea
            value={texto}
            onChange={(e) => cambiarTexto(e.target.value)}
            rows={9}
            spellCheck={false}
            placeholder={EJEMPLO}
            className={`${CAMPO} font-mono text-xs leading-relaxed`}
          />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={revisar}
            disabled={revisando || importando || !texto.trim()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:cursor-not-allowed disabled:opacity-60"
          >
            {revisando && <RuedaCarga />}
            {revisando ? "Revisando..." : "Revisar lista"}
          </button>

          <input
            ref={entrada}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void leerArchivo(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde px-3 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian"
          >
            <IconFileUpload size={16} />
            Cargar un CSV
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs font-semibold text-red-600">
            <IconAlertTriangle size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </div>

      {resultado && (
        <div
          role="status"
          className={`rounded-xl border p-4 ${
            resultado.error || (resultado.creadas === 0 && resultado.fallidas.length > 0)
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-emerald-50"
          }`}
        >
          {resultado.error ? (
            <p className="text-sm font-semibold text-red-700">{resultado.error}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                <IconCheck size={17} />
                {resultado.creadas} {resultado.creadas === 1 ? "persona creada" : "personas creadas"}
                {resultado.fallidas.length > 0 && (
                  <span className="font-semibold text-red-700">
                    · {resultado.fallidas.length} sin crear
                  </span>
                )}
              </p>
              {resultado.carpetasPendientes > 0 && (
                <p className="mt-2 pl-7 text-xs text-gris">
                  {resultado.carpetasPendientes === resultado.creadas
                    ? "Sus carpetas en SharePoint todavía no se crearon (hace falta conectar tu cuenta con SharePoint, o hubo un problema)."
                    : `${resultado.carpetasPendientes} ${resultado.carpetasPendientes === 1 ? "carpeta" : "carpetas"} en SharePoint todavía no se ${resultado.carpetasPendientes === 1 ? "creó" : "crearon"}.`}{" "}
                  No se pierde nada: se crea sola al subir el primer documento de cada persona.
                </p>
              )}
              {resultado.fallidas.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-9 text-xs text-red-700">
                  {resultado.fallidas.map((f) => (
                    <li key={`${f.linea}-${f.nombre}`}>
                      Línea {f.linea}
                      {f.nombre ? ` (${f.nombre})` : ""}: {f.mensaje}
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/contratos/acreditacion"
                className="mt-3 inline-block text-xs font-bold uppercase tracking-wide text-azul hover:underline"
              >
                Ir a la nómina
              </Link>
            </>
          )}
        </div>
      )}

      {revision?.error && (
        <p role="alert" className="text-sm font-semibold text-red-600">
          {revision.error}
        </p>
      )}

      {revision && !revision.error && (
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde px-4 py-3">
            <p className="text-sm text-tinta">
              <strong className="text-emerald-600">{buenas}</strong> {buenas === 1 ? "lista para crear" : "listas para crear"}
              {malas > 0 && (
                <>
                  {" · "}
                  <strong className="text-red-600">{malas}</strong> con problemas (no se crean)
                </>
              )}
            </p>
            <button
              type="button"
              onClick={importar}
              disabled={importando || buenas === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-azul px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave disabled:cursor-not-allowed disabled:opacity-60"
            >
              {importando && <RuedaCarga />}
              {importando ? "Creando..." : `Crear ${buenas} ${buenas === 1 ? "persona" : "personas"}`}
            </button>
          </div>

          {revision.aviso && <p className="border-b border-borde px-4 py-2 text-xs text-amber-600">{revision.aviso}</p>}

          <ul className="divide-y divide-borde">
            {revision.filas.map((f) => (
              <li
                key={f.linea}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white ${
                    f.estado === "ok" ? "bg-emerald-500" : "bg-red-500"
                  }`}
                  aria-label={f.estado === "ok" ? "Lista" : "Con problemas"}
                >
                  {f.estado === "ok" ? <IconCheck size={12} /> : <span className="text-[11px] font-extrabold leading-none">!</span>}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-tinta">
                    {f.nombre || <span className="text-gris-suave">(sin nombre)</span>}
                  </p>
                  <p className="truncate text-xs text-gris">
                    <span className="text-gris-suave">Línea {f.linea} · </span>
                    {f.rutNormalizado ? formatearRut(f.rutNormalizado) : f.rut || "sin RUT"} ·{" "}
                    {f.cargo || "sin cargo"}
                    {f.faena ? ` · ${f.faena}` : ""}
                    {f.turno ? ` · ${f.turno}` : ""}
                  </p>
                  {f.mensaje && <p className="mt-0.5 text-xs font-semibold text-red-600">{f.mensaje}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
