import ActividadReciente from "./ActividadReciente";
import BloqueSuperior from "./BloqueSuperior";
import { WidgetNoDisponible } from "./CajaDeWidget";
import WidgetAcreditacion from "./WidgetAcreditacion";
import WidgetArranque from "./WidgetArranque";
import WidgetDocumentos from "./WidgetDocumentos";
import WidgetVehiculos from "./WidgetVehiculos";
import type {
  DocumentosDelTablero,
  PlazosDelTablero,
  ResponsablesDelTablero,
  ResumenDeAcreditacion,
  ResumenDeArranqueDelTablero,
  ResumenDeVehiculos,
} from "@/lib/contratos/dashboard-modelo";

// Los envoltorios que esperan sus datos. Cada widget del tablero se pinta dentro de su propio
// <Suspense> (ver app/(protegido)/page.tsx), así que aparece apenas SU lectura termina: la
// pantalla de entrada no espera a que SharePoint responda para mostrar lo que sale de la base.
//
// Reciben la PROMESA, no el dato: se crean todas a la vez en la página, y cada una espera solo la
// suya. Una que falla no tumba a las demás: el widget dice qué pasó y el resto sigue en pie.

type Promesa<T> = Promise<T | null>;

export async function SuperiorConDatos({
  documentos,
  acreditacion,
  vehiculos,
  logistica,
  gastos,
  plazos,
  responsables,
  contrato,
  hoy,
}: {
  documentos: Promesa<DocumentosDelTablero>;
  acreditacion: Promesa<ResumenDeAcreditacion>;
  vehiculos: Promesa<ResumenDeVehiculos>;
  logistica: Promesa<ResumenDeArranqueDelTablero>;
  gastos: Promesa<ResumenDeArranqueDelTablero>;
  plazos: Promise<PlazosDelTablero>;
  responsables: Promise<ResponsablesDelTablero>;
  contrato: Promise<{ nombre: string; fechaInicio: string | null; administrador: string | null; logo?: string | null }>;
  hoy: string;
}) {
  const [d, a, v, l, g, p, r, c] = await Promise.all([
    documentos,
    acreditacion,
    vehiculos,
    logistica,
    gastos,
    plazos,
    responsables,
    contrato,
  ]);
  return (
    <BloqueSuperior
      datos={{ documentos: d, acreditacion: a, vehiculos: v, logistica: l, gastos: g }}
      plazos={p}
      responsables={r}
      contrato={c}
      hoy={hoy}
    />
  );
}

export async function DocumentosConDatos({
  datos,
  plazos,
}: {
  datos: Promesa<DocumentosDelTablero>;
  plazos: Promise<PlazosDelTablero>;
}) {
  const [d, p] = await Promise.all([datos, plazos]);
  if (!d) return <WidgetNoDisponible titulo="Documentos generales" mensaje="No se pudo leer SharePoint." />;
  return <WidgetDocumentos datos={d} plazo={p.documentos ?? null} />;
}

export async function AcreditacionConDatos({
  datos,
  plazos,
}: {
  datos: Promesa<ResumenDeAcreditacion>;
  plazos: Promise<PlazosDelTablero>;
}) {
  const [d, p] = await Promise.all([datos, plazos]);
  if (!d) return <WidgetNoDisponible titulo="Acreditación Personas" mensaje="No se pudo leer la nómina." />;
  return <WidgetAcreditacion datos={d} plazo={p.acreditacion ?? null} />;
}

export async function VehiculosConDatos({
  datos,
  plazos,
}: {
  datos: Promesa<ResumenDeVehiculos>;
  plazos: Promise<PlazosDelTablero>;
}) {
  const [d, p] = await Promise.all([datos, plazos]);
  if (!d) return <WidgetNoDisponible titulo="Acreditación Vehículos" mensaje="No se pudo leer la flota." />;
  return <WidgetVehiculos datos={d} plazo={p.vehiculos ?? null} />;
}

export async function ActividadConDatos({ datos }: { datos: Promesa<ResumenDeAcreditacion> }) {
  const d = await datos;
  if (!d) return null;
  return <ActividadReciente movimientos={d.movimientos} />;
}

export async function ArranqueConDatos({
  datos,
  plazos,
  clave,
}: {
  datos: Promesa<ResumenDeArranqueDelTablero>;
  plazos: Promise<PlazosDelTablero>;
  clave: "logistica" | "gastos";
}) {
  const [d, p] = await Promise.all([datos, plazos]);
  if (!d) {
    return (
      <WidgetNoDisponible
        titulo={clave === "logistica" ? "Logística" : "Gastos de arranque"}
        mensaje="No se pudieron leer las partidas."
      />
    );
  }
  return <WidgetArranque datos={d} plazo={p[clave] ?? null} />;
}
