"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPRESAS, type Empresa } from "@/lib/cotizador/empresas";
import RuedaCarga from "@/components/RuedaCarga";
import { FORMATOS_ACEPTADOS } from "@/lib/cotizador/obra/extraer-texto";

/**
 * Importar una propuesta ya escrita y dejarla cargada como obra.
 *
 * Vive dentro del Cotizador, al lado de "Nueva cotización": es otra forma de
 * empezar una cotización, no otro módulo.
 *
 * El PDF se manda a un route handler y no a una Server Action porque una
 * propuesta pesa varios MB y el body de una Server Action está limitado a 1 MB.
 *
 * Los avisos que devuelve el servidor se muestran ANTES de saltar a la
 * cotización: dicen qué quedó incompleto —cargos sin sueldo en el catálogo,
 * trabajos previos sin horas, líneas que no cuadran con el total del documento— y
 * son justo lo que hay que revisar antes de usar el número para algo.
 */

interface Verificacion {
  totalDeclarado: number | null;
  sumaLineas: number;
  cuadraConElDocumento: boolean;
  divisorAplicado: number;
  totalCalculado: number;
  diferencia: number;
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL");

export default function ImportarPropuesta() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa>(EMPRESAS[1]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    id: string;
    avisos: string[];
    verificacion: Verificacion;
  } | null>(null);

  const importar = async () => {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    setResultado(null);

    try {
      const cuerpo = new FormData();
      cuerpo.set("archivo", archivo);
      cuerpo.set("empresa", empresa);
      const respuesta = await fetch("/api/cotizador/importar-propuesta", { method: "POST", body: cuerpo });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo importar la propuesta.");
      setResultado(datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar la propuesta.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <details className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl border border-borde bg-crema/60 px-4 py-3.5 transition-colors hover:border-teal/50 hover:bg-teal/[0.06] group-open:rounded-b-none group-open:border-b-transparent group-open:bg-superficie">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal text-base font-bold leading-none text-white transition-transform duration-200 group-open:rotate-45">
          +
        </span>
        <span className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
          Importar propuesta
        </span>
        <span className="text-xs text-tinta/45">
          PDF, Excel o Word · se carga como obra, cuadrada al total de la oferta
        </span>
      </summary>

      <div className="rounded-b-2xl border border-t-0 border-borde bg-superficie px-4 pb-5">
        <div className="border-t border-borde pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px_auto]">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Propuesta (PDF, Excel o Word)
              </span>
              <input
                type="file"
                accept={FORMATOS_ACEPTADOS}
                disabled={cargando}
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  setResultado(null);
                  setError(null);
                }}
                className="mt-1 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta file:mr-3 file:rounded-md file:border-0 file:bg-crema file:px-3 file:py-1 file:text-xs file:font-semibold file:text-tinta/70"
              />
            </label>

            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                Empresa emisora
              </span>
              <select
                value={empresa}
                disabled={cargando}
                onChange={(e) => setEmpresa(e.target.value as Empresa)}
                className="mt-1 h-[38px] w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50"
              >
                {EMPRESAS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={importar}
                disabled={!archivo || cargando}
                className="inline-flex h-[38px] items-center gap-2 rounded-lg bg-teal px-4 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-40"
              >
                {cargando && <RuedaCarga />}
                {cargando ? "Leyendo…" : "Importar"}
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-pretty text-tinta/50">
            El modelo transcribe lo que está escrito —turnos, cuadrilla y el cuadro de precios— y el servidor
            calcula: las horas-hombre, los márgenes y el divisor que hace cuadrar el total con el de la
            oferta. Ningún monto lo calcula el modelo. Un Excel o un Word cuestan mucho menos de leer que un
            PDF, porque el PDF se procesa como una imagen de cada página.
          </p>

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

          {resultado && (
            <div className="mt-4 rounded-xl border border-borde bg-crema/40 p-4">
              <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                Propuesta cargada
              </p>

              <dl className="mt-3 flex flex-col gap-1 text-sm">
                <Linea
                  rotulo="Total del documento"
                  valor={
                    resultado.verificacion.totalDeclarado === null
                      ? "no declarado"
                      : clp(resultado.verificacion.totalDeclarado)
                  }
                />
                <Linea rotulo="Suma de las líneas leídas" valor={clp(resultado.verificacion.sumaLineas)} />
                <Linea rotulo="Total calculado" valor={clp(resultado.verificacion.totalCalculado)} />
                <Linea
                  rotulo="Divisor HH aplicado"
                  valor={resultado.verificacion.divisorAplicado.toFixed(2)}
                />
                <Linea
                  rotulo="Diferencia con la oferta"
                  valor={
                    resultado.verificacion.diferencia === 0
                      ? "cuadra exacto"
                      : clp(resultado.verificacion.diferencia)
                  }
                  destacado={resultado.verificacion.diferencia === 0 ? "teal" : "naranjo"}
                />
              </dl>

              {resultado.avisos.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-borde pt-3">
                  {resultado.avisos.map((aviso, i) => (
                    <li key={i} className="flex gap-2 text-xs text-pretty text-tinta/60">
                      <span aria-hidden className="text-naranjo">
                        ·
                      </span>
                      {aviso}
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={() => router.push(`/cotizador/${resultado.id}`)}
                className="mt-4 rounded-lg bg-naranjo px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
              >
                Abrir la cotización →
              </button>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function Linea({
  rotulo,
  valor,
  destacado,
}: {
  rotulo: string;
  valor: string;
  destacado?: "teal" | "naranjo";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-tinta/55">{rotulo}</dt>
      <dd
        className={`tabular-nums ${
          destacado === "teal"
            ? "font-semibold text-teal"
            : destacado === "naranjo"
              ? "font-semibold text-naranjo"
              : "text-tinta"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}
