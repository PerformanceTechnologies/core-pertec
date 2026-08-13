import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { odooSearchRead } from "./odoo-cliente";
import { eliminarNoVigentes } from "./limpieza";

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
  // Campos del modulo pertec_project_panel (ver pertec-odoo/pertec_project_panel/
  // models/project_task.py). Las tareas que ese panel usa como OBJETIVOS no se
  // cierran con el `state` nativo —todas quedan en 01_in_progress— sino con
  // objetivo_done, y su plazo y sus responsables viven en sus propios campos.
  objetivo_done: boolean;
  objetivo_date_end: string | false;
  objetivo_responsables: string | false;
}

interface UsuarioOdoo {
  id: number;
  name: string;
}

// project.project/project.task no usan multi-empresa en este Odoo
// (company_id llega vacio en ambos) -- por eso no se filtra ni se guarda
// company_id aca, a diferencia de los demas modulos.
// Topes de las consultas a Odoo. Si alguna los alcanza, la limpieza de ESA tabla
// se salta (ver eliminarNoVigentes).
const TOPE_PROYECTOS = 500;
const TOPE_TAREAS = 2000;

export async function sincronizarProyectos(): Promise<number> {
  const [proyectos, tareas] = await Promise.all([
    odooSearchRead<ProyectoOdoo>(
      "project.project",
      [],
      ["name", "partner_id", "user_id", "task_count", "date", "active"],
      { limit: TOPE_PROYECTOS },
    ),
    odooSearchRead<TareaOdoo>(
      "project.task",
      [],
      [
        "name",
        "project_id",
        "stage_id",
        "state",
        "date_deadline",
        "user_ids",
        "objetivo_done",
        "objetivo_date_end",
        "objetivo_responsables",
      ],
      { limit: TOPE_TAREAS },
    ),
  ]);

  const idsAsignados = Array.from(new Set(tareas.flatMap((t) => t.user_ids ?? [])));
  const usuarios =
    idsAsignados.length > 0
      ? await odooSearchRead<UsuarioOdoo>("res.users", [["id", "in", idsAsignados]], ["name"], {
          limit: idsAsignados.length,
        })
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
    // Una tarea puede estar cerrada por el estado nativo de Odoo o marcada como
    // objetivo cumplido en el panel; el core las cuenta igual.
    completado: Boolean(t.objetivo_done),
    // En las tareas creadas desde el panel, date_deadline viene siempre vacio y
    // el plazo real esta en objetivo_date_end: la columna "Fecha limite" salia
    // entera en guiones.
    fecha_limite: t.date_deadline || t.objetivo_date_end || null,
    asignados:
      (t.user_ids ?? [])
        .map((id) => nombrePorUsuarioId.get(id))
        .filter(Boolean)
        .join(", ") ||
      t.objetivo_responsables ||
      null,
    actualizado_en: new Date().toISOString(),
  }));

  if (filasProyectos.length > 0) {
    const { error } = await supabaseAdmin
      .from("panel_odoo_proyectos")
      .upsert(filasProyectos, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }
  if (filasTareas.length > 0) {
    const { error } = await supabaseAdmin
      .from("panel_odoo_tareas")
      .upsert(filasTareas, { onConflict: "odoo_id" });
    if (error) throw new Error(error.message);
  }

  // Lo que Odoo ya no devuelve sale de la cache, y va DESPUES de los upsert para
  // que un upsert fallido no deje la tabla vaciada.
  //
  // Esto es lo que faltaba cuando el panel mostraba 4 proyectos y 18 tareas
  // teniendo Odoo 3 y 12: un "Plan Harris" que se rehizo en Odoo con otro id
  // quedo en la cache con sus cinco tareas, y las tareas aparecian repetidas en
  // el detalle. El upsert nunca borra, solo escribe encima de lo que coincide.
  if (filasProyectos.length > 0) {
    await eliminarNoVigentes(
      "panel_odoo_proyectos",
      filasProyectos.map((f) => f.odoo_id),
      { topeAlcanzado: proyectos.length >= TOPE_PROYECTOS },
    );
  }
  if (filasTareas.length > 0) {
    await eliminarNoVigentes(
      "panel_odoo_tareas",
      filasTareas.map((f) => f.odoo_id),
      { topeAlcanzado: tareas.length >= TOPE_TAREAS },
    );
  }

  return filasProyectos.length + filasTareas.length;
}
