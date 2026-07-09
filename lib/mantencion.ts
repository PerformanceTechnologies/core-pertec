import "server-only";
import { pertecWebSupabase } from "./pertec-web-supabase";

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  titulo: string;
  descripcion: string | null;
  seccion: string | null;
  orden: number;
}

export interface ChecklistPlantilla {
  id: string;
  titulo: string;
  descripcion: string | null;
  secciones_obligatorias: string[];
  items: ChecklistItem[];
}

export type EstadoEquipo = "operativo" | "mantencion" | "fuera_servicio" | "revision";

export interface EquipoMantenimiento {
  id: string;
  checklist_id: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoEquipo;
  secciones_activas: string[];
}

export interface FotoEvidencia {
  url: string;
  path: string;
  nombre: string;
}

export interface ChecklistRunItem {
  id: string;
  run_id: string;
  item_id: string | null;
  titulo: string;
  seccion: string | null;
  orden: number;
  descripcion: string | null;
  hecho: boolean;
  hecho_en: string | null;
  notas: string | null;
  fotos: FotoEvidencia[];
  medicion: Record<string, string> | null;
}

export interface ChecklistRun {
  id: string;
  checklist_id: string;
  equipo_id: string;
  titulo: string | null;
  iniciado_en: string;
  cerrado_en: string | null;
  creado_por_email: string | null;
  creado_por_nombre: string | null;
  cerrado_por_email: string | null;
  cerrado_por_nombre: string | null;
  items: ChecklistRunItem[];
}

export interface MantencionBundle {
  plantillas: ChecklistPlantilla[];
  equipos: EquipoMantenimiento[];
  runs: ChecklistRun[];
}

export async function listarMantencion(): Promise<MantencionBundle> {
  const [{ data: cl }, { data: eqs }, { data: rs }] = await Promise.all([
    pertecWebSupabase.from("checklists").select("*, items:checklist_items(*)").order("created_at"),
    pertecWebSupabase.from("equipos_mantenimiento").select("*").order("created_at"),
    pertecWebSupabase
      .from("checklist_runs")
      .select("*, items:checklist_run_items(*)")
      .order("iniciado_en", { ascending: false }),
  ]);

  const plantillas = (cl ?? []) as ChecklistPlantilla[];
  plantillas.forEach((c) => c.items?.sort((a, b) => a.orden - b.orden));

  const runs = (rs ?? []) as ChecklistRun[];
  runs.forEach((r) => r.items?.sort((a, b) => a.orden - b.orden));

  return { plantillas, equipos: (eqs ?? []) as EquipoMantenimiento[], runs };
}

