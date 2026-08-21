"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPRESAS, type Empresa } from "@/lib/cotizador/empresas";
import { FORMATOS_ACEPTADOS } from "@/lib/cotizador/obra/formatos";
import RuedaCarga from "@/components/RuedaCarga";
import { BOTON_PRIMARIO } from "@/lib/estilos";
import { avisoDeTamano, leerRespuesta } from "@/lib/subidas";

/**
 * Subir un maestro de formato.
 *
 * Conviene un PDF: los colores y las proporciones se VEN, y un .docx convertido a
 * texto no tiene color. Se dice en pantalla porque es la diferencia entre que el
 * estilo salga leído del archivo o casi todo por defecto.
 */
export default function SubirMaestro() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa | "">("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string[] | null>(null);

  const subir = async () => {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    setAviso(null);
    try {
      const cuerpo = new FormData();
      cuerpo.set("archivo", archivo);
      if (empresa) cuerpo.set("empresa", empresa);
      const respuesta = await fetch("/api/ofertas/maestros", { method: "POST", body: cuerpo });
      const datos = await leerRespuesta<{ descartados?: string[]; noDistinguidos?: string[] }>(respuesta);
      const pendientes: string[] = [...(datos.descartados ?? []), ...(datos.noDistinguidos ?? [])];
      setAviso(pendientes);
      setArchivo(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el maestro.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-borde bg-crema/50 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px_auto]">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Maestro de formato (mejor en PDF)
          </span>
          <input
            type="file"
            accept={FORMATOS_ACEPTADOS}
            disabled={cargando}
            onChange={(e) => {
              const elegido = e.target.files?.[0] ?? null;
              setAviso(null);
              // El tope se revisa acá y no después de mandarlo: subir 12 MB por una
              // conexión de faena para que el servidor los rechace es tiempo tirado.
              setError(elegido ? avisoDeTamano(elegido) : null);
              setArchivo(elegido);
            }}
            className="mt-1 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta file:mr-3 file:rounded-md file:border-0 file:bg-crema file:px-3 file:py-1 file:text-xs file:font-semibold file:text-tinta/70"
          />
        </label>

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Empresa (opcional)
          </span>
          <select
            value={empresa}
            disabled={cargando}
            onChange={(e) => setEmpresa(e.target.value as Empresa | "")}
            className="mt-1 h-[38px] w-full rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50"
          >
            <option value="">Sirve para todas</option>
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
            onClick={subir}
            disabled={!archivo || cargando}
            className={`${BOTON_PRIMARIO} inline-flex h-[38px] items-center gap-2 py-0 disabled:opacity-40`}
          >
            {cargando && <RuedaCarga />}
            {cargando ? "Leyendo el estilo…" : "Subir maestro"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-pretty text-tinta/50">
        Del maestro se lee el <strong>estilo</strong>: paleta, tipografías, tamaños y el alto del encabezado.
        La estructura —las secciones, la tabla de precios, los aportes a dos columnas— ya está en el sistema y
        es la misma para todos los maestros. Se lee una sola vez: los valores quedan guardados y se pueden
        corregir a mano, así que dos ofertas del mismo maestro salen idénticas.
      </p>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {aviso && (
        <div className="mt-3 rounded-lg border border-borde bg-superficie p-3">
          {aviso.length === 0 ? (
            <p className="text-sm text-teal">Se leyó el estilo completo. Revisá los valores abajo.</p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-naranjo">Quedó por definir</p>
              <ul className="mt-1 flex flex-col gap-1">
                {aviso.map((a, i) => (
                  <li key={i} className="text-xs text-pretty text-tinta/70">
                    {a}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-pretty text-tinta/45">
                Esos quedaron con el valor del maestro de PERTEC, que es un resultado correcto. Si el tuyo usa
                otros, cargalos a mano abajo.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
