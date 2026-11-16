import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { etiquetaTipoProyecto } from "@/lib/fin/modelo";
import { armarInfoProyecto, type InfoProyecto } from "@/lib/fin/info-proyecto";

/** Fila mínima de fin_proyectos para armar su código. */
export interface FilaProyecto {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  mandante_id: string | null;
  fecha_inicio: string | null;
  es_general?: boolean | null;
}

/** El código compuesto (MAND-CLI-AÑO-TIP) y la ficha corta de cada proyecto, por id. */
export async function infoDeProyectos(filas: FilaProyecto[]): Promise<Map<string, InfoProyecto>> {
  const clientesIds = [...new Set(filas.map((f) => f.mandante_id).filter(Boolean) as string[])];
  const contactos = new Map<string, { nombre: string; sigla: string | null; mandanteIds: string[] }>();
  const leer = async (ids: string[]) => {
    if (!ids.length) return;
    const { data } = await supabaseAdmin.from("finanzas_contactos").select("id, razon_social, sigla, mandante_ids").in("id", ids);
    for (const c of data ?? []) contactos.set(c.id, { nombre: c.razon_social, sigla: c.sigla ?? null, mandanteIds: c.mandante_ids ?? [] });
  };
  await leer(clientesIds);
  await leer([...new Set(clientesIds.flatMap((id) => contactos.get(id)?.mandanteIds.slice(0, 1) ?? []))].filter((id) => !contactos.has(id)));
  const out = new Map<string, InfoProyecto>();
  for (const f of filas) {
    const cliente = f.mandante_id ? contactos.get(f.mandante_id) : undefined;
    const mandante = cliente?.mandanteIds[0] ? contactos.get(cliente.mandanteIds[0]) : undefined;
    out.set(f.id, armarInfoProyecto({
      codigoInterno: f.codigo, nombre: f.nombre, tipo: f.tipo, tipoTexto: etiquetaTipoProyecto(f.tipo), fechaInicio: f.fecha_inicio,
      cliente: cliente ? { nombre: cliente.nombre, sigla: cliente.sigla } : null,
      mandante: mandante ? { nombre: mandante.nombre, sigla: mandante.sigla } : null,
      general: Boolean(f.es_general),
    }));
  }
  return out;
}
