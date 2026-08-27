import { NOMBRE_DE_SECCION, type OfertaCanonica, type SeccionConImagenes } from "./tipos";
import { asignarEnRuta, numeroDesdeTexto } from "./rutas";
import { textoDeFirma } from "./destino-imagen";
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

/**
 * Cómo viaja una foto del cajón al documento.
 *
 * Un tipo propio y no "text/plain": si fuera texto, arrastrar una palabra desde
 * cualquier parte de la pantalla parecería una foto, y soltar en una sección haría
 * cualquier cosa. Además el navegador deja leer los TIPOS mientras se arrastra
 * —el contenido no—, así que esto es lo único que permite decidir si una sección
 * puede recibir lo que viene antes de que lo suelten.
 */
export const TIPO_ARRASTRE = "application/x-imagen-oferta";

const ESTILO_DEL_EDITOR = `
  /* Ni un milímetro de espacio acá adentro.
     Este estilo se inyecta sobre un documento YA dibujado, así que cualquier cosa
     que ocupe lugar lo corre. Tenía "body { padding: 8mm 10mm }" para darle aire al
     editar, y el efecto era que al abrir la pestaña Documento las 264 cajas del
     documento se movían 10 mm a la derecha y 8 mm abajo, y el texto reflowaba en un
     ancho menor: dejaba de ser el resultado y pasaba a ser una aproximación movida.
     El aire ahora lo pone el marco, por fuera del papel (ver DocumentoEditable). */
  body { background: #fff; }
  [data-campo] { border-radius: 2px; }
  [data-campo]:hover { background: ${ACENTO}14; }
  [data-campo]:focus { background: #fff; outline: 2px solid ${ACENTO}; outline-offset: 1px; }
  /* Un campo vacío no ocupa lugar y no se puede pinchar: se le deja un hueco con su
     marca. El contenido de un ::after no es editable, así que no entra al dato. */
  [data-campo]:empty::after { content: "Escribir aquí"; color: #b9b4ad; font-style: italic; }
  [data-calculado] { cursor: not-allowed; }
  [data-calculado]:hover { box-shadow: inset 0 0 0 1px ${ACENTO}55; }

  /* Lo que va a recibir la foto: una sección, o el bloque de un firmante. El borde
     se dibuja por fuera con un outline y no con un border, que correría el texto de
     lugar justo cuando hay algo flotando encima. */
  section[data-seccion].recibiendo, [data-firma].recibiendo {
    outline: 2px dashed ${ACENTO}; outline-offset: 4px; background: ${ACENTO}09;
  }

  /* El rótulo va FLOTANDO sobre la sección y no como un bloque adentro: como
     bloque agregaba su alto a la sección justo mientras la foto estaba encima, y
     todo lo que venía abajo se corría en el peor momento posible. Con position
     absolute no ocupa lugar, y el "position: relative" de la sección se declara
     junto para que se ubique respecto de ella. */
  section[data-seccion], [data-firma] { position: relative; }
  section[data-seccion].recibiendo::after, [data-firma].recibiendo::after {
    content: attr(data-soltar); position: absolute; top: 2px; right: 2px;
    padding: 1px 6px; border-radius: 999px; background: ${ACENTO}; color: #fff;
    font-size: 8px; letter-spacing: .08em; text-transform: uppercase;
  }
  /* En la firma el rótulo va ABAJO Y AFUERA. Arriba a la derecha —donde va en una
     sección— es exactamente donde se apoya la rúbrica, y adentro tapaba el cargo de
     la persona. Afuera se cruza con la línea del RUT, que es texto fijo y solo
     mientras la foto está encima. */
  [data-firma].recibiendo::after { top: auto; bottom: -14px; right: auto; left: 0; }

  /* La × para sacar una foto del documento: aparece al pasar por encima. */
  .fotos figure { position: relative; }
  .fotos figure .quitar-foto {
    position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; padding: 0;
    border: 1px solid ${ACENTO}55; border-radius: 999px; background: #fff; color: ${ACENTO};
    font: 700 13px/1 sans-serif; cursor: pointer; opacity: 0; transition: opacity .12s;
  }
  .fotos figure:hover .quitar-foto, .fotos figure .quitar-foto:focus { opacity: 1; }
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
  /**
   * Soltaron sobre el documento una foto que ya está en la oferta.
   *
   * `destino` es el texto de un destino (ver lib/ofertas/destino-imagen.ts): la
   * clave de una sección, o "firma-<i>" si la soltaron sobre el bloque de un
   * firmante, que es cómo se pone una rúbrica arrastrándola.
   */
  alSoltarImagen?: (indice: number, destino: string) => void;
  /**
   * Soltaron archivos del escritorio sobre el documento.
   *
   * `destino` es null cuando cayeron donde no se reciben imágenes —la portada, el
   * hueco entre dos secciones—. Ahí el archivo igual se suma a la oferta y queda sin
   * ubicar: traer una foto de una carpeta al documento no puede terminar en nada.
   */
  alSoltarArchivos?: (archivos: File[], destino: string | null) => void;
  /** Apretaron la × de una foto del documento. */
  alQuitarImagen?: (indice: number) => void;
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
  const soltarArrastre = prepararArrastre(doc, opciones);

  return () => {
    medidor?.disconnect();
    doc.removeEventListener("input", alEscribir);
    doc.removeEventListener("beforeinput", alAntesDeEscribir);
    doc.removeEventListener("paste", alPegar);
    doc.removeEventListener("focusout", alSalir);
    soltarArrastre();
  };
}

/**
 * Poner y sacar fotos arrastrándolas sobre el documento.
 *
 * Lo que había antes era un desplegable por foto y un botón para aplicar todo
 * junto: para saber dónde iba a salir cada una había que imaginarse el documento.
 * Acá se suelta la foto en el lugar donde va y se ve ahí.
 *
 * Dos cosas se pueden soltar: una foto que ya está en la oferta —viene del cajón de
 * al lado, con su número— y archivos del escritorio, que primero hay que subir. Las
 * dos caen en lo que esté debajo del cursor, y no hay blanco donde no puede ir una
 * imagen: las secciones que no llevan imágenes no tienen el atributo.
 *
 * Y lo que está debajo del cursor puede ser el bloque de un firmante: la rúbrica es
 * una imagen más y se pone igual que las otras, arrastrándola hasta donde va. Antes
 * era lo único que había que ir a buscar a un desplegable, siendo justamente la
 * imagen que más obvio es DÓNDE va. El bloque de firma gana sobre la sección que lo
 * contiene —el cierre también recibe imágenes— porque es el blanco más preciso: si
 * alguien apunta a la línea de firma, quiere firmar ahí.
 */
/** Un lugar del documento que puede recibir una imagen. */
interface Blanco {
  /** El elemento que se ilumina. */
  elemento: HTMLElement;
  /** El destino, en el formato que entiende leerDestino. */
  destino: string;
  /** Lo que dice la pastilla mientras la foto está encima. */
  rotulo: string;
}

/**
 * Qué puede recibir la imagen, mirando desde el elemento que está bajo el cursor
 * hacia arriba.
 *
 * Sin `instanceof HTMLElement`, por la misma razón que en el resto del módulo: el
 * elemento vive en el documento del iframe, y ese constructor es el de ESTA página.
 */
function blancoEn(destino: EventTarget | null): Blanco | null {
  const nodo = destino as Element | null;
  if (!nodo || typeof nodo.closest !== "function") return null;

  const firma = nodo.closest<HTMLElement>("[data-firma]");
  if (firma) {
    // El nombre sale del documento y no del modelo: es lo que la persona está
    // leyendo en ese momento, y así el rótulo dice "Soltar como firma de Alfonso
    // Hachim Fulgeri" aunque el nombre se acabe de tipear y todavía no se guarde.
    const nombre = firma.querySelector(".nombre")?.textContent?.trim();
    return {
      elemento: firma,
      destino: textoDeFirma(Number(firma.dataset.firma)),
      rotulo: nombre ? `Soltar como firma de ${nombre}` : "Soltar como la firma",
    };
  }

  const seccion = nodo.closest<HTMLElement>("section[data-seccion]");
  if (!seccion?.dataset.seccion) return null;
  // Va el nombre corto y no el título impreso: "Anexo — respaldos y experiencia en
  // trabajos similares" hacía una pastilla de media página.
  const nombre = NOMBRE_DE_SECCION[seccion.dataset.seccion as SeccionConImagenes];
  return {
    elemento: seccion,
    destino: seccion.dataset.seccion,
    rotulo: nombre ? `Soltar en ${nombre}` : "Soltar acá",
  };
}

function prepararArrastre(doc: Document, opciones: OpcionesDeEdicion): () => void {
  const puedeRecibir = Boolean(opciones.alSoltarImagen || opciones.alSoltarArchivos);
  if (!puedeRecibir && !opciones.alQuitarImagen) return () => {};

  // La × de cada foto ya dibujada. Se agrega al DOM de la pantalla y no a la
  // plantilla: en el PDF no existe, y este documento se vuelve a armar entero cada
  // vez que se refresca la vista.
  if (opciones.alQuitarImagen) {
    for (const figura of doc.querySelectorAll<HTMLElement>("figure[data-imagen]")) {
      const boton = doc.createElement("button");
      boton.type = "button";
      boton.className = "quitar-foto";
      boton.title = "Sacar esta foto del documento";
      boton.setAttribute("aria-label", "Sacar esta foto del documento");
      boton.textContent = "\u00d7";
      boton.addEventListener("click", (evento) => {
        evento.preventDefault();
        opciones.alQuitarImagen?.(Number(figura.dataset.imagen));
      });
      figura.appendChild(boton);
    }
  }

  if (!puedeRecibir) return () => {};

  let recibiendo: HTMLElement | null = null;
  const marcar = (blanco: Blanco | null) => {
    if (recibiendo === blanco?.elemento) return;
    recibiendo?.classList.remove("recibiendo");
    if (blanco) {
      // El rótulo dice DÓNDE va a caer: con el documento desplazado y una foto
      // flotando bajo el cursor, eso es lo que no se puede leer del recuadro solo.
      blanco.elemento.dataset.soltar = blanco.rotulo;
      blanco.elemento.classList.add("recibiendo");
    }
    recibiendo = blanco?.elemento ?? null;
  };

  /** Qué trae el arrastre y sobre qué está, si está sobre algo. */
  const lectura = (evento: DragEvent) => {
    const tipos = evento.dataTransfer?.types ?? [];
    return {
      traeFoto: tipos.includes(TIPO_ARRASTRE) && Boolean(opciones.alSoltarImagen),
      traeArchivos: tipos.includes("Files") && Boolean(opciones.alSoltarArchivos),
      blanco: blancoEn(evento.target),
    };
  };

  const alArrastrar = (evento: DragEvent) => {
    const { traeFoto, traeArchivos, blanco } = lectura(evento);
    if (!traeFoto && !traeArchivos) return;
    marcar(blanco);

    // Una foto que ya está en la oferta necesita un destino: moverla a ninguna parte
    // no significa nada. Un archivo del escritorio, en cambio, se acepta caiga donde
    // caiga —si no cayó en un blanco igual entra a la oferta y queda sin ubicar—,
    // porque traer una foto de una carpeta al documento no puede terminar en que no
    // pasó nada.
    if (!traeArchivos && !blanco) return;

    // Sin esto el navegador no considera la zona soltable —y con archivos, además,
    // abre el archivo soltado en la pestaña.
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = traeArchivos ? "copy" : "move";
  };

  const alSalirDelArrastre = (evento: DragEvent) => {
    // relatedTarget vacío = el puntero se fue del documento entero.
    if (!evento.relatedTarget) marcar(null);
  };

  const alSoltar = (evento: DragEvent) => {
    const { traeFoto, traeArchivos, blanco } = lectura(evento);
    marcar(null);

    if (traeFoto && blanco) {
      evento.preventDefault();
      const numero = evento.dataTransfer?.getData(TIPO_ARRASTRE);
      if (numero) opciones.alSoltarImagen?.(Number(numero), blanco.destino);
      return;
    }

    if (!traeArchivos) return;
    const archivos = [...(evento.dataTransfer?.files ?? [])];
    if (archivos.length === 0) return;
    evento.preventDefault();
    opciones.alSoltarArchivos?.(archivos, blanco?.destino ?? null);
  };

  doc.addEventListener("dragover", alArrastrar);
  doc.addEventListener("dragleave", alSalirDelArrastre);
  doc.addEventListener("drop", alSoltar);
  return () => {
    marcar(null);
    doc.removeEventListener("dragover", alArrastrar);
    doc.removeEventListener("dragleave", alSalirDelArrastre);
    doc.removeEventListener("drop", alSoltar);
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
