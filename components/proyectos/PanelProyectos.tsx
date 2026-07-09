"use client";

import { useState } from "react";
import type { RolPanel } from "@/lib/permisos-panel";
import SelectorProyectos from "./SelectorProyectos";
import VistaProyecto from "./VistaProyecto";

// Sin localStorage a propósito: cada vez que se entra a /proyectos desde el
// sidebar debe aterrizar en el listado, no en el último proyecto visitado.
export default function PanelProyectos({ rolPanel }: { rolPanel: RolPanel }) {
  const [proyectoId, setProyectoId] = useState<string | null>(null);

  if (!proyectoId) {
    return <SelectorProyectos rolPanel={rolPanel} onElegir={setProyectoId} />;
  }

  return <VistaProyecto proyectoId={proyectoId} rolPanel={rolPanel} onVolver={() => setProyectoId(null)} />;
}
