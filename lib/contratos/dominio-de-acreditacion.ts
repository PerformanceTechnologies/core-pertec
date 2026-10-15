// Los textos de la configuración y de la dotación, para cada cosa que se acredita.
//
// Acreditación Personas y Acreditación Vehículos comparten las pantallas de configuración (los
// tipos de cargo o de vehículo y los documentos que pide cada uno), el catálogo de documentos y la
// dotación. Lo que cambia es cómo se llama cada cosa: «cargo» o «tipo de vehículo», «persona» o
// «vehículo». Un solo componente con estos textos en vez de dos copias que un día dejan de
// parecerse.
//
// Sin "use server" ni "server-only": lo importan componentes cliente, que eligen el juego de
// textos según el `dominio` que les pasa la página.

export type Dominio = "personas" | "vehiculos";

export interface TerminosDeConfiguracion {
  // ── El editor de cargo / tipo de vehículo
  etiquetaDeNombre: string;
  ejemploDeNombre: string;
  documentosQuePide: string;
  crear: string;
  guardar: string;
  eliminar: string;
  noSePuedeEliminar: string;
  confirmarEliminar: string;

  // ── La lista de cargos / tipos de vehículo
  resumenDeUsos: (usos: number) => string;
  nuevo: string;
  vacioTitulo: string;
  vacioTexto: string;
  modalNuevoTitulo: string;
  modalNuevoDescripcion: string;
  modalEditarTitulo: string;
  usosPorFila: (usos: number) => string;
  /** «cargo» o «tipo de vehículo», en singular y plural: «6 cargos · 3 activos». */
  nombreDeLaLista: (cantidad: number) => string;

  // ── El catálogo de documentos
  confirmarEliminarDocumento: (nombre: string) => string;
  quienLoPide: (cantidad: number) => string;
  usoDeDocumento: (cantidad: number) => string;
  documentoEnUso: string;
  pedirleA: string;
  cambiarDespues: string;

