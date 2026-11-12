import { NextResponse } from "next/server";
import { verificarAccesoRendidorApi } from "@/lib/rendidor/permisos";
import { esEditable, puedeAbrirRendicion } from "@/lib/permisos-rendidor";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { subirRespaldo } from "@/lib/rendidor/almacenamiento";

export const runtime = "nodejs";

const TIPOS_ACEPTADOS = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_MB = 4;

// Adjunta el respaldo de un gasto ingresado a mano: guarda el archivo en el bucket y devuelve su
// ruta, sin leerlo con IA. Mismas reglas de acceso que /analizar.
export async function POST(request: Request) {
  const acceso = await verificarAccesoRendidorApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const formulario = await request.formData();
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });

  const rendicionId = String(formulario.get("rendicionId") ?? "");
  if (!rendicionId) return NextResponse.json({ error: "Falta la rendición." }, { status: 400 });
  const rendicion = await obtenerRendicion(rendicionId);
  if (!rendicion) return NextResponse.json({ error: "No encontramos esa rendición." }, { status: 404 });
  if (!puedeAbrirRendicion(rendicion.creadoPor, acceso.usuario.id, acceso.usuario.rol, acceso.rol, rendicion.rindeCorreo, acceso.usuario.correo)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (!esEditable(rendicion.estado)) {
    return NextResponse.json({ error: "La rendición ya se envió a revisión: no se le pueden sumar comprobantes." }, { status: 409 });
  }
  if (!TIPOS_ACEPTADOS.includes(archivo.type)) {
    return NextResponse.json({ error: `"${archivo.name}" es de tipo ${archivo.type || "desconocido"}. Se aceptan PDF, JPEG, PNG, GIF y WEBP.` }, { status: 400 });
  }
  if (archivo.size > MAX_MB * 1024 * 1024) {
    return NextResponse.json({ error: `"${archivo.name}" pesa más de ${MAX_MB} MB. Redúcelo antes de subirlo.` }, { status: 400 });
  }

  try {
    const archivoPath = await subirRespaldo(rendicionId, Buffer.from(await archivo.arrayBuffer()), archivo.type, archivo.name);
    return NextResponse.json({ archivoPath });
  } catch (error) {
    console.error("[rendidor] Error al subir el respaldo:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos guardar el documento." }, { status: 500 });
  }
}
