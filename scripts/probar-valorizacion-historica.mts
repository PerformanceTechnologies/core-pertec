// Pruebas de la Valorización histórica: búsqueda, costos del catálogo, resumen, conteo y la
// lectura del Excel (con un libro armado en memoria con la misma forma que el Registro Maestro).
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  aCsv,
  armarCatalogo,
  compilarBusqueda,
  documentosConAlcance,
  filtrarDocumentos,
  filtrarLineas,
  leerNumero,
  normalizar,
  proveedoresConCifras,
  resumirLineas,
  resumirRegistro,
  totalesConteo,
  unidadLegible,
  valorizarConteo,
  variacionDeCosto,
  type DocumentoCompra,
  type LineaCompra,
  type ProveedorCompra,
} from "../lib/valorizacion-historica-modelo";
import { leerRegistroMaestro, rutaPdfDeVinculo } from "../lib/valorizacion-historica-excel";

let n = 0;
function linea(p: Partial<LineaCompra>): LineaCompra {
  n++;
  return {
    n,
    fecha: "2024-01-10",
    tipoDocumento: "Factura",
    folio: 100,
    rut: "96.792.430-K",
    proveedor: "SODIMAC S.A",
    codigoProveedor: null,
    glosa: "GUANTE NITRILO",
    producto: "Guante",
    marca: null,
    modelo: null,
    talla: null,
    categoria: "EPP",
    subcategoria: "Guantes",
    tipoItem: "EPP (uso personal)",
    cantidad: 1,
    unidad: "UN",
    precioUnitario: 1000,
    descuentoLinea: null,
    valorLinea: 1000,
    factorDescuentoGlobal: 1,
    valorAjustado: 1000,
    costoUnitario: 1000,
    estadoCuadratura: "Cuadra",
    revisar: false,
    pdf: null,
    referencias: null,
    clave: "GUANTE NITRILO",
    ...p,
  };
}

// ---------- Búsqueda ----------------------------------------------------------------

{
  const t = normalizar("Taladro Percutor MAKITA 13mm | Medición");
  assert.ok(compilarBusqueda("taladro")(t));
  assert.ok(compilarBusqueda("MAKITA taladro")(t), "varias palabras en cualquier orden");
  assert.ok(compilarBusqueda("medicion")(t), "sin tildes");
  assert.ok(compilarBusqueda("taladro*makita")(t), "comodín en orden");
  assert.ok(!compilarBusqueda("makita*taladro")(t), "el comodín exige el orden");
  assert.ok(compilarBusqueda("1?mm")(t), "? es un carácter");
  assert.ok(!compilarBusqueda("taladro dewalt")(t), "todas las palabras deben estar");
  assert.ok(compilarBusqueda("  ")(t), "vacío deja pasar todo");
  assert.ok(compilarBusqueda("(13mm")(normalizar("(13mm)")), "los paréntesis no rompen la búsqueda");
  assert.ok(compilarBusqueda("a+b*c")(normalizar("a+b y c")), "símbolos de regex se escapan con comodín");
}

{
  const ls = [
    linea({ glosa: "TALADRO MAKITA", producto: "Taladro", subcategoria: "Taladros", clave: "TALADRO MAKITA", categoria: "Herramientas eléctricas", fecha: "2023-05-01" }),
    linea({ glosa: "GUANTE", fecha: "2024-02-01", revisar: true }),
    linea({ glosa: "GUANTE", proveedor: "TRECK S A", rut: "96.542.490-3", fecha: "2024-03-01" }),
  ];
  assert.equal(filtrarLineas(ls, { q: "guante" }).length, 2);
  assert.equal(filtrarLineas(ls, { categoria: "EPP" }).length, 2);
  assert.equal(filtrarLineas(ls, { anio: 2023 }).length, 1);
  assert.equal(filtrarLineas(ls, { proveedor: "treck" }).length, 1);
  assert.equal(filtrarLineas(ls, { proveedor: "96.542.490-3" }).length, 1, "el proveedor se filtra también por RUT");
  assert.equal(filtrarLineas(ls, { soloRevisar: true }).length, 1);
  assert.equal(filtrarLineas(ls, { q: "sodimac guante" }).length, 1, "busca también en el proveedor");
}

