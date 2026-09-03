import { esTituloLibre, type BloqueLibre, type OfertaCanonica, type SeccionDelDocumento } from "./tipos";

/**
 * Agregar y sacar estructura desde el documento: subtítulos, párrafos, columnas y
 * filas de una tabla libre.
 *
 * Por qué acá y no en una ruta del servidor: son operaciones sobre el borrador que
 * el editor tiene en la mano, y el editor puede tener texto escrito sin guardar. Si
 * agregar un subtítulo pasara por el servidor, el servidor tendría que leer el
 * contenido de la base —y perdería lo que se está escribiendo— o guardarlo entero,
 * y entonces apretar "+" guardaría de prepo lo que alguien todavía estaba probando.
 * Acá se aplica sobre el borrador vivo, y se guarda con "Guardar cambios" como
 * cualquier otra edición.
 *
 * Lo que sí es del servidor es DIBUJAR el resultado: la numeración de los subtítulos
 * (3.1, 3.2) y el índice los cuenta la plantilla al armar el documento, así que
 * después de cada una de estas operaciones el editor vuelve a pedir la vista. Es la
 * misma división de siempre: la estructura la decide quien escribe, la maqueta la
 * arma el servidor.
 *
 * Todas mutan el borrador que reciben —así las usa el editor, igual que el
 * formulario— y ninguna lanza: un índice que no existe no hace nada. El documento en
 * pantalla puede haber quedado un paso atrás del dato, y ahí no hacer nada es mejor
 * que romper.
 */

/**
 * Qué se le pidió al documento.
 *
 * Un tipo y no diez funciones sueltas porque el pedido nace en el DOM del iframe
 * —donde no hay React ni tipos en tiempo de ejecución— viaja a la pantalla y se
 * aplica sobre el borrador. Con un objeto, ese viaje se puede probar y el que
 * aplica no adivina.
 */
export type OperacionDeEstructura =
  | { tipo: "agregarBloque"; en: SeccionDelDocumento; nivel: "titulo" | "subtitulo" }
  | { tipo: "quitarBloque"; bloque: number }
  | { tipo: "agregarParrafo"; bloque: number }
  | { tipo: "quitarParrafo"; bloque: number; parrafo: number }
  | { tipo: "agregarTabla"; bloque: number }
  | { tipo: "quitarTabla"; bloque: number }
  | { tipo: "agregarColumna"; bloque: number }
  | { tipo: "quitarColumna"; bloque: number; columna: number }
  | { tipo: "agregarFila"; bloque: number }
  | { tipo: "quitarFila"; bloque: number; fila: number };

/** El rótulo con el que nace un bloque, para que se vea que falta escribirlo. */
export const TITULO_NUEVO = "Nuevo subtítulo";
export const TITULO_NUEVO_SECCION = "Nueva sección";

/** El nombre con el que nace un bloque, según lo que sea. */
export function tituloInicial(nivel: "titulo" | "subtitulo"): string {
  return nivel === "titulo" ? TITULO_NUEVO_SECCION : TITULO_NUEVO;
}

/** ¿Todavía se llama como nació? Es lo que mira el control de Por revisar. */
export function sinTitular(bloque: BloqueLibre): boolean {
  return bloque.titulo.trim() === tituloInicial(esTituloLibre(bloque) ? "titulo" : "subtitulo");
}

/** Cuántas columnas tiene una tabla recién agregada. */
const COLUMNAS_INICIALES = 2;

function bloques(borrador: OfertaCanonica): BloqueLibre[] {
  if (!borrador.bloques) borrador.bloques = [];
  return borrador.bloques;
}

function bloque(borrador: OfertaCanonica, i: number): BloqueLibre | null {
  return borrador.bloques?.[i] ?? null;
}

/**
 * Deja todas las filas con una celda por columna.
 *
 * Es la única regla que sostiene la tabla libre: una fila con menos celdas que
 * columnas dibuja una fila corta —y una ruta de celda que no existe no se puede
 * editar, así que la celda quedaría muerta— y con más, imprime una columna que no
 * tiene encabezado.
 */
function parejo(tabla: { columnas: string[]; filas: string[][] }): void {
  tabla.filas = tabla.filas.map((fila) => {
    const iguales = fila.slice(0, tabla.columnas.length);
    while (iguales.length < tabla.columnas.length) iguales.push("");
    return iguales;
  });
}

/**
 * Un bloque nuevo enganchado a esa sección, con un párrafo para escribir.
 *
 * Un subtítulo va adentro de la sección; un título sale como una sección propia,
 * justo después de ella.
 */
