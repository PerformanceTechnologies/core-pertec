"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EMPRESAS, type Empresa } from "@/lib/cotizador/empresas";
import { FORMATOS_ACEPTADOS } from "@/lib/cotizador/obra/formatos";
import { FORMATOS_LOGO } from "@/lib/ofertas/logo";
import RuedaCarga from "@/components/RuedaCarga";
import { BOTON_PRIMARIO } from "@/lib/estilos";

/**
 * Paso 1: subir el borrador.
 *
 * No emite nada. Deja la oferta normalizada en estado borrador y lleva a la
 * pantalla de revisión, que es donde se ven las inconsistencias. Ese corte es
 * deliberado: un botón que subiera y emitiera de una convertiría los avisos en
 * decoración.
 */
export default function SubirBorrador() {
  const router = useRouter();
  const [empresa, setEmpresa] = useState<Empresa>(EMPRESAS[1]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El logo se guarda después de crear la oferta, así que puede fallar cuando el
  // trabajo caro ya está hecho. En ese caso no se navega a ciegas: se dice, y la
  // oferta queda a un clic.
  const [aviso, setAviso] = useState<{ id: string; texto: string } | null>(null);

  const subir = async () => {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.set("archivo", archivo);
      cuerpo.set("empresa", empresa);
      if (logo) cuerpo.set("logoCliente", logo);
      const respuesta = await fetch("/api/ofertas/analizar", { method: "POST", body: cuerpo });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo leer el borrador.");
      if (datos.avisoLogo) {
        setAviso({ id: datos.id, texto: datos.avisoLogo });
        setCargando(false);
        return;
      }
      router.push(`/ofertas/${datos.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el borrador.");
      setCargando(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-borde bg-crema/50 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_220px_auto]">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Borrador (Word, PDF o Excel)
          </span>
          <input
            type="file"
            accept={FORMATOS_ACEPTADOS}
            disabled={cargando}
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="mt-1 w-full rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta file:mr-3 file:rounded-md file:border-0 file:bg-crema file:px-3 file:py-1 file:text-xs file:font-semibold file:text-tinta/70"
          />
        </label>

        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Logo del cliente (opcional)
          </span>
          <input
            type="file"
            accept={FORMATOS_LOGO}
            disabled={cargando}
            onChange={(e) => {
              setLogo(e.target.files?.[0] ?? null);
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
            onClick={subir}
            disabled={!archivo || cargando}
            className={`${BOTON_PRIMARIO} inline-flex h-[38px] items-center gap-2 py-0 disabled:opacity-40`}
          >
            {cargando && <RuedaCarga />}
            {cargando ? "Normalizando…" : "Normalizar"}
          </button>
        </div>
      </div>

      <p className="mt-3 text-xs text-pretty text-tinta/50">
        El modelo transcribe el borrador a la estructura canónica —las diez secciones del maestro— y el
        servidor calcula los totales y corre los controles. Ningún total lo calcula el modelo. Después revisás
        lo que quedó marcado y ahí se emite el PDF. El logo del cliente va en la celda derecha del encabezado,
        en todas las páginas; si no se sube, ahí queda el rótulo del maestro y se puede agregar después.
      </p>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      {aviso && (
        <div className="mt-3 rounded-lg border border-naranjo/30 bg-superficie p-3">
          <p className="text-sm text-pretty text-tinta/70">{aviso.texto}</p>
          <button
            type="button"
            onClick={() => router.push(`/ofertas/${aviso.id}`)}
            className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-naranjo transition-colors hover:text-naranjo/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Ir a la oferta →
          </button>
        </div>
      )}
    </div>
  );
}
