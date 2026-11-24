import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { contextoFinApi } from "@/lib/fin/datos";
import { todasDelArchivo } from "@/lib/fin/dte/archivo";
import { DTE_CORTO } from "@/lib/fin/modelo";

export const runtime = "nodejs";

/** Excel del archivo con el mismo filtro de la pantalla: /api/finanzas/dte/archivo/excel?clase=&anio=&mes=&q= */
export async function GET(req: Request) {
  const ctx = await contextoFinApi();
  if (!ctx) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const u = new URL(req.url).searchParams;
  const clase = u.get("clase") === "recibido" ? "recibido" : "emitido";
  const anio = Number(u.get("anio")) || null;
  const mes = Number(u.get("mes")) >= 1 && Number(u.get("mes")) <= 12 ? Number(u.get("mes")) : null;
  const filas = await todasDelArchivo(ctx.empresa.id, { clase, anio, mes, q: (u.get("q") ?? "").slice(0, 80) });

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(clase === "emitido" ? "Emitidos" : "Recibidos");
  hoja.columns = [
    { header: "Fecha", key: "fecha", width: 12 },
    { header: "Tipo", key: "tipo", width: 10 },
    { header: "Folio", key: "folio", width: 12 },
    { header: clase === "emitido" ? "Cliente" : "Proveedor", key: "nombre", width: 40 },
    { header: "RUT", key: "rut", width: 14 },
    { header: "Neto", key: "neto", width: 14, style: { numFmt: "#,##0" } },
    { header: "Exento", key: "exento", width: 14, style: { numFmt: "#,##0" } },
    { header: "IVA", key: "iva", width: 14, style: { numFmt: "#,##0" } },
    { header: "Total", key: "total", width: 16, style: { numFmt: "#,##0" } },
    { header: "En los libros", key: "libros", width: 13 },
    { header: "PDF", key: "pdf", width: 6 },
    { header: "XML", key: "xml", width: 6 },
  ];
  hoja.getRow(1).font = { bold: true };
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  for (const f of filas) {
    hoja.addRow({
      fecha: f.fecha ? new Date(`${f.fecha}T12:00:00Z`) : null, tipo: (f.tipoDte && DTE_CORTO[f.tipoDte]) ?? f.tipoDte, folio: f.folio, nombre: f.nombre, rut: f.rut,
      neto: f.neto, exento: f.exento, iva: f.iva, total: f.tipoDte === 61 && f.total ? -f.total : f.total, libros: f.documentoId ? "Sí" : "No", pdf: f.pdf ? "Sí" : "", xml: f.xml ? "Sí" : "",
    });
  }
  hoja.getColumn("fecha").numFmt = "dd-mm-yyyy";
  hoja.autoFilter = { from: "A1", to: "L1" };
  const buf = Buffer.from(await libro.xlsx.writeBuffer());
  const nombre = `${clase === "emitido" ? "Emitidos" : "Recibidos"}${anio ? `-${anio}` : ""}${mes ? `-${String(mes).padStart(2, "0")}` : ""}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