// ---------- Cifras del buscador y del catálogo ---------------------------------------

{
  const ls = [
    linea({ fecha: "2023-01-01", cantidad: 10, valorAjustado: 10000, costoUnitario: 1000 }),
    linea({ fecha: "2024-06-01", cantidad: 5, valorAjustado: 6000, costoUnitario: 1200, folio: 200 }),
    // Una nota de crédito: resta cantidad y monto, pero no es un precio.
    linea({ fecha: "2024-07-01", tipoDocumento: "Nota de Crédito", cantidad: -2, valorAjustado: -2400, costoUnitario: 1200, folio: 5 }),
    linea({ fecha: "2023-09-01", cantidad: 3, valorAjustado: 2400, costoUnitario: 800, folio: 300, unidad: "Unid" }),
  ];
  const r = resumirLineas(ls);
  assert.equal(r.cantidad, 16);
  assert.equal(r.monto, 16000);
  assert.equal(r.costoMin, 800);
  assert.equal(r.costoMax, 1200);
  assert.equal(r.ultimoCosto, 1200, "el último costo es la compra positiva más reciente");
  assert.equal(r.ultimaFecha, "2024-06-01");
  assert.equal(r.documentos, 4);
  assert.deepEqual(r.unidades, ["UN"], "UN y Unid son la misma unidad");

  // Una línea regalada a $0 no es un precio: no baja el mínimo ni pasa a ser el último costo.
  const conRegalo = resumirLineas([...ls, linea({ fecha: "2025-01-01", cantidad: 1, valorAjustado: 0, costoUnitario: 0, folio: 9 })]);
  assert.equal(conRegalo.costoMin, 800);
  assert.equal(conRegalo.ultimoCosto, 1200);

  const [item] = armarCatalogo(ls);
  assert.equal(item.compras, 4);
  assert.equal(item.costoPromedio, 1000, "promedio ponderado = monto neto / cantidad neta");
  assert.ok(Math.abs(variacionDeCosto(ls)! - 0.2) < 1e-9, "de 1.000 a 1.200 subió 20 %");

  // Todo devuelto: sin cantidad neta no hay costo que informar (como el Excel).
  const [devuelto] = armarCatalogo([linea({ clave: "X", cantidad: 1, valorAjustado: 500 }), linea({ clave: "X", cantidad: -1, valorAjustado: -500, tipoDocumento: "Nota de Crédito" })]);
  assert.equal(devuelto.cantidad, 0);
  assert.equal(devuelto.costoPromedio, null);
  assert.equal(devuelto.costoMin, null);

  // Una glosa con «~» (que en el Excel confunde a COUNTIFS) se agrupa igual.
  const tilde = armarCatalogo([linea({ clave: "PLACA ~ INCLUIR" }), linea({ clave: "PLACA ~ INCLUIR" })]);
  assert.equal(tilde[0].compras, 2);

  const orden = armarCatalogo([linea({ clave: "A", valorAjustado: 10 }), linea({ clave: "B", valorAjustado: 99 })]);
  assert.deepEqual(orden.map((i) => i.clave), ["B", "A"], "el catálogo va del que más plata se llevó al que menos");
}

// ---------- Resumen, documentos y proveedores ---------------------------------------

