import type { OfertaCanonica } from "./tipos";
import { asignarEnRuta, numeroDesdeTexto } from "./rutas";
import { calcularTotales } from "./verificar";
import { clp } from "./plantilla";

/**
 * Editar el documento en el DOM, sin React.
 *
 * Todo lo que pasa adentro del iframe vive acá y no en el componente, por dos
 * razones. La primera es que no puede ser de React: si el documento se redibujara
 * con cada tecla, el cursor saltaría al principio en cada letra. Se dibuja una vez
 * y desde ahí lo maneja el navegador, como cualquier campo de texto.
 *
 * La segunda es que así se puede probar. Esto es un puñado de supuestos sobre cómo
 * se comporta contenteditable —qué llega en textContent, qué hace el Enter, qué
 * pega el portapapeles— y ninguno se puede verificar leyendo el código: hay que
 * abrir un navegador y escribir. Con la lógica en un módulo suelto, la prueba
 * ejercita esto mismo y no una copia parecida.
 *
 * Ver components/ofertas/DocumentoEditable.tsx para el porqué del iframe y de dónde
 * salen los `data-campo`.
 */

/** El naranjo de la aplicación. Adentro del iframe no llegan sus variables CSS. */
const ACENTO = "#c85217";

const ESTILO_DEL_EDITOR = `
  body { padding: 8mm 10mm; background: #fff; }
  [data-campo] { border-radius: 2px; }
  [data-campo]:hover { background: ${ACENTO}14; }
  [data-campo]:focus { background: #fff; outline: 2px solid ${ACENTO}; outline-offset: 1px; }
  /* Un campo vacío no ocupa lugar y no se puede pinchar: se le deja un hueco con su
     marca. El contenido de un ::after no es editable, así que no entra al dato. */
  [data-campo]:empty::after { content: "Escribir aquí"; color: #b9b4ad; font-style: italic; }
  [data-calculado] { cursor: not-allowed; }
  [data-calculado]:hover { box-shadow: inset 0 0 0 1px ${ACENTO}55; }
`;

/**
 * El texto con el que se vuelve a escribir un número al salir del campo.
 *
 * Mientras se tipea no se toca —reformatear en cada tecla mueve el cursor—, pero al
 * soltar el campo tiene que quedar como lo imprime la plantilla: si no, un valor
 * unitario quedaría "15885200" en la pantalla y "$ 15.885.200.-" en el PDF.
 */
export function textoImpreso(ruta: string, valor: number): string {
  if (ruta.endsWith("valorUnitario")) return clp(valor);
  // La columna de cantidad va con dos dígitos, como en el papel.
  if (ruta.endsWith("cantidad")) return String(valor).padStart(2, "0");
  return String(valor);
}

export interface OpcionesDeEdicion {
  /** Una oferta emitida se mira, no se toca. */
  editable: boolean;
  /**
   * La copia viva sobre la que escribe el editor.
   *
   * Se muta acá mismo y en el acto, porque los totales del documento se recalculan
   * en la misma tecla y necesitan el dato ya cambiado.
   */
  oferta: () => OfertaCanonica;
  /** Avisa afuera de cada edición, para que el estado de la página la guarde. */
  alEditar: (ruta: string, texto: string, tipo?: "numero") => void;
  /** El documento cambió de alto: lo usa la página para no anidar dos scrolls. */
  alMedir?: (alto: number) => void;
}

/**
 * Deja el documento listo para editar y devuelve cómo soltarlo.
 *
 * Los eventos se enganchan al documento entero y no a cada campo: son más de
 * cincuenta y se vuelven a dibujar completos cada vez que se refresca la vista.
 */
