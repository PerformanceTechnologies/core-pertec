"use client";

import { useEffect, useState } from "react";
import type { RolPanel } from "@/lib/permisos-panel";
import SelectorProyectos from "./SelectorProyectos";
import VistaProyecto from "./VistaProyecto";
import SeccionMantencion from "@/components/mantencion/SeccionMantencion";

const CLAVE_PROYECTO_ACTIVO = "core-proyecto-activo";
const CLAVE_VISTA_GLOBAL = "core-proyectos-vista-global";

type VistaGlobal = "objetivos" | "mantencion";

export default function PanelProyectos({ rolPanel }: { rolPanel: RolPanel }) {
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [vistaGlobal, setVistaGlobal] = useState<VistaGlobal>("objetivos");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setProyectoId(window.localStorage.getItem(CLAVE_PROYECTO_ACTIVO));
    const vistaGuardada = window.localStorage.getItem(CLAVE_VISTA_GLOBAL);
    if (vistaGuardada === "mantencion" || vistaGuardada === "objetivos") setVistaGlobal(vistaGuardada);
    setListo(true);
  }, []);

  const elegirProyecto = (id: string | null) => {
    setProyectoId(id);
    if (id) window.localStorage.setItem(CLAVE_PROYECTO_ACTIVO, id);
    else window.localStorage.removeItem(CLAVE_PROYECTO_ACTIVO);
  };

  const cambiarVista = (vista: VistaGlobal) => {
    setVistaGlobal(vista);
    window.localStorage.setItem(CLAVE_VISTA_GLOBAL, vista);
  };

  if (!listo) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 self-start rounded-full border border-borde bg-white p-1">
        <button
          onClick={() => cambiarVista("objetivos")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[.1em] transition ${
            vistaGlobal === "objetivos" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
          }`}
        >
          Objetivos
        </button>
        <button
          onClick={() => cambiarVista("mantencion")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[.1em] transition ${
            vistaGlobal === "mantencion" ? "bg-naranjo text-white shadow-[0_4px_14px_rgba(200,82,23,.25)]" : "text-tinta/50 hover:text-tinta"
          }`}
        >
          Mantención
        </button>
      </div>

      {vistaGlobal === "mantencion" ? (
        <SeccionMantencion rolPanel={rolPanel} />
      ) : !proyectoId ? (
        <SelectorProyectos rolPanel={rolPanel} onElegir={elegirProyecto} />
      ) : (
        <VistaProyecto proyectoId={proyectoId} rolPanel={rolPanel} onVolver={() => elegirProyecto(null)} />
      )}
    </div>
  );
}
