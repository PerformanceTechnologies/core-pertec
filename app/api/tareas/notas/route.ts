import { NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { borrarAdjuntos, crearNota, obtenerTarea, registrarEvento, subirAdjunto } from "@/lib/tareas";
import { LIMITE_SUBIDA } from "@/lib/subidas";
import {
  ADJUNTOS_ACEPTADOS,
  SLUG_APP_TAREAS,
  TIPOS_ADJUNTO,
  puedeVerTarea,
  type ArchivoNota,
} from "@/lib/tareas-modelo";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ARCHIVOS = 10;

// Crea una nota (texto y/o archivos) en una tarea. Va por route handler y no por Server
// Action porque lleva archivos: así el tope es el de Vercel (~4,5 MB por request) y no el
// de 1 MB de las acciones.
export async function POST(request: Request) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_TAREAS);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const usuario = acceso.usuario;

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el formulario." }, { status: 400 });
  }

  const tareaId = String(fd.get("tareaId") ?? "");
  const tarea = /^[0-9a-f-]{36}$/.test(tareaId) ? await obtenerTarea(tareaId) : null;
  if (!tarea || !puedeVerTarea(tarea, usuario.correo)) {
    return NextResponse.json({ error: "Esa tarea ya no existe o no tienes acceso a ella." }, { status: 404 });
  }

  const texto = String(fd.get("texto") ?? "").trim().slice(0, 8000) || null;
  const archivos = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);
  if (!texto && archivos.length === 0) return NextResponse.json({ error: "Escribe algo o adjunta un archivo." }, { status: 400 });
  if (archivos.length > MAX_ARCHIVOS) {
    return NextResponse.json({ error: `Hasta ${MAX_ARCHIVOS} archivos por nota.` }, { status: 400 });
  }
  if (archivos.reduce((t, a) => t + a.size, 0) > LIMITE_SUBIDA) {
    return NextResponse.json({ error: "Los archivos de una nota no pueden pasar de 4 MB en total." }, { status: 413 });
  }
  // La extensión sale del MIME aceptado, nunca del nombre que manda el navegador.
  for (const a of archivos) {
    if (!Object.hasOwn(TIPOS_ADJUNTO, a.type)) {
      return NextResponse.json(
        { error: `"${a.name}" es de tipo ${a.type || "desconocido"}. Se aceptan ${ADJUNTOS_ACEPTADOS}.` },
        { status: 400 },
      );
    }
  }

  const subidos: ArchivoNota[] = [];
  try {
    for (const a of archivos) {
      const ruta = await subirAdjunto(tareaId, Buffer.from(await a.arrayBuffer()), TIPOS_ADJUNTO[a.type], a.type);
      subidos.push({ nombre: a.name.slice(0, 200), ruta, tipo: a.type, tamano: a.size });
    }
    const id = await crearNota(tareaId, texto, subidos, usuario);
    const detalle = [
      texto ? "una nota" : null,
      subidos.length ? `${subidos.length} archivo${subidos.length > 1 ? "s" : ""} (${subidos.map((s) => s.nombre).join(", ")})` : null,
    ].filter(Boolean).join(" con ");
    await registrarEvento(tareaId, "nota", detalle, usuario);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    // Si algo falló a medio camino, no quedan archivos huérfanos en el bucket.
    await borrarAdjuntos(subidos.map((s) => s.ruta));
    const mensaje = e instanceof Error ? e.message.replace(/^\[tareas\]\s*/, "") : "No se pudo guardar la nota.";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