export function prepararDocumento(doc: Document, opciones: OpcionesDeEdicion): () => void {
  const estilo = doc.createElement("style");
  estilo.textContent = ESTILO_DEL_EDITOR;
  doc.head.appendChild(estilo);

  for (const celda of doc.querySelectorAll<HTMLElement>("[data-calculado]")) {
    celda.title = "Lo calcula el servidor a partir de las filas.";
  }

  const medidor = opciones.alMedir
    ? new ResizeObserver(() => opciones.alMedir?.(doc.documentElement.scrollHeight))
    : null;
  if (medidor) {
    opciones.alMedir?.(doc.documentElement.scrollHeight);
    medidor.observe(doc.documentElement);
  }

  if (!opciones.editable) return () => medidor?.disconnect();

  for (const campo of doc.querySelectorAll<HTMLElement>("[data-campo]")) {
    try {
      // Sin marcado: pegar desde Word trae fuentes y colores que no son de este
      // documento, y el dato es texto.
      campo.contentEditable = "plaintext-only";
    } catch {
      campo.contentEditable = "true";
    }
  }

  // Sin `instanceof HTMLElement`, por más natural que parezca: el elemento vive en
  // el documento del iframe y el constructor es el de ESTA página, así que son dos
  // realms distintos y la comprobación da falso SIEMPRE. Comprobado en el navegador:
  // los eventos llegaban y no se editaba nada. Se pregunta por lo que se va a usar.
  const campoDe = (destino: EventTarget | null): HTMLElement | null => {
    const nodo = destino as Element | null;
    if (!nodo || typeof nodo.closest !== "function") return null;
    return nodo.closest<HTMLElement>("[data-campo]");
  };

  const alEscribir = (evento: Event) => {
    const campo = campoDe(evento.target);
    if (campo) registrar(doc, campo, opciones);
  };

  const alAntesDeEscribir = (evento: InputEvent) => {
    // Un campo es un dato, no un párrafo libre. Y con contenteditable el Enter no
    // es inocuo: mete saltos de línea en el textContent —comprobado en el
    // navegador— que después viajarían al dato y al PDF.
    if (evento.inputType === "insertParagraph" || evento.inputType === "insertLineBreak") {
      evento.preventDefault();
      campoDe(evento.target)?.blur();
    }
  };

  const alPegar = (evento: ClipboardEvent) => {
    const campo = campoDe(evento.target);
    if (!campo) return;
    evento.preventDefault();
    // Un párrafo copiado de Word llega con saltos de línea y tabulaciones que en el
    // documento no significan nada.
    const texto = (evento.clipboardData?.getData("text/plain") ?? "").replace(/\s+/g, " ").trim();
    const seleccion = doc.getSelection();
    if (!seleccion || seleccion.rangeCount === 0) return;
    const rango = seleccion.getRangeAt(0);
    rango.deleteContents();
    const nodo = doc.createTextNode(texto);
    rango.insertNode(nodo);
    rango.setStartAfter(nodo);
    rango.collapse(true);
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
    // Insertar a mano no dispara "input".
    registrar(doc, campo, opciones);
  };

  const alSalir = (evento: Event) => {
    const campo = campoDe(evento.target);
    const ruta = campo?.dataset.campo;
    if (!campo || !ruta || campo.dataset.tipo !== "numero") return;
    const impreso = textoImpreso(ruta, numeroDesdeTexto(campo.textContent ?? ""));
    if (campo.textContent !== impreso) campo.textContent = impreso;
  };

  doc.addEventListener("input", alEscribir);
  doc.addEventListener("beforeinput", alAntesDeEscribir);
  doc.addEventListener("paste", alPegar);
  doc.addEventListener("focusout", alSalir);

  return () => {
    medidor?.disconnect();
    doc.removeEventListener("input", alEscribir);
    doc.removeEventListener("beforeinput", alAntesDeEscribir);
    doc.removeEventListener("paste", alPegar);
    doc.removeEventListener("focusout", alSalir);
  };
}

/** Un texto del documento cambió: al dato, a su espejo y a los totales. */
function registrar(doc: Document, campo: HTMLElement, opciones: OpcionesDeEdicion): void {
  const ruta = campo.dataset.campo;
  if (!ruta) return;
  const tipo = campo.dataset.tipo === "numero" ? "numero" : undefined;
  const texto = campo.textContent ?? "";

  asignarEnRuta(opciones.oferta(), ruta, texto, tipo);
  opciones.alEditar(ruta, texto, tipo);

  // El mismo dato puede estar impreso en dos lugares —el número de oferta va en la
  // portada y en la tabla de identificación— y verlos discrepar mientras se escribe
  // es peor que no poder editarlo en el documento.
  for (const espejo of doc.querySelectorAll<HTMLElement>(`[data-campo="${CSS.escape(ruta)}"]`)) {
    if (espejo !== campo && espejo.textContent !== texto) espejo.textContent = texto;
  }
  recalcular(doc, opciones.oferta());
}

/**
 * Vuelve a escribir todo lo que calcula el servidor, con el dato del momento.
 *
 * Es la misma cuenta que hace `calcularTotales` al guardar y al imprimir: acá se
 * repite solo para que la pantalla no muestre un total viejo mientras se escribe.
 * Ninguna de estas celdas es editable — un total escrito a mano es exactamente el
 * error que este módulo existe para detectar.
 */
export function recalcular(doc: Document, oferta: OfertaCanonica): void {
  const totales = calcularTotales(oferta);
  const indiceDe = (celda: HTMLElement, prefijo: string): number => {
    const ancla = celda.closest("tr")?.querySelector<HTMLElement>(`[data-campo^="${prefijo}"]`);
    return Number(ancla?.dataset.campo?.split(".")[2]);
  };

  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="linea"]')) {
    const linea = oferta.precio?.lineas[indiceDe(celda, "precio.lineas.")];
    if (linea) celda.textContent = clp(linea.cantidad * linea.valorUnitario);
  }
  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="totalNeto"]')) {
    celda.textContent = clp(totales.totalNetoCalculado);
  }
  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="dotacion"]')) {
    celda.textContent = String(totales.dotacionTotal);
  }
  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="horas"]')) {
    celda.textContent = String(totales.horasPrograma);
  }
  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="turnos"]')) {
    celda.textContent = `${totales.cantidadTurnos} turno${totales.cantidadTurnos === 1 ? "" : "s"}`;
  }

  // El avance acumulado del programa se recorre en el orden en que están impresas
  // las filas, que es el orden en que ocurren los turnos.
  let acumulado = 0;
  for (const celda of doc.querySelectorAll<HTMLElement>('[data-calculado="avance"]')) {
    acumulado += oferta.programa?.turnos[indiceDe(celda, "programa.turnos.")]?.horas ?? 0;
    const ancho = totales.horasPrograma ? Math.round((acumulado / totales.horasPrograma) * 100) : 0;
    const barra = celda.querySelector<HTMLElement>(".barra > span");
    const texto = celda.querySelector<HTMLElement>(".avance");
    if (barra) barra.style.width = `${ancho}%`;
    if (texto) texto.textContent = `${acumulado} h de ${totales.horasPrograma} h`;
  }
}
