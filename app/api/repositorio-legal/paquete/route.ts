import JSZip from "jszip";
import { NextResponse } from "next/server";
import { exigirAccion, cargarRepositorio, SinPermisoLegal } from "@/lib/repositorio-legal/datos";
import { bajar } from "@/lib/repositorio-legal/sharepoint";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Tope del paquete: lo que cabe en una función de Vercel sin arriesgar el tiempo ni la memoria. */
const TOPE_BYTES = 120 * 1024 * 1024;
const TOPE_ARCHIVOS = 80;

/**
 * «Armar paquete»: los documentos elegidos (de una o varias sociedades) en un ZIP, ordenados por
 * sociedad. Reemplaza la costumbre de copiar los PDFs a una carpeta nueva por cada banco o cliente
 * que los pide: así no se crean más copias en SharePoint.
 */
export async function POST(request: Request) {
  try {
    const { permisos } = await exigirAccion("ver");
    const form = await request.formData();
    const ids = form.getAll("id").map(String).slice(0, TOPE_ARCHIVOS);
    const titulo = String(form.get("titulo") ?? "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 80) || "Paquete de antecedentes";
    if (ids.length === 0) return NextResponse.json({ error: "No elegiste documentos." }, { status: 400 });

    // Solo los que esta persona puede ver (lo confidencial queda fuera aunque venga el id).
    const repo = await cargarRepositorio(permisos);
    const porId = new Map(repo.documentos.map((d) => [d.id, d]));
    const nombreSociedad = new Map(repo.sociedades.map((s) => [s.slug, s.nombre]));
    const elegidos = ids.map((id) => porId.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));
    const total = elegidos.reduce((s, d) => s + d.tamano, 0);
    if (total > TOPE_BYTES) return NextResponse.json({ error: "El paquete supera 120 MB. Divídelo en dos." }, { status: 413 });

    const zip = new JSZip();
    const usados = new Set<string>();
    for (const d of elegidos) {
      const { contenido } = await bajar(d.id);
      const carpeta = d.sociedad ? nombreSociedad.get(d.sociedad) ?? "Sin sociedad" : "Sin sociedad";
      let ruta = `${carpeta}/${d.nombre}`;
      for (let i = 2; usados.has(ruta); i++) ruta = `${carpeta}/${i} ${d.nombre}`;
      usados.add(ruta);
      zip.file(ruta, contenido);
    }
    const buffer = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(titulo)}.zip`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo armar el paquete.";
    return NextResponse.json({ error: msg }, { status: e instanceof SinPermisoLegal ? 403 : 500 });
  }
}
