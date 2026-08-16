import type { FinanzasIhDocumentoFila } from "./finanzas-ih";

// Nombre legible para el XML/PDF descargado con un clic (fila de la tabla o
// boton en el popup de detalle) -- sin esto el navegador lo guarda con el
// nombre generico de la ruta de la API. Sin "server-only": lo usan
// directamente los componentes cliente (tabla y modales).
export function nombreArchivoIh(documento: FinanzasIhDocumentoFila, extension: "xml" | "pdf"): string {
  return `${documento.empresa}_${documento.tipo_documento}_${documento.folio}.${extension}`;
}
