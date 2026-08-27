"use client";

import { useState } from "react";
import Link from "next/link";
import type { EmpresaIdentidad } from "@/lib/cotizador/empresas";
import { lineaIdentidadEmpresa } from "@/lib/cotizador/empresas";
import type { DatosEmpresa } from "@/lib/cotizador/empresas-datos";
import { actualizarEmpresaAction } from "@/app/(protegido)/cotizador/empresas/acciones";
import { TextInput } from "./campos/Campos";

// Los datos legales de la empresa emisora se imprimen en el encabezado del
// ECO-1 y del PDF que se le manda al mandante. Antes estaban hardcodeados en
// EcoTab.tsx, con valores de relleno e iguales para las 3 empresas: una
// cotización de PERFORMANCE TECHNOLOGIES salía con encabezado de ZEUS MINING.
// Acá se cargan los reales.
//
// El nombre (la clave que guarda cotizaciones.empresa) no se edita: renombrarlo
// desligaría las cotizaciones ya emitidas de su identidad.

const CAMPOS: { clave: keyof DatosEmpresa; etiqueta: string; ayuda?: string; ancho?: string }[] = [
  {
    clave: "razonSocial",
    etiqueta: "Razón social",
    ayuda: "Como debe aparecer en el encabezado del documento",
    ancho: "sm:col-span-2",
  },
  { clave: "rut", etiqueta: "RUT", ayuda: "Ej: 76.123.456-7" },
  { clave: "direccion", etiqueta: "Dirección" },
  { clave: "ciudad", etiqueta: "Ciudad" },
  { clave: "email", etiqueta: "Correo de contacto" },
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "representanteLegal", etiqueta: "Representante legal" },
];

function aDatos(e: EmpresaIdentidad): DatosEmpresa {
  return {
    razonSocial: e.razonSocial,
    rut: e.rut,
    direccion: e.direccion,
    ciudad: e.ciudad,
    email: e.email,
    telefono: e.telefono,
    representanteLegal: e.representanteLegal,
    activo: e.activo,
  };
}

export default function PanelEmpresas({
  empresasIniciales,
  puedeEditar,
}: {
  empresasIniciales: EmpresaIdentidad[];
  puedeEditar: boolean;
}) {
  const [empresas, setEmpresas] = useState(empresasIniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actualizarLocal = (id: string, patch: Partial<EmpresaIdentidad>) =>
    setEmpresas((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const guardar = async (empresa: EmpresaIdentidad) => {
    setError(null);
    setGuardado(null);
    setGuardando(empresa.id);
    try {
      await actualizarEmpresaAction(empresa.id, aDatos(empresa));
      setGuardado(empresa.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los datos.");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div>
      <Link href="/cotizador" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Cotizaciones
      </Link>

      <div className="mt-2">
        <span className="etiqueta-seccion">Cotizador</span>
      </div>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">Empresas emisoras</h1>
      <p className="mt-1 max-w-2xl text-sm text-tinta/60">
        Identidad legal que se imprime en el encabezado del ECO-1 y del PDF de cada cotización, según la
        empresa que la emite. Lo que quede en blanco simplemente no se muestra en el documento.
      </p>

      {!puedeEditar && (
        <div className="mt-3 rounded-lg border border-borde bg-crema/60 px-3 py-2 text-xs text-tinta/60">
          Solo lectura: necesitas permiso de administrador del Cotizador para editar estos datos.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-lg border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {empresas.map((empresa) => {
          const vistaPrevia = lineaIdentidadEmpresa(empresa);
          const incompleta = !empresa.razonSocial.trim() || !empresa.rut.trim();

          return (
            <div key={empresa.id} className="rounded-2xl border border-borde bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                    {empresa.nombre}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tinta/45">
                    Clave interna — no editable, es la que guardan las cotizaciones ya emitidas.
                  </p>
                </div>
                {incompleta && (
                  <span className="rounded-full bg-naranjo/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                    Datos incompletos
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CAMPOS.map((campo) => (
                  <div key={campo.clave} className={campo.ancho ?? ""}>
                    <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                      {campo.etiqueta}
                    </label>
                    <div className="mt-1">
                      <TextInput
                        value={String(empresa[campo.clave as keyof EmpresaIdentidad] ?? "")}
                        onChange={(v) =>
                          actualizarLocal(empresa.id, { [campo.clave]: v } as Partial<EmpresaIdentidad>)
                        }
                        disabled={!puedeEditar || guardando === empresa.id}
                        className="w-full"
                      />
                    </div>
                    {campo.ayuda && <p className="mt-1 text-[10px] text-tinta/40">{campo.ayuda}</p>}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg bg-crema/60 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                  Así se verá en el documento
                </p>
                <p className="mt-1 font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
                  {empresa.razonSocial.trim() || empresa.nombre}
                </p>
                {vistaPrevia ? (
                  <p className="mt-0.5 text-xs text-tinta/60">{vistaPrevia}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-naranjo">
                    Sin datos legales: el documento saldrá solo con el nombre.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => guardar(empresa)}
                  disabled={!puedeEditar || guardando === empresa.id}
                  className="texto-sobre-contraste rounded-md bg-tinta px-4 py-2 text-xs font-semibold uppercase tracking-wide transition hover:bg-tinta/85 disabled:cursor-default disabled:opacity-40"
                >
                  {guardando === empresa.id ? "Guardando..." : "Guardar"}
                </button>
                {guardado === empresa.id && guardando !== empresa.id && (
                  <span className="text-xs font-medium text-teal">Guardado</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