  // ── La dotación
  dotacionSinMeta: string;
  contratadas: string;
  metaCumplida: (sobran: number) => string;
  faltan: (faltan: number) => string;
  barraDeDotacion: (contratadas: number, meta: number) => string;
  totalDesdeCategorias: string;
  ayudaDelTotal: string;
  porCategoria: string;
  ayudaPorCategoria: string;
  cantidadDe: (nombre: string) => string;
  dotacionDescripcion: string;
  dotacionEditarDescripcion: string;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

const PERSONAS: TerminosDeConfiguracion = {
  etiquetaDeNombre: "Nombre del cargo",
  ejemploDeNombre: "Por ejemplo: Operador de maquinaria",
  documentosQuePide: "Documentos que pide este cargo",
  crear: "Crear cargo",
  guardar: "Guardar cargo",
  eliminar: "Eliminar cargo",
  noSePuedeEliminar: "Hay personas con este cargo: desactívalo en vez de eliminarlo.",
  confirmarEliminar: "¿Eliminar este cargo? No se puede deshacer.",

  resumenDeUsos: (n) => `${n} ${plural(n, "persona", "personas")} asignadas`,
  nuevo: "Nuevo cargo",
  vacioTitulo: "Todavía no hay cargos",
  vacioTexto: "Un cargo define qué documentos se le piden a quien lo tiene. Crea el primero.",
  modalNuevoTitulo: "Nuevo cargo",
  modalNuevoDescripcion: "Elige qué documentos se le piden a quien tenga este cargo.",
  modalEditarTitulo: "Editar cargo",
  usosPorFila: (n) => `${n} ${plural(n, "persona", "personas")}`,
  nombreDeLaLista: (n) => plural(n, "cargo", "cargos"),

  confirmarEliminarDocumento: (nombre) =>
    `¿Eliminar el documento «${nombre}» del catálogo?\n\nSe quita también de los cargos que lo piden.`,
  quienLoPide: (n) => (n === 0 ? "Ningún cargo lo pide" : `Lo ${n === 1 ? "pide 1 cargo" : `piden ${n} cargos`}`),
  usoDeDocumento: (n) =>
    n > 0 ? `${n} ${n === 1 ? "persona lo tiene" : "personas lo tienen"} anotado` : "nadie lo tiene anotado",
  documentoEnUso: "Hay personas con este documento anotado: desactívalo en vez de eliminarlo.",
  pedirleA: "Pedírselo a estos cargos",
  cambiarDespues: "Se puede cambiar después en cada cargo.",

  dotacionSinMeta:
    "Todavía no se definió cuántas personas se deben contratar. Indícalo —en total y, si quieres, por cargo— y acá verás cuántas llevas y cuántas faltan.",
  contratadas: "contratadas",
  metaCumplida: (n) => (n > 0 ? `Meta cumplida · ${n} ${plural(n, "persona", "personas")} de más` : "Meta cumplida"),
  faltan: (n) => `Faltan ${n} ${plural(n, "persona", "personas")}`,
  barraDeDotacion: (c, m) => `${c} de ${m} personas contratadas`,
  totalDesdeCategorias: "El total sale de sumar las cantidades de los cargos. Puedes fijar uno propio en «Editar».",
  ayudaDelTotal: "Si lo dejas vacío, el total será la suma de las cantidades por cargo.",
  porCategoria: "Por cargo (opcional)",
  ayudaPorCategoria: "Con la cantidad por cargo se ve CUÁLES faltan. Déjala vacía en los que no apliquen.",
  cantidadDe: (nombre) => `Cantidad de ${nombre}`,
  dotacionDescripcion: "Cuántas personas se deben contratar y cuántas faltan.",
  dotacionEditarDescripcion: "Cuántas personas se deben contratar. Lo que falta se calcula contra la nómina.",
};

const VEHICULOS: TerminosDeConfiguracion = {
  etiquetaDeNombre: "Nombre del tipo de vehículo",
  ejemploDeNombre: "Por ejemplo: Camioneta 4x4",
  documentosQuePide: "Documentos que pide este tipo de vehículo",
  crear: "Crear tipo",
  guardar: "Guardar tipo",
  eliminar: "Eliminar tipo",
  noSePuedeEliminar: "Hay vehículos de este tipo: desactívalo en vez de eliminarlo.",
  confirmarEliminar: "¿Eliminar este tipo de vehículo? No se puede deshacer.",

  resumenDeUsos: (n) => `${n} ${plural(n, "vehículo asignado", "vehículos asignados")}`,
  nuevo: "Nuevo tipo de vehículo",
  vacioTitulo: "Todavía no hay tipos de vehículo",
  vacioTexto: "Un tipo de vehículo define qué documentos se le piden a cada vehículo de ese tipo. Crea el primero.",
  modalNuevoTitulo: "Nuevo tipo de vehículo",
  modalNuevoDescripcion: "Elige qué documentos se le piden a los vehículos de este tipo.",
  modalEditarTitulo: "Editar tipo de vehículo",
  usosPorFila: (n) => `${n} ${plural(n, "vehículo", "vehículos")}`,
  nombreDeLaLista: (n) => plural(n, "tipo de vehículo", "tipos de vehículo"),

  confirmarEliminarDocumento: (nombre) =>
    `¿Eliminar el documento «${nombre}» del catálogo?\n\nSe quita también de los tipos de vehículo que lo piden.`,
  quienLoPide: (n) =>
    n === 0 ? "Ningún tipo de vehículo lo pide" : `Lo ${n === 1 ? "pide 1 tipo" : `piden ${n} tipos`} de vehículo`,
  usoDeDocumento: (n) =>
    n > 0 ? `${n} ${n === 1 ? "vehículo lo tiene" : "vehículos lo tienen"} anotado` : "nadie lo tiene anotado",
  documentoEnUso: "Hay vehículos con este documento anotado: desactívalo en vez de eliminarlo.",
  pedirleA: "Pedírselo a estos tipos de vehículo",
  cambiarDespues: "Se puede cambiar después en cada tipo de vehículo.",

  dotacionSinMeta:
    "Todavía no se definió cuántos vehículos se deben contratar. Indícalo —en total y, si quieres, por tipo— y acá verás cuántos llevas y cuántos faltan.",
  contratadas: "contratados",
  metaCumplida: (n) => (n > 0 ? `Meta cumplida · ${n} ${plural(n, "vehículo", "vehículos")} de más` : "Meta cumplida"),
  faltan: (n) => `Faltan ${n} ${plural(n, "vehículo", "vehículos")}`,
  barraDeDotacion: (c, m) => `${c} de ${m} vehículos contratados`,
  totalDesdeCategorias: "El total sale de sumar las cantidades de los tipos. Puedes fijar uno propio en «Editar».",
  ayudaDelTotal: "Si lo dejas vacío, el total será la suma de las cantidades por tipo.",
  porCategoria: "Por tipo de vehículo (opcional)",
  ayudaPorCategoria: "Con la cantidad por tipo se ve CUÁLES faltan. Déjala vacía en los que no apliquen.",
  cantidadDe: (nombre) => `Cantidad de ${nombre}`,
  dotacionDescripcion: "Cuántos vehículos se deben contratar y cuántos faltan.",
  dotacionEditarDescripcion: "Cuántos vehículos se deben contratar. Lo que falta se calcula contra la flota.",
};

export const TERMINOS_DE_CONFIGURACION: Record<Dominio, TerminosDeConfiguracion> = {
  personas: PERSONAS,
  vehiculos: VEHICULOS,
};
