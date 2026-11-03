import { NextRequest, NextResponse } from "next/server";
import { verificarAccesoAppApi } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import {
  SLUG_APP_VH,
  aCsv,
  filtrarCatalogo,
  filtrarDocumentos,
  filtrarLineas,
  filtrarProveedores,
  masRecientesPrimero,
} from "@/lib/valorizacion-historica-modelo";

export const runtime = "nodejs";

const r = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);

/**
 * Lo que se ve en una lista, en CSV para Excel, con los mismos filtros de la pantalla (vienen en la
 * URL). Sin paginar: trae todo lo filtrado.
 */
export async function GET(request: NextRequest) {
  const acceso = await verificarAccesoAppApi(SLUG_APP_VH);
  if (!acceso.usuario) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

  const p = request.nextUrl.searchParams;
  const val = (k: string) => p.get(k) || undefined;
  const vista = await cargarVista();
  let nombre: string, csv: string;

  switch (p.get("que")) {
    case "lineas": {
      const ls = filtrarLineas(
        vista.datos.lineas,
        { q: val("q"), categoria: val("categoria"), anio: val("anio") ? Number(val("anio")) : undefined, proveedor: val("proveedor"), tipoItem: val("tipo"), soloRevisar: p.get("revisar") === "1" },
        vista.textos,
      ).sort(masRecientesPrimero);
      nombre = "compras-lineas";
      csv = aCsv(
        ["Fecha", "Tipo documento", "Folio", "RUT proveedor", "Proveedor", "Código proveedor", "Glosa", "Producto", "Marca", "Modelo", "Talla", "Categoría", "Subcategoría", "Tipo de ítem", "Cantidad", "Unidad", "Precio unitario neto", "% desc. línea", "Valor neto línea", "Factor desc. global", "Valor neto ajustado", "Costo unitario neto real", "Estado cuadratura", "Revisar", "Referencias", "PDF (DTE_SII)"],
        ls.map((l) => [l.fecha, l.tipoDocumento, l.folio, l.rut, l.proveedor, l.codigoProveedor, l.glosa, l.producto, l.marca, l.modelo, l.talla, l.categoria, l.subcategoria, l.tipoItem, l.cantidad, l.unidad, r(l.precioUnitario), l.descuentoLinea === null ? null : r(l.descuentoLinea * 100), l.valorLinea, l.factorDescuentoGlobal, l.valorAjustado, r(l.costoUnitario), l.estadoCuadratura, l.revisar ? "Sí" : "", l.referencias, l.pdf]),
      );
      break;
    }
    case "catalogo": {
      const items = filtrarCatalogo(vista.catalogo, { q: val("q"), categoria: val("categoria"), tipo: val("tipo") });
      nombre = "catalogo-costos";
      csv = aCsv(
        ["Ítem", "Categoría", "Subcategoría", "Tipo de ítem", "Producto", "Marca", "Modelo", "Talla", "Unidad", "N° compras", "Cantidad neta", "Monto neto total", "Costo prom. ponderado", "Costo unit. mínimo", "Costo unit. máximo", "Último costo unitario", "Fecha última compra", "Último proveedor"],
        items.map((i) => [i.clave, i.categoria, i.subcategoria, i.tipoItem, i.producto, i.marca, i.modelo, i.talla, i.unidad, i.compras, i.cantidad, i.monto, r(i.costoPromedio), r(i.costoMin), r(i.costoMax), r(i.ultimoCosto), i.ultimaFecha, i.ultimoProveedor]),
      );
      break;
    }
    case "documentos": {
      const docs = filtrarDocumentos(vista.documentos, { q: val("q"), anio: val("anio") ? Number(val("anio")) : undefined, tipo: val("tipo"), cuadra: p.get("cuadra") === "1" });
      nombre = "documentos";
      csv = aCsv(
        ["Fecha emisión", "Tipo documento", "Folio", "RUT proveedor", "Proveedor", "Dirección", "Comuna", "Contacto PERTEC", "Monto neto", "Monto exento", "IVA", "Imp. adicional", "Total", "Monto en alcance (neto)", "Líneas en alcance", "Estado cuadratura", "Referencias", "PDF (DTE_SII)"],
        docs.map((d) => [d.fecha, d.tipo, d.folio, d.rut, d.proveedor, d.direccion, d.comuna, d.contactoPertec, d.montoNeto, d.montoExento, d.iva, d.impuestoAdicional, d.total, d.montoAlcance, d.lineasAlcance, d.estadoCuadratura, d.referencias, d.pdf]),
      );
      break;
    }
    case "proveedores": {
      const ps = filtrarProveedores(vista.proveedores, { q: val("q"), categoria: val("categoria") });
      nombre = "proveedores";
      csv = aCsv(
        ["RUT", "Razón social", "Giro", "Dirección", "Comuna", "Email", "Contacto PERTEC", "Categoría principal", "N° documentos", "Primera compra", "Última compra", "Monto neto en alcance", "% del total"],
        ps.map((x) => [x.rut, x.razonSocial, x.giro, x.direccion, x.comuna, x.email, x.contactoPertec, x.categoriaPrincipal, x.documentos, x.primeraCompra, x.ultimaCompra, x.monto, r(x.participacion * 100)]),
      );
      break;
    }
    default:
      return NextResponse.json({ error: "Exportación desconocida." }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
