import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { contextoFinApi } from "@/lib/fin/datos";
import { tasaIvaDe } from "@/lib/fin/oc-datos";
import { leerCotizacionProveedor } from "@/lib/fin/oc-ia";
import { buscarProveedor, normalizarLectura } from "@/lib/fin/oc-ia-datos";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Vercel corta los cuerpos de más de ~4,5 MB: se avisa antes con un mensaje claro. */
const MAXIMO = 4 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * Lee con IA la cotización de un proveedor (PDF o foto) y devuelve lo que se puede cargar en el formulario de solicitud:
 * título, proveedor (si ya existe en Contactos, por RUT o nombre), ítems, moneda, plazo y pago, con avisos de lo que hay
 * que revisar. No guarda nada: la persona revisa y recién ahí guarda la solicitud.
 */
export async function POST(request: Request) {
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const fd = await request.formData().catch(() => null);
  const archivo = fd?.get("archivo");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Elige el archivo de la cotización." }, { status: 400 });
  if (!TIPOS.includes(archivo.type)) return NextResponse.json({ error: "Sube un PDF o una foto (JPG, PNG o WebP)." }, { status: 400 });
  if (archivo.size > MAXIMO) return NextResponse.json({ error: "El archivo pesa más de 4 MB. Comprímelo o sube solo las páginas con los precios." }, { status: 413 });
  if (archivo.size === 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });

  try {
    const bytes = Buffer.from(await archivo.arrayBuffer());
    const [lectura, tasaIva, contactos] = await Promise.all([
      leerCotizacionProveedor(bytes, archivo.type, archivo.name),
      tasaIvaDe(ctx.empresa.id),
      supabaseAdmin.from("finanzas_contactos").select("id, razon_social, rut, correo, es_cliente, es_proveedor").limit(10000),
    ]);
    const datos = normalizarLectura(lectura, tasaIva);
    const opciones = ((contactos.data ?? []) as { id: string; razon_social: string; rut: string | null; correo: string | null; es_cliente: boolean; es_proveedor: boolean }[])
      .filter((c) => c.es_proveedor || !c.es_cliente)
      .map((c) => ({ id: c.id, nombre: c.razon_social, rut: c.rut, correo: c.correo }));
    const proveedor = buscarProveedor(opciones, lectura.proveedor?.rut ?? null, lectura.proveedor?.razonSocial ?? null);
    const avisos = [...datos.avisos];
    if (!proveedor && (lectura.proveedor?.razonSocial || lectura.proveedor?.rut)) {
      avisos.unshift(`El proveedor «${lectura.proveedor.razonSocial ?? lectura.proveedor.rut}» no está en Contactos: elígelo de la lista o créalo primero en Finanzas › Contactos.`);
    }
    return NextResponse.json({
      ok: true,
      datos: { ...datos, avisos },
      proveedorId: proveedor?.id ?? null,
      proveedorNombre: proveedor?.nombre ?? lectura.proveedor?.razonSocial ?? null,
      correoProveedor: datos.correo ?? proveedor?.correo ?? null,
    });
  } catch (e) {
    const detalle = e instanceof Error ? e.message : "No se pudo leer la cotización.";
    console.error("[fin] leer cotización con IA:", detalle);
    return NextResponse.json({ error: detalle }, { status: 500 });
  }
}