export function agregarBloque(
  borrador: OfertaCanonica,
  en: SeccionDelDocumento,
  nivel: "titulo" | "subtitulo" = "subtitulo",
): void {
  const lista = bloques(borrador);
  // Al final de los de SU sección y no al final de todos: el orden dentro del
  // arreglo es el orden impreso, y con dos secciones intercaladas los bloques de una
  // aparecerían mezclados con los de la otra.
  const ultimo = lista.reduce((pos, b, i) => (b.en === en ? i + 1 : pos), lista.length);
  lista.splice(ultimo, 0, { en, nivel, titulo: tituloInicial(nivel), parrafos: [""], tabla: null });
}

export function quitarBloque(borrador: OfertaCanonica, i: number): void {
  if (bloque(borrador, i)) borrador.bloques!.splice(i, 1);
}

export function agregarParrafo(borrador: OfertaCanonica, i: number): void {
  bloque(borrador, i)?.parrafos.push("");
}

export function quitarParrafo(borrador: OfertaCanonica, i: number, j: number): void {
  const b = bloque(borrador, i);
  if (b && j >= 0 && j < b.parrafos.length) b.parrafos.splice(j, 1);
}

/** Una tabla vacía en el bloque, si todavía no tenía. */
export function agregarTabla(borrador: OfertaCanonica, i: number): void {
  const b = bloque(borrador, i);
  if (!b || b.tabla) return;
  b.tabla = {
    columnas: Array.from({ length: COLUMNAS_INICIALES }, () => ""),
    filas: [Array.from({ length: COLUMNAS_INICIALES }, () => "")],
  };
}

export function quitarTabla(borrador: OfertaCanonica, i: number): void {
  const b = bloque(borrador, i);
  if (b) b.tabla = null;
}

export function agregarColumna(borrador: OfertaCanonica, i: number): void {
  const tabla = bloque(borrador, i)?.tabla;
  if (!tabla) return;
  tabla.columnas.push("");
  parejo(tabla);
}

/**
 * Saca una columna con sus celdas.
 *
 * La última no se saca: una tabla sin columnas no es una tabla, es un rectángulo
 * vacío que después no se puede volver a llenar porque no queda dónde apretar. Para
 * eso está sacar la tabla.
 */
export function quitarColumna(borrador: OfertaCanonica, i: number, columna: number): void {
  const tabla = bloque(borrador, i)?.tabla;
  if (!tabla || tabla.columnas.length <= 1) return;
  if (columna < 0 || columna >= tabla.columnas.length) return;
  tabla.columnas.splice(columna, 1);
  tabla.filas = tabla.filas.map((fila) => fila.filter((_, c) => c !== columna));
  parejo(tabla);
}

export function agregarFila(borrador: OfertaCanonica, i: number): void {
  const tabla = bloque(borrador, i)?.tabla;
  if (!tabla) return;
  tabla.filas.push(Array.from({ length: tabla.columnas.length }, () => ""));
}

export function quitarFila(borrador: OfertaCanonica, i: number, fila: number): void {
  const tabla = bloque(borrador, i)?.tabla;
  if (!tabla || fila < 0 || fila >= tabla.filas.length) return;
  tabla.filas.splice(fila, 1);
}

/**
 * Los bloques de una sección, con el índice que tienen en el dato.
 *
 * El índice es lo que viaja al documento: cada campo del bloque se edita por su ruta
 * (`bloques.3.titulo`), y esa ruta apunta al arreglo completo, no a la posición
 * dentro de la sección.
 */
/**
 * Los bloques de una seccion, EN ORDEN y agrupados por su jerarquia.
 *
 * Un titulo libre abre un grupo y los subtitulos que lo siguen —hasta el titulo
 * siguiente— son suyos. Es la jerarquia del documento original, y hay que reconstruirla
 * porque `BloqueLibre` es una lista plana: cada bloque dice de que seccion cuelga (`en`)
 * y de que nivel es, pero no quien es su padre.
 *
 * Sin esto, un subtitulo colgaba de la seccion CANONICA y no del titulo que lo precede.
 * Mientras las ofertas se leian con el molde del maestro eso funcionaba —la seccion
 * existia y lo dibujaba—, pero desde que la lectura respeta la estructura del original
 * las secciones canonicas estan en null y el subtitulo no lo dibujaba nadie: se perdian
 * el subtitulo y todo su contenido, en silencio, en el PDF que va al cliente.
 *
 * `sueltos` son los subtitulos que aparecen ANTES del primer titulo libre: esos si
 * pertenecen a la seccion canonica, y los dibuja ella.
 */
