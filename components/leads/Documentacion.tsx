import VerDocumento from "./VerDocumento";
import { Seccion } from "@/components/fin/piezas";
import { TARJETA } from "@/lib/estilos";

/** Qué se puede subir en «Documentación» (leads y cotizaciones). */
export const OPCIONES_DOCUMENTACION = [
  { tipo: "respaldo", texto: "Archivo de respaldo" },
  { tipo: "oc_cliente", texto: "Orden de compra (OC)" },
];

const ETIQUETA: Record<string, string> = { respaldo: "Respaldo", oc_cliente: "OC", cotizacion_cliente: "Respaldo", otro: "Respaldo" };

export function ListaDocumentacion({ adjuntos }: { adjuntos: { id: string; nombre: string; tipo: string }[] }) {
  return (
    <Seccion titulo="Documentación">
      <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
        {adjuntos.map((a) => (
          <li key={a.id} className="flex items-center gap-2 px-4 py-2">
            <span className={`shrink-0 rounded-full px-2 py-px text-[10px] font-bold uppercase tracking-wide ${a.tipo === "oc_cliente" ? "bg-naranjo/12 text-naranjo" : "bg-slate-500/10 text-gris"}`}>{ETIQUETA[a.tipo] ?? "Respaldo"}</span>
            <span className="min-w-0 truncate"><VerDocumento id={a.id} nombre={a.nombre} /></span>
          </li>
        ))}
        {adjuntos.length === 0 && <li className="px-4 py-3 text-xs text-gris">Sin documentación.</li>}
      </ul>
    </Seccion>
  );
}