export async function crearPlantilla(datos: { titulo: string; descripcion: string | null }): Promise<string> {
  const { data, error } = await pertecWebSupabase
    .from("checklists")
    .insert({ titulo: datos.titulo.trim(), descripcion: datos.descripcion?.trim() || null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function obtenerPlantilla(id: string): Promise<ChecklistPlantilla | null> {
  const { data } = await pertecWebSupabase
    .from("checklists")
    .select("*, items:checklist_items(*)")
    .eq("id", id)
    .maybeSingle();
  return (data as ChecklistPlantilla) ?? null;
}

export async function obtenerEquipo(id: string): Promise<EquipoMantenimiento | null> {
  const { data } = await pertecWebSupabase.from("equipos_mantenimiento").select("*").eq("id", id).maybeSingle();
  return (data as EquipoMantenimiento) ?? null;
}

export async function actualizarPlantilla(
  id: string,
  datos: {
    titulo: string;
    descripcion: string | null;
    items: { id?: string; titulo: string; descripcion: string | null; seccion: string }[];
    itemsExistentesIds: string[];
  }
): Promise<void> {
  const { error: errPlantilla } = await pertecWebSupabase
    .from("checklists")
    .update({ titulo: datos.titulo.trim(), descripcion: datos.descripcion?.trim() || null })
    .eq("id", id);
  if (errPlantilla) throw new Error(errPlantilla.message);

  const validos = datos.items.filter((it) => it.titulo.trim());
  const keptIds = validos.filter((it) => it.id).map((it) => it.id!);
  const toDelete = datos.itemsExistentesIds.filter((existingId) => !keptIds.includes(existingId));
  if (toDelete.length) {
    const { error } = await pertecWebSupabase.from("checklist_items").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  const nuevos = validos.filter((it) => !it.id);
  if (nuevos.length) {
    const { error } = await pertecWebSupabase.from("checklist_items").insert(
      nuevos.map((it, idx) => ({
        checklist_id: id,
        titulo: it.titulo.trim(),
        descripcion: it.descripcion?.trim() || null,
        seccion: it.seccion.trim() || "General",
        orden: validos.indexOf(it) ?? idx,
      }))
    );
    if (error) throw new Error(error.message);
  }

  for (let idx = 0; idx < validos.length; idx++) {
    const it = validos[idx];
    if (!it.id) continue;
    const { error } = await pertecWebSupabase
      .from("checklist_items")
      .update({
        titulo: it.titulo.trim(),
        descripcion: it.descripcion?.trim() || null,
        seccion: it.seccion.trim() || "General",
        orden: idx,
      })
      .eq("id", it.id);
    if (error) throw new Error(error.message);
  }
}

export async function crearEquipo(datos: {
  checklist_id: string;
  nombre: string;
  descripcion: string | null;
  estado: EstadoEquipo;
  secciones_activas: string[];
}): Promise<void> {
  const { error } = await pertecWebSupabase.from("equipos_mantenimiento").insert({
    checklist_id: datos.checklist_id,
    nombre: datos.nombre.trim(),
    descripcion: datos.descripcion?.trim() || null,
    estado: datos.estado,
    secciones_activas: datos.secciones_activas,
  });
  if (error) throw new Error(error.message);
}

export async function actualizarEquipo(
  id: string,
  datos: { nombre: string; descripcion: string | null; estado: EstadoEquipo; secciones_activas: string[] }
): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("equipos_mantenimiento")
    .update({
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion?.trim() || null,
      estado: datos.estado,
      secciones_activas: datos.secciones_activas,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function eliminarEquipo(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("equipos_mantenimiento").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Alta de inspección: snapshot de los ítems de la plantilla que aplican al
// equipo (por sección obligatoria o sección activa del equipo), igual que
// el panel original — así una inspección ya creada no cambia si luego se
// edita la plantilla.
export async function crearInspeccion(
  equipo: EquipoMantenimiento,
  plantilla: ChecklistPlantilla,
  inspector: { email: string; nombre: string }
): Promise<string> {
  const obligatorias = new Set(plantilla.secciones_obligatorias || []);
  const activas = new Set(equipo.secciones_activas || []);
  const itemsAplican = (plantilla.items || []).filter((it) => {
    const s = it.seccion || "General";
    return obligatorias.has(s) || activas.has(s);
  });

  const { data: run, error } = await pertecWebSupabase
    .from("checklist_runs")
    .insert({
      checklist_id: plantilla.id,
      equipo_id: equipo.id,
      titulo: equipo.nombre,
      equipo: equipo.nombre,
      creado_por_email: inspector.email,
      creado_por_nombre: inspector.nombre,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (itemsAplican.length > 0) {
    const { error: errItems } = await pertecWebSupabase.from("checklist_run_items").insert(
      itemsAplican.map((it) => ({
        run_id: run.id,
        item_id: it.id,
        titulo: it.titulo,
        seccion: it.seccion,
        orden: it.orden,
        descripcion: it.descripcion || null,
      }))
    );
    if (errItems) throw new Error(errItems.message);
  }

  return run.id as string;
}

export async function eliminarInspeccion(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("checklist_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cerrarInspeccion(id: string, inspector: { email: string; nombre: string }): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("checklist_runs")
    .update({
      cerrado_en: new Date().toISOString(),
      cerrado_por_email: inspector.email,
      cerrado_por_nombre: inspector.nombre,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reabrirInspeccion(id: string): Promise<void> {
  const { error } = await pertecWebSupabase.from("checklist_runs").update({ cerrado_en: null }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function alternarRunItemHecho(id: string, hecho: boolean): Promise<void> {
  const { error } = await pertecWebSupabase
    .from("checklist_run_items")
    .update({ hecho, hecho_en: hecho ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function actualizarRunItemEvidencia(
  id: string,
  patch: Partial<Pick<ChecklistRunItem, "notas" | "fotos" | "medicion">>
): Promise<void> {
  const { error } = await pertecWebSupabase.from("checklist_run_items").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function obtenerRunItem(id: string): Promise<ChecklistRunItem | null> {
  const { data } = await pertecWebSupabase.from("checklist_run_items").select("*").eq("id", id).maybeSingle();
  return (data as ChecklistRunItem) ?? null;
}

export async function obtenerRun(id: string): Promise<ChecklistRun | null> {
  const { data } = await pertecWebSupabase.from("checklist_runs").select("*").eq("id", id).maybeSingle();
  return (data as ChecklistRun) ?? null;
}

// Sube una foto de evidencia al bucket público "equipos" del Supabase de
// pertec-web (mismo bucket que usaba la edge function del panel original).
export async function subirFotoEvidencia(archivo: File): Promise<FotoEvidencia> {
  const extension = archivo.name.split(".").pop() || "jpg";
  const nombreArchivo = `run-items/${crypto.randomUUID()}.${extension}`;
  const { error } = await pertecWebSupabase.storage.from("equipos").upload(nombreArchivo, archivo, {
    contentType: archivo.type || "image/jpeg",
  });
  if (error) throw new Error(error.message);
  const { data } = pertecWebSupabase.storage.from("equipos").getPublicUrl(nombreArchivo);
  return { url: data.publicUrl, path: nombreArchivo, nombre: archivo.name };
}