{
  const docs: DocumentoCompra[] = [
    { n: 1, fecha: "2023-02-01", tipo: "Factura", folio: 100, rut: "1-9", proveedor: "A", direccion: null, comuna: null, contactoPertec: null, montoNeto: 5000, montoExento: 0, iva: 950, impuestoAdicional: 0, total: 5950, estadoCuadratura: "Cuadra", referencias: null, pdf: null },
    { n: 2, fecha: "2024-02-01", tipo: "Factura", folio: 100, rut: "2-7", proveedor: "B", direccion: null, comuna: null, contactoPertec: null, montoNeto: 1000, montoExento: 0, iva: 190, impuestoAdicional: 0, total: 1190, estadoCuadratura: "Descuento global prorrateado", referencias: null, pdf: null },
  ];
  const ls = [
    linea({ rut: "1-9", folio: 100, fecha: "2023-02-01", valorAjustado: 3000, categoria: "EPP" }),
    linea({ rut: "1-9", folio: 100, fecha: "2023-02-01", valorAjustado: 1000, categoria: "Consumibles", tipoItem: "Insumo / consumible", clave: "OTRO" }),
    // Mismo folio, otro proveedor: es otro documento.
    linea({ rut: "2-7", folio: 100, fecha: "2024-02-01", valorAjustado: 1000, categoria: "EPP" }),
  ];
  const conAlcance = documentosConAlcance(docs, ls);
  assert.equal(conAlcance[0].montoAlcance, 4000);
  assert.equal(conAlcance[0].lineasAlcance, 2);
  assert.equal(conAlcance[0].participacion, 0.8);
  assert.equal(conAlcance[1].montoAlcance, 1000, "el folio se distingue por RUT");
  assert.equal(filtrarDocumentos(docs, { cuadra: true }).length, 1, "solo los que no cuadran al peso");
  assert.equal(filtrarDocumentos(docs, { q: "100" }).length, 2);

  const provs: ProveedorCompra[] = [
    { rut: "1-9", razonSocial: "A", giro: null, direccion: null, comuna: null, email: null, contactoPertec: null, categoriaPrincipal: "EPP" },
    { rut: "2-7", razonSocial: "B", giro: null, direccion: null, comuna: null, email: null, contactoPertec: null, categoriaPrincipal: "EPP" },
  ];
  const pc = proveedoresConCifras(provs, docs, ls);
  assert.equal(pc[0].rut, "1-9");
  assert.equal(pc[0].monto, 4000);
  assert.equal(pc[0].participacion, 0.8);
  assert.equal(pc[0].items, 2);
  assert.equal(pc[1].primeraCompra, "2024-02-01");

  const r = resumirRegistro({ lineas: ls, documentos: docs, proveedores: provs });
  assert.equal(r.total, 5000);
  assert.deepEqual(r.porAnio.map((a) => [a.anio, a.monto, a.documentos]), [[2023, 4000, 1], [2024, 1000, 1]]);
  assert.equal(r.porCategoria[0].nombre, "EPP");
  assert.equal(r.porCategoria[0].porAnio[2024], 1000);
  assert.equal(r.items, 2);
  assert.equal(r.desde, "2023-02-01");
}

// ---------- Conteo -------------------------------------------------------------------

{
  const [item] = armarCatalogo([
    linea({ clave: "CASCO", cantidad: 10, valorAjustado: 10000, costoUnitario: 1000, fecha: "2023-01-01" }),
    linea({ clave: "CASCO", cantidad: 10, valorAjustado: 14000, costoUnitario: 1400, fecha: "2024-01-01" }),
  ]);
  const v = valorizarConteo(
    [
      { clave: "CASCO", contado: 5, observacion: "" },
      { clave: "CASCO", contado: null, observacion: "" },
      { clave: "NO EXISTE", contado: 3, observacion: "" },
    ],
    new Map([[item.clave, item]]),
  );
  assert.equal(v[0].diferencia, 15);
  assert.equal(v[0].participacionDiferencia, 0.75);
  assert.equal(v[0].valorInventario, 7000, "lo contado a último costo");
  assert.equal(v[0].valorDiferencia, 18000, "la diferencia a costo promedio (1.200)");
  assert.equal(v[1].diferencia, null, "sin contar no hay diferencia");
  assert.equal(v[2].item, null);
  assert.equal(v[2].valorInventario, null);
  assert.deepEqual(totalesConteo(v), { contadas: 2, valorInventario: 7000, valorDiferencia: 18000 });

  assert.equal(leerNumero("12"), 12);
  assert.equal(leerNumero("1,5"), 1.5);
  assert.equal(leerNumero("1.500"), 1500, "punto de miles");
  assert.equal(leerNumero("1.500,25"), 1500.25);
  assert.equal(leerNumero("1.5"), 1.5, "punto decimal si no son miles");
  assert.equal(leerNumero(""), null);
  assert.equal(leerNumero("abc"), null);
}

