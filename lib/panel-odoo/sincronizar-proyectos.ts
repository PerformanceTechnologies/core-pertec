import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";

type TuplaOdoo = [number, string] | false;
function nombreDeTupla(t: TuplaOdoo): string | null {
  return Array.isArray(t) ? t[1] : null;
}
function idDeTupla(t: TuplaOdoo): number | null {
  return Array.isArray(t) ? t[0] : null;
}

interface ProyectoOdoo {
  id: number;
  name: string;
  partner_id: TuplaOdoo;
  user_id: TuplaOdoo;
  task_count: number;
  date: string | false;
  active: boolean;
}

interface TareaOdoo {
  id: number;
  name: string;
  project_id: TuplaOdoo;
  stage_id: TuplaOdoo;
  state: string;
  date_deadline: string | false;
  user_ids: number[];
}

interface UsuarioOdoo {
  id: number;
  name: string;
}

// project.project/project.task no usan multi-empresa en este Odoo
// (company_id llega vacio en ambos) -- por eso no se filtra ni se guarda
// company_id aca, a diferencia de los demas modulos.
export async function sincronizarProyectos(): Promise<number> {
  const [proyectos, tareas] = await Promise.all([
    odooSearchRead<ProyectoOdoo>(
      "project.project",
      [],
      ["name", "partner_id", "user_id", "task_count", "date", "active"],
      { limit: 500 }
    ),
    odooSearchRead<TareaOdoo>(
      "project.task",
      [],
      ["name", "project_id", "stage_id", "state", "date_deadline", "user_ids"],
      { limit: 2000 }
    ),
  ]);

  const idsAsignados = Array.from(new Set(tareas.flatMap((t) => t.user_ids ?? [])));
  const usuarios =
    idsAsignados.length > 0
      ? await odooSearchRead<UsuarioOdoo>("res.users", [["id", "in", idsAsignados]], ["name"], { limit: idsAsignados.length })
      : [];
  const nombrePorUsuarioId = new Map(usuarios.map((u) => [u.id, u.name]));

  const filasProyectos = proyectos.map((p) => ({
    odoo_id: p.id,
    nombre: p.name,
    partner_nombre: nombreDeTupla(p.partner_id),
    responsable: nombreDeTupla(p.user_id),
    cantidad_tareas: p.task_count,
    fecha_vencimiento: p.date || null,
    activo: p.active,
    actualizado_en: new Date().toISOString(),
  }));

  const filasTareas = tareas.map((t) => ({
    odoo_id: t.id,
    proyecto_odoo_id: idDeTupla(t.project_id),
    proyecto_nombre: nombreDeTupla(t.project_id),
    nombre: t.name,
    etapa: nombreDeTupla(t.stage_id),
    estado: t.state,
    fecha_limite: t.date_deadline || null,
    asignados: (t.user_ids ?? []).map((id) => nombrePorUsuarioId.get(id)).filter(Boolean).join(", ") || null,
    actualizado_en: new Date().toISOString(),
  }));

  if (filasProyectos.length > 0) {
    const { error } = await supabaseAdmin.from("panel_odoo_proyectos").upsert(filasProyectos, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }
  if (filasTareas.length > 0) {
    const { error } = await supabaseAdmin.from("panel_odoo_tareas").upsert(filasTareas, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }

  return filasProyectos.length + filasTareas.length;
}
