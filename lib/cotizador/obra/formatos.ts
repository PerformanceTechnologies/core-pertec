/**
 * Qué formatos de propuesta se aceptan. Solo eso.
 *
 * Vive aparte de ./extraer-texto.ts —que es quien de verdad los lee— porque el
 * navegador necesita esta lista para el `accept` del input, y extraer-texto
 * importa exceljs y jszip. Cuando el componente cliente pedía la constante desde
 * allá, el bundler seguía la cadena y metía ExcelJS completo en el bundle del
 * navegador: 1,1 MB de JavaScript que nadie ejecuta en el cliente, cargados en
 * cada visita a /cotizador para poder escribir un atributo accept.
 *
 * Un módulo compartido entre cliente y servidor no puede tener dependencias
 * pesadas, aunque solo se usen del lado del servidor: importar UNA constante
 * arrastra el archivo entero, y con él todo lo que ese archivo importa.
 */

export type FormatoPropuesta = "pdf" | "excel" | "word";

const TIPOS: Record<string, FormatoPropuesta> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12": "excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word",
};

/**
 * Los formatos que acepta el `<input type="file">`.
 *
 * Con la extensión además del MIME: Windows manda a veces
 * `application/octet-stream` para un .xlsx, y entonces el navegador no lo deja
 * ni seleccionar.
 */
export const FORMATOS_ACEPTADOS = [...Object.keys(TIPOS), ".pdf", ".xlsx", ".xlsm", ".docx"].join(",");

/** Formato del archivo, por MIME y con la extensión como respaldo. */
export function formatoDe(mimeType: string, nombreArchivo: string): FormatoPropuesta | null {
  const porMime = TIPOS[mimeType];
  if (porMime) return porMime;

  const extension = nombreArchivo.toLowerCase().split(".").pop() ?? "";
  if (extension === "pdf") return "pdf";
  if (extension === "xlsx" || extension === "xlsm") return "excel";
  if (extension === "docx") return "word";
  return null;
}
