import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verificarAccesoRendidorApi } from "@/lib/rendidor/permisos";
import { contextoDeEmpresa } from "@/lib/empresas";
import { obtenerFondo, rolesDe } from "@/lib/rendidor/fondos";
import { guardarArchivo } from "@/lib/archivos/almacen";
import { nombreUnico } from "@/lib/archivos/sharepoint-core";

export const runtime = "nodejs";

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_MB = 4;

// Tesorería sube el comprobante de una transferencia o depósito (antes de registrarla). Va a
// SharePoint («Rendiciones/Fondos/<año>/<código>») y, si falla, al bucket de respaldos. Devuelve
// la referencia que se anota en el movimiento del libro.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await verificarAccesoRendidorApi();
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  const { id } = await params;
  const { activa } = await contextoDeEmpresa(acceso.usuario.id, acceso.usuario.rol);
  if (!activa) return NextResponse.json({ error: "No tienes una empresa activa." }, { status: 403 });
  const roles = await rolesDe(acceso.usuario, acceso.rol === "admin", activa.id);
  if (!roles.includes("tesoreria")) return NextResponse.json({ error: "Solo Tesorería sube comprobantes." }, { status: 403 });
  const fondo = await obtenerFondo(id);
  if (!fondo || fondo.empresaId !== activa.id) return NextResponse.json({ error: "No encontramos ese fondo." }, { status: 404 });

  const archivo = (await request.formData()).get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "No se recibió ningún archivo." }, { status: 400 });
  if (!TIPOS.includes(archivo.type)) return NextResponse.json({ error: "Se aceptan PDF, JPG, PNG o WEBP." }, { status: 400 });
  if (archivo.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `El archivo pesa más de ${MAX_MB} MB.` }, { status: 400 });

  const extension = archivo.type === "application/pdf" ? "pdf" : archivo.type.replace("image/", "");
  try {
    const ruta = await guardarArchivo({
      carpeta: `Rendiciones/Fondos/${new Date().getFullYear()}/${fondo.codigo}`,
      nombre: nombreUnico(`comprobante ${archivo.name}`, extension),
      contenido: Buffer.from(await archivo.arrayBuffer()),
      tipo: archivo.type,
      respaldo: { bucket: "rendiciones-respaldos", ruta: `fondos/${id}/${randomUUID()}.${extension}` },
    });
    return NextResponse.json({ ruta });
  } catch (e) {
    console.error("[rendidor] Error al subir el comprobante:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "No pudimos guardar el comprobante." }, { status: 500 });
  }
}
