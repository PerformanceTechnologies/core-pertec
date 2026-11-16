import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { contextoDeEmpresa } from "@/lib/empresas";
import { obtenerFabricacion } from "@/lib/fabricacion";
import { nombreArchivoCosto, type DatosCostoPdf } from "@/lib/fabricacion-documento";
import { costoAPdf } from "@/lib/fabricacion-pdf";
import { logoComoDataUri, perfilDeEmpresa } from "@/lib/fin/empresa-perfil";
import { listarUnidades } from "@/lib/inventario";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * El PDF del costo de fabricación de un producto, para enviar a proveedores. `?descargar=1` lo baja en vez
 * de abrirlo. NO lleva el margen ni las notas internas: se arma solo con lo que `DatosCostoPdf` permite.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const acceso = await verificarAccesoAppApi("inventario");
  if (!acceso.usuario) return new Response(acceso.error, { status: acceso.status });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Producto inválido", { status: 400 });

  try {
    const { activa } = await contextoDeEmpresa(acceso.usuario.id, acceso.usuario.rol);
    if (!activa) return new Response("No hay una empresa activa.", { status: 409 });
    const datos = await obtenerFabricacion(id);
    if (!datos) return new Response("Ese producto fabricado no existe.", { status: 404 });
    if (datos.items.length === 0) return new Response("Agrega al menos un ítem de costo para generar el PDF.", { status: 409 });

    const [perfil, unidades] = await Promise.all([perfilDeEmpresa(activa.id), listarUnidades()]);
    const { ficha, items } = datos;
    const documento: DatosCostoPdf = {
      empresa: { slug: perfil.slug, nombre: perfil.nombre, rut: perfil.rut, direccion: perfil.direccion, giro: perfil.giro, telefono: perfil.telefono, correo: perfil.correo, web: perfil.web },
      logo: await logoComoDataUri(perfil.slug),
      fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" }),
      producto: { nombre: ficha.nombre, codigo: ficha.codigo, descripcion: ficha.descripcion, unidad: unidades.find((u) => u.id === ficha.unidadId)?.abreviacion ?? null },
      items: items.map((i) => ({ grupo: i.grupo, descripcion: i.descripcion, cantidad: i.cantidad, unidad: i.unidad, costoUnitario: i.costoUnitario, mermaPct: i.mermaPct })),
    };

    const pdf = await costoAPdf(documento);
    const nombre = nombreArchivoCosto(documento);
    const ascii = nombre.replace(/[^\w.\- ]+/g, "_");
    const bajar = new URL(request.url).searchParams.get("descargar") === "1";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${bajar ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message.replace(/^\[(inventario|fin)\]\s*/, "") : String(error);
    console.error("[inventario] el PDF del costo de fabricación falló:", detalle);
    return new Response(detalle, { status: 500 });
  }
}
