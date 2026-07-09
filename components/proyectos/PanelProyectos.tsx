"use client";

import { useEffect, useState } from "react";
import type { RolPanel } from "@/lib/permisos-panel";
import SelectorProyectos from "./SelectorProyectos";
import VistaProyecto from "./VistaProyecto";

const CLAVE_PROYECTO_ACTIVO = "core-proyecto-activo";

export default function PanelProyectos({ rolPanel }: { rolPanel: RolPanel }) {
  const [proyectoId, setProyectoId] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    setProyectoId(window.localStorage.getItem(CLAVE_PROYECTO_ACTIVO));
    setListo(true);
  }, []);

  const elegirProyecto = (id: string | null) => {
    setProyectoId(id);
    if (id) window.localStorage.setItem(CLAVE_PROYECTO_ACTIVO, id);
    else window.localStorage.removeItem(CLAVE_PROYECTO_ACTIVO);
  };

  if (!listo) return null;

  if (!proyectoId) {
    return <SelectorProyectos rolPanel={rolPanel} onElegir={elegirProyecto} />;
  }

  return <VistaProyecto proyectoId={proyectoId} rolPanel={rolPanel} onVolver={() => elegirProyecto(null)} />;
}
