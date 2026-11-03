import JSZip from "jszip";

/**
 * Quita los comentarios (las «notas» de las celdas) antes de abrir el Excel.
 *
 * ExcelJS se cae con «Cannot read properties of undefined (reading 'comments')» cuando
 * el archivo los guardó otro programa con la ruta escrita de otra forma (openpyxl,
 * Google Sheets, algunas versiones de Excel). Para importar no se necesitan: se sacan
 * las relaciones de comentarios y dibujos VML de cada hoja y el resto queda igual.
 */
export async function sinComentarios(contenido: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(contenido);
  const tareas: Promise<void>[] = [];
  zip.forEach((ruta, archivo) => {
    if (/^xl\/worksheets\/_rels\/[^/]+\.rels$/.test(ruta)) {
      tareas.push(
        archivo.async("string").then((xml) => {
          zip.file(ruta, xml.replace(/<Relationship\b[^>]*Type="[^"]*\/(comments|vmlDrawing)"[^>]*\/>/g, ""));
        }),
      );
    } else if (/^xl\/worksheets\/[^/]+\.xml$/.test(ruta)) {
      tareas.push(
        archivo.async("string").then((xml) => {
          zip.file(ruta, xml.replace(/<legacyDrawing\b[^>]*\/>/g, ""));
        }),
      );
    }
  });
  await Promise.all(tareas);
  return zip.generateAsync({ type: "nodebuffer" });
}