export function gruposDe(
  contenido: OfertaCanonica,
  en: SeccionDelDocumento,
): {
  sueltos: { bloque: BloqueLibre; i: number }[];
  grupos: { titulo: { bloque: BloqueLibre; i: number }; hijos: { bloque: BloqueLibre; i: number }[] }[];
} {
  const sueltos: { bloque: BloqueLibre; i: number }[] = [];
  const grupos: {
    titulo: { bloque: BloqueLibre; i: number };
    hijos: { bloque: BloqueLibre; i: number }[];
  }[] = [];

  for (const { bloque, i } of (contenido.bloques ?? []).map((bloque, i) => ({ bloque, i }))) {
    if (bloque.en !== en) continue;
    if (esTituloLibre(bloque)) {
      grupos.push({ titulo: { bloque, i }, hijos: [] });
      continue;
    }
    const ultimo = grupos[grupos.length - 1];
    if (ultimo) ultimo.hijos.push({ bloque, i });
    else sueltos.push({ bloque, i });
  }

  return { sueltos, grupos };
}

export function bloquesDe(
  contenido: OfertaCanonica,
  en: SeccionDelDocumento,
  nivel: "titulo" | "subtitulo",
): { bloque: BloqueLibre; i: number }[] {
  return (contenido.bloques ?? [])
    .map((bloque, i) => ({ bloque, i }))
    .filter(({ bloque }) => bloque.en === en && esTituloLibre(bloque) === (nivel === "titulo"));
}

/**
 * ¿Este bloque tiene algo escrito?
 *
 * Un bloque recién agregado —sin título propio, sin texto y sin tabla— no se imprime:
 * dejaría un subtítulo numerado y vacío en el PDF que va al cliente. En el editor sí
 * se ve, porque si no, apretar "+" no mostraría nada.
 */
export function bloqueConContenido(bloque: BloqueLibre): boolean {
  if (bloque.titulo.trim() !== "" && !sinTitular(bloque)) return true;
  if (bloque.parrafos.some((p) => p.trim() !== "")) return true;
  const tabla = bloque.tabla;
  if (!tabla) return false;
  return tabla.columnas.some((c) => c.trim() !== "") || tabla.filas.some((f) => f.some((c) => c.trim() !== ""));
}

/**
 * Aplica una operación sobre el borrador.
 *
 * Un solo lugar donde se resuelve qué hace cada pedido: el editor lo llama dos veces
 * con el mismo objeto —sobre la copia viva del documento y sobre el estado de la
 * página, que es lo que se guarda— y así las dos no pueden divergir.
 */
export function aplicarEstructura(borrador: OfertaCanonica, operacion: OperacionDeEstructura): void {
  switch (operacion.tipo) {
    case "agregarBloque":
      return agregarBloque(borrador, operacion.en, operacion.nivel);
    case "quitarBloque":
      return quitarBloque(borrador, operacion.bloque);
    case "agregarParrafo":
      return agregarParrafo(borrador, operacion.bloque);
    case "quitarParrafo":
      return quitarParrafo(borrador, operacion.bloque, operacion.parrafo);
    case "agregarTabla":
      return agregarTabla(borrador, operacion.bloque);
    case "quitarTabla":
      return quitarTabla(borrador, operacion.bloque);
    case "agregarColumna":
      return agregarColumna(borrador, operacion.bloque);
    case "quitarColumna":
      return quitarColumna(borrador, operacion.bloque, operacion.columna);
    case "agregarFila":
      return agregarFila(borrador, operacion.bloque);
    case "quitarFila":
      return quitarFila(borrador, operacion.bloque, operacion.fila);
  }
}

/** Lo que dice el botón de cada operación, para no escribirlo en dos lados. */
export const ROTULO_DE_OPERACION: Record<OperacionDeEstructura["tipo"], string> = {
  agregarBloque: "Subtítulo",
  quitarBloque: "Quitar esto del documento",
  agregarParrafo: "Párrafo",
  quitarParrafo: "Quitar este párrafo",
  agregarTabla: "Tabla",
  quitarTabla: "Quitar la tabla",
  agregarColumna: "Columna",
  quitarColumna: "Quitar esta columna",
  agregarFila: "Fila",
  quitarFila: "Quitar esta fila",
};