// ---------- Formato ------------------------------------------------------------------

assert.equal(unidadLegible("Unid"), "UN");
assert.equal(unidadLegible("C/U"), "UN");
assert.equal(unidadLegible("PR"), "PAR");
assert.equal(unidadLegible("Metr"), "M");
assert.equal(unidadLegible(null), "");
assert.equal(rutaPdfDeVinculo("DTE_SII\\2022\\09%20Septiembre\\DTE_R_CODIGO_1666421196.pdf"), "2022/09 Septiembre/DTE_R_CODIGO_1666421196.pdf");
assert.equal(rutaPdfDeVinculo("https://otro.sitio/archivo.xlsx"), null);
assert.equal(rutaPdfDeVinculo(null), null);
{
  const csv = aCsv(["A", "B"], [["x;y", 1.5], [null, 'di "hola"']]);
  assert.ok(csv.startsWith("﻿A;B\r\n"), "CSV con BOM y «;» para Excel en español");
  assert.ok(csv.includes('"x;y";1,5'), "el «;» se cita y el decimal va con coma");
  assert.ok(csv.includes(';"di ""hola"""'));
}

// ---------- Lectura del Excel ----------------------------------------------------------

async function libroDePrueba(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const det = wb.addWorksheet("Detalle compras");
  det.addRow(["Detalle de compras"]);
  det.addRow([]);
  det.addRow([]);
  det.addRow([]);
  const encDet = ["N°", "Fecha", "Año", "Mes", "Tipo documento", "Folio", "RUT proveedor", "Proveedor", "Código proveedor", "Glosa (según factura)", "Producto", "Marca", "Modelo / referencia", "Talla", "Categoría", "Subcategoría", "Tipo de ítem", "Cantidad", "Unidad", "Precio unitario neto", "% Desc. línea", "Valor neto línea", "Factor desc. global", "Valor neto ajustado", "Costo unitario neto real", "Estado cuadratura", "Revisar", "PDF", "Referencias (OC / guías)", "Clave ítem"];
  det.addRow(encDet);
  const f1 = det.addRow([1, new Date(Date.UTC(2022, 8, 3)), 2022, 9, "Factura", 19354458, "96.511.460-2", "Construmart S.A", "", "MARCADOR METAL", "Marcador", null, "", "", "Consumibles de trabajo", "Marcado y trazado", "Insumo / consumible", 3, null, 3605, null, 10815, 1, null, null, "Cuadra", null, "Ver PDF", "- Orden Compra N° a05909", "MARCADOR METAL"]);
  // Como en el Excel real: fórmulas con su resultado guardado e hipervínculo al PDF.
  f1.getCell(24).value = { formula: "ROUND(V6*W6,0)", result: 10815 };
  f1.getCell(25).value = { formula: "IF(N(R6)=0,\"\",X6/R6)", result: 3605 };
  f1.getCell(28).value = { text: "Ver PDF", hyperlink: "DTE_SII\\2022\\09%20Septiembre\\DTE_R_CODIGO_1.pdf" };
  det.addRow([2, new Date(Date.UTC(2022, 8, 5)), 2022, 9, "Nota de Crédito", 77, "77.144.513-6", "GRAVOX SPA", "INT-9", "PLACA ~ INCLUIR", "Placa", null, "", "", "EPP", "Protección de cabeza", "EPP (uso personal)", -1, "UN", 6413, 0.1, -6413, 1, -6413, 6413, "Cuadra", "Sí", null, "", "PLACA ~ INCLUIR"]);
  det.addRow([]);
  const fac = wb.addWorksheet("Facturas");
  fac.addRow(["Facturas"]);
  fac.addRow([]);
  fac.addRow([]);
  fac.addRow([]);
  fac.addRow(["N°", "Fecha emisión", "Año", "Tipo documento", "Folio", "RUT proveedor", "Proveedor", "Dirección proveedor", "Comuna", "Contacto PERTEC en factura", "Monto neto", "Monto exento", "IVA", "Imp. adicional", "Total documento", "Monto en alcance (neto)", "% en alcance", "Líneas en alcance", "Estado cuadratura", "Referencias (OC / guías / doc. anulado)", "PDF"]);
  fac.addRow([1, new Date(Date.UTC(2022, 8, 3)), 2022, "Factura", 19354458, "96.511.460-2", "Construmart S.A", "PANAMERICANA NORTE 9275", "QUILICURA", null, 10815, 0, 2055, 0, 12870, 10815, 1, 1, "Cuadra", "", "Ver PDF"]);
  fac.addRow([null, "TOTAL (filas visibles)"]);
  const prov = wb.addWorksheet("Proveedores");
  prov.addRow(["Proveedores"]);
  prov.addRow([]);
  prov.addRow([]);
  prov.addRow([]);
  prov.addRow(["N°", "RUT", "Razón social", "Giro", "Dirección", "Comuna", "Email proveedor (si figura en DTE)", "Contacto PERTEC frecuente", "Categoría principal", "N° documentos", "Primera compra", "Última compra", "Monto neto en alcance", "% del total"]);
  prov.addRow([1, "96.511.460-2", "Construmart S.A", "Ferretería", "Panamericana", "QUILICURA", null, null, "Consumibles de trabajo", 1]);
  const cat = wb.addWorksheet("Categorías");
  cat.addRow(["Clasificación"]);
  cat.addRow([]);
  cat.addRow([]);
  cat.addRow([]);
  cat.addRow(["Categoría", "Subcategoría", "Tipo de ítem", "N° líneas", "Monto neto", "% del total", "Criterio / contenido"]);
  cat.addRow(["EPP", "Guantes", "EPP (uso personal)", 1, 1, 1, "Protección personal."]);
  cat.addRow(["TOTAL"]);
  cat.addRow([]);
  cat.addRow(["Lista para filtros del Buscador"]);
  const con = wb.addWorksheet("Control y observaciones");
  con.addRow(["Control"]);
  con.addRow(["A. Universo de documentos revisados"]);
  con.addRow(["Concepto", "N° documentos", "Monto neto + exento", null, null, "Tratamiento"]);
  con.addRow(["PDF en la carpeta", 4794, null, null, null, "Todos leídos."]);
  con.addRow(["Documentos de cobro por tipo"]);
  con.addRow(["   Factura", 2981, 3889886294]);
  con.addRow(["B. Compras totales del período por destino"]);
  con.addRow(["Destino del gasto", "N° líneas", "Monto neto", "% del total"]);
  con.addRow(["EN ALCANCE: materiales, herramientas y EPP", 3920, 1171676182, 0.3]);
  con.addRow(["Fuera de alcance: Hotelería y alojamiento", 297, 519659291, 0.13]);
  con.addRow(["TOTAL COMPRAS DEL PERÍODO", 9336, 3893008632, 1]);
  con.addRow(["Montos fuera de alcance informados solo como referencia."]);
  con.addRow(["C. Observaciones de calidad de datos"]);
  con.addRow(["Documentos que no cuadran (revisar PDF)", 1]);
  con.addRow(["Metodología y supuestos"]);
  con.addRow(["• Fuente única: PDF de DTE recibidos."]);
  con.addRow(["D. Documentos duplicados excluidos"]);
  con.addRow(["Archivo excluido", "Tipo", "Folio", "RUT", "Fecha", "Proveedor"]);
  con.addRow(["2026/05 Mayo/DTE_R_CODIGO_2.pdf", "Guía de Despacho", 683, null, new Date(Date.UTC(2026, 1, 6)), "PERFORMANCE TECHNOLOGIES SPA"]);
  con.addRow([]);
  con.addRow(["E. Documentos en alcance que no cuadran"]);
  con.addRow(["Archivo", "Tipo", "Folio", "Neto", "Fecha", "Proveedor"]);
  con.addRow(["2023/07 Julio/DTE_R_CODIGO_3.pdf", "Factura", 9155157, 44000, new Date(Date.UTC(2023, 6, 20)), "Kupfer Hermanos S.A"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

{
  const r = await leerRegistroMaestro(await libroDePrueba());
  assert.equal(r.lineas.length, 2, "salta filas en blanco");
  const [l1, l2] = r.lineas;
  assert.equal(l1.fecha, "2022-09-03");
  assert.equal(l1.valorAjustado, 10815, "lee el resultado guardado de la fórmula");
  assert.equal(l1.costoUnitario, 3605);
  assert.equal(l1.pdf, "2022/09 Septiembre/DTE_R_CODIGO_1.pdf");
  assert.equal(l1.referencias, "Orden Compra N° a05909", "sin el guion inicial");
  assert.equal(l1.codigoProveedor, null, "un texto vacío queda null");
  assert.equal(l2.revisar, true);
  assert.equal(l2.cantidad, -1);
  assert.equal(l2.descuentoLinea, 0.1);
  assert.equal(r.documentos.length, 1, "salta la fila de totales");
  assert.equal(r.documentos[0].comuna, "QUILICURA");
  assert.equal(r.proveedores.length, 2, "un proveedor del detalle que falta en su hoja se agrega");
  assert.equal(r.proveedores[1].razonSocial, "GRAVOX SPA");
  assert.equal(r.categorias.length, 1, "la lista de categorías termina en TOTAL");
  assert.equal(r.categorias[0].criterio, "Protección personal.");
  assert.equal(r.control.universo[0].documentos, 4794);
  assert.equal(r.control.porTipo[0].concepto.trim(), "Factura");
  assert.equal(r.control.destinos.length, 2, "sin el total ni la nota al pie");
  assert.equal(r.control.destinos[0].enAlcance, true);
  assert.equal(r.control.destinos[1].destino, "Hotelería y alojamiento");
  assert.equal(r.control.observaciones[0].valor, 1);
  assert.deepEqual(r.control.metodologia, ["Fuente única: PDF de DTE recibidos."]);
  assert.equal(r.control.duplicados[0].fecha, "2026-02-06");
  assert.equal(r.control.duplicados[0].rut, null);
  assert.equal(r.control.duplicados.length, 1, "la sección E no se mezcla con los duplicados");
  assert.deepEqual(r.control.noCuadran, [{ archivo: "2023/07 Julio/DTE_R_CODIGO_3.pdf", tipo: "Factura", folio: 9155157, neto: 44000, fecha: "2023-07-20", proveedor: "Kupfer Hermanos S.A" }]);
}

{
  // Un Excel que no es el registro dice qué le falta, no revienta.
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Hoja1").addRow(["hola"]);
  await assert.rejects(leerRegistroMaestro(Buffer.from(await wb.xlsx.writeBuffer())), /falta la hoja «Detalle compras»/);
  await assert.rejects(leerRegistroMaestro(Buffer.from("no es un excel")), /No se pudo abrir el archivo/);

  const sinColumna = new ExcelJS.Workbook();
  sinColumna.addWorksheet("Detalle compras").addRow(["N°", "Fecha"]);
  await assert.rejects(leerRegistroMaestro(Buffer.from(await sinColumna.xlsx.writeBuffer())), /faltan las columnas: Tipo documento/);
}

console.log("Todas las verificaciones de la Valorización histórica pasaron.");
