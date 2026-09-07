// Los estados del SII tal como los muestra Panel Finanzas: etiqueta corta, nota al pie
// para el title, clases de la pastilla y los codigos de DTE.
//
// Viven aca y no dentro de PanelFinanzas.tsx porque el detalle de facturas de Panel Odoo
// muestra EL MISMO estado -- el del SII, que es el que manda -- y dos diccionarios con
// las mismas claves se separan a la primera que alguien ajuste una etiqueta: la misma
// factura diria "Reclamada" en un panel y "reclamado" en el otro.
//
// Sin "server-only": los usan componentes cliente.

// El estado de una COMPRA es la sub-pestaña del RCV de la que salió; el de una VENTA se
// deriva de las fechas de acuse y reclamo del receptor. Antes toda venta decía "Registro"
// —una columna que siempre dice lo mismo no dice nada— y un reclamo del cliente no se veía
// en ninguna parte.
export const ETIQUETAS_ESTADO: Record<string, string> = {
  registro: "Registro",
  aceptado: "Aceptada",
  pendiente: "Pendiente",
  no_incluir: "No incluir",
  // Una sola palabra, y no "Reclamada/rechazada" como estuvo un rato: la pastilla partia
  // en dos lineas, estiraba la fila y de paso apretaba la columna de RUT hasta cortar el
  // digito verificador. Que un rechazo tambien cae aca lo dice el tooltip (TITULO_ESTADO)
  // y el detalle de la factura, donde hay lugar para explicarlo.
  reclamado: "Reclamada",
};

/**
 * El pie de nota de cada estado, en el title de la pastilla.
 *
 * La etiqueta tiene que ser corta para que la tabla no se descuadre, pero corta deja
 * preguntas: por que una venta dice "Registro", o si un rechazo cuenta como reclamo. Se
 * contestan al pasar el mouse, sin ocupar una columna.
 */
export const TITULO_ESTADO: Record<string, string> = {
  registro: "En el registro del SII: el cliente todavía no dio acuse ni reclamó",
  aceptado: "El cliente dio acuse de recibo",
  pendiente: "Pendiente en el registro de compras del SII",
  no_incluir: "Marcada como no incluir en el registro de compras del SII",
  reclamado:
    "Reclamada o rechazada por el receptor. En el SII un rechazo es uno de los tres " +
    "reclamos posibles (al contenido, o por falta parcial o total de mercadería), no un " +
    "estado aparte: los tres significan que la factura no se cobra como está",
};

export const CLASES_ESTADO: Record<string, string> = {
  registro: "bg-teal/10 text-teal",
  aceptado: "bg-teal/10 text-teal",
  pendiente: "bg-naranjo-suave/15 text-naranjo",
  no_incluir: "bg-gris/15 text-gris",
  reclamado: "bg-red-500/10 text-red-600",
};

export const ETIQUETAS_DTE: Record<number, string> = {
  33: "Factura",
  34: "Factura exenta",
};
