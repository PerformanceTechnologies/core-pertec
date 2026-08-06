"use client";

import { useState } from "react";

// Quien rinde se toma de la ficha de empleados de Odoo, no de un nombre escrito
// a mano. El nombre a mano era el punto más frágil del flujo: bastaba una tilde
// o un segundo apellido de diferencia para que el gasto no se pudiera cargar, y
// el error aparecía al final, después de analizar todos los comprobantes.
//
// Lo que viaja en el formulario es el `odooEmployeeId`. El nombre lo relee el
// servidor desde Odoo, así que no se puede mandar un nombre que no corresponda
// al id.

export interface EmpleadoOpcion {
  id: number;
  name: string;
  department_id: [number, string] | false;
  work_email?: string | false;
}

export default function SelectorEmpleado({ inicial }: { inicial: EmpleadoOpcion | null }) {
  const [elegido, setElegido] = useState<EmpleadoOpcion | null>(inicial);
  const [busqueda, setBusqueda] = useState("");
  const [candidatos, setCandidatos] = useState<EmpleadoOpcion[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async () => {
    const termino = busqueda.trim();
    if (termino.length < 2) {
      setError("Escribí al menos 2 letras del nombre.");
      return;
    }
    setBuscando(true);
    setError(null);
    try {
      const resp = await fetch(`/api/rendidor/empleados?nombre=${encodeURIComponent(termino)}`);
      const texto = await resp.text();
      let json: { empleados?: EmpleadoOpcion[]; error?: string };
      try {
        json = JSON.parse(texto);
      } catch {
        throw new Error(`El servidor respondió ${resp.status} sin datos utilizables.`);
      }
      if (!resp.ok) throw new Error(json.error ?? "No se pudo buscar.");

      const empleados = json.empleados ?? [];
      setCandidatos(empleados);
      if (empleados.length === 0) {
        setError(`Ningún empleado de Odoo coincide con "${termino}".`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar Odoo.");
    } finally {
      setBuscando(false);
    }
  };

  const etiqueta = (e: EmpleadoOpcion) =>
    e.department_id ? `${e.name} · ${e.department_id[1]}` : e.name;

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
        Quién rinde (empleado de Odoo)
      </label>

      {/* El valor que realmente se envía. required deja que el navegador
          bloquee el submit si no hay nadie elegido. */}
      <input type="hidden" name="odooEmployeeId" value={elegido?.id ?? ""} required />

      {elegido ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-teal/30 bg-teal/5 px-2.5 py-1.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-tinta">{elegido.name}</p>
            <p className="truncate text-[10px] text-tinta/50">
              Odoo #{elegido.id}
              {elegido.department_id && ` · ${elegido.department_id[1]}`}
              {elegido.work_email && ` · ${elegido.work_email}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setElegido(null);
              setCandidatos(null);
            }}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-tinta/50 underline hover:text-naranjo"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <>
          <div className="mt-1 flex gap-2">
            <input
              value={busqueda}
              onChange={(ev) => setBusqueda(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  // Sin esto el Enter enviaría el formulario entero sin empleado.
                  ev.preventDefault();
                  void buscar();
                }
              }}
              placeholder="Buscar por nombre en Odoo"
              className="min-w-0 flex-1 rounded-md border border-borde bg-white px-2.5 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={buscar}
              disabled={buscando}
              className="shrink-0 rounded-md border border-borde bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-40"
            >
              {buscando ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {candidatos && candidatos.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-borde bg-white">
              {candidatos.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setElegido(e)}
                    className="block w-full px-2.5 py-1.5 text-left text-sm text-tinta transition hover:bg-naranjo/5"
                  >
                    {etiqueta(e)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
      {!error && !elegido && (
        <p className="mt-1 text-[10px] text-tinta/40">
          No encontramos tu ficha por el correo: buscala por nombre.
        </p>
      )}
    </div>
  );
}
