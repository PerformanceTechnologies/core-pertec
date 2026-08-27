import {
  NOMBRE_DE_SECCION,
  SECCIONES_DEL_DOCUMENTO,
  type OfertaCanonica,
  type SeccionConImagenes,
} from "./tipos";
import { asignarEnRuta, numeroDesdeTexto } from "./rutas";
import { textoDeFirma } from "./destino-imagen";
import { ROTULO_DE_OPERACION, type OperacionDeEstructura } from "./estructura";
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

/** La tinta de la aplicación, para el campo enfocado: fondo blanco, texto oscuro. */
const TINTA = "#171411";

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
  /* El color va JUNTO con el fondo, siempre.
     Los encabezados de columna son texto claro sobre una franja oscura, y como el
     campo editable es un span DENTRO de la celda, poner solo el fondo blanco al
     enfocarlo dejaba texto blanco sobre blanco: se escribía a ciegas. Pasa en todos
     los rótulos que viven sobre un fondo de color —los encabezados de tabla, las
     cabeceras de Aportes, la fila de total— así que se arregla en la regla, no caso
     por caso. */
  [data-campo]:focus { background: #fff; color: ${TINTA}; outline: 2px solid ${ACENTO}; outline-offset: 1px; }
  /* Un campo vacío no ocupa lugar y no se puede pinchar: se le deja un hueco con su
     marca. El contenido de un ::after no es editable, así que no entra al dato. */
  [data-campo]:empty::after { content: "Escribir aquí"; color: #b9b4ad; font-style: italic; }
  [data-calculado] { cursor: not-allowed; }
  [data-calculado]:hover { box-shadow: inset 0 0 0 1px ${ACENTO}55; }

  /* Lo que va a recibir la foto: una sección, o el bloque de un firmante. El borde
     se dibuja por fuera con un outline y no con un border, que correría el texto de
     lugar justo cuando hay algo flotando encima. */
  section[data-seccion].recibiendo, [data-firma].recibiendo, [data-logo].recibiendo {
    outline: 2px dashed ${ACENTO}; outline-offset: 4px; background: ${ACENTO}09;
  }

  /* El rótulo va FLOTANDO sobre la sección y no como un bloque adentro: como
     bloque agregaba su alto a la sección justo mientras la foto estaba encima, y
     todo lo que venía abajo se corría en el peor momento posible. Con position
     absolute no ocupa lugar, y el "position: relative" de la sección se declara
     junto para que se ubique respecto de ella. */
  section[data-seccion], [data-firma], [data-logo] { position: relative; }
  section[data-seccion].recibiendo::after, [data-firma].recibiendo::after,
  [data-logo].recibiendo::after {
    content: attr(data-soltar); position: absolute; top: 2px; right: 2px;
    padding: 1px 6px; border-radius: 999px; background: ${ACENTO}; color: #fff;
    font-size: 8px; letter-spacing: .08em; text-transform: uppercase;
  }
  /* En la firma el rótulo va ABAJO Y AFUERA. Arriba a la derecha —donde va en una
     sección— es exactamente donde se apoya la rúbrica, y adentro tapaba el cargo de
     la persona. Afuera se cruza con la línea del RUT, que es texto fijo y solo
     mientras la foto está encima. */
  [data-firma].recibiendo::after { top: auto; bottom: -14px; right: auto; left: 0; }
  /* La celda de logo mide 30 mm y su rótulo no entra: va debajo, saliéndose de la
     celda, que durante el arrastre no molesta a nadie. El outline hacia adentro
     porque las tres celdas del encabezado se tocan entre sí. */
  [data-logo].recibiendo { outline-offset: -1px; }
  [data-logo].recibiendo::after { top: auto; bottom: -13px; right: auto; left: 0; }

  /* Quien pidió no ver movimiento no lo ve: quedan los cambios de opacidad, que son
     lo que dice "esto se puede tocar", y se van los desplazamientos. */
  @media (prefers-reduced-motion: reduce) {
    .barra-estructura, .boton-estructura, .quitar-parte { transition-duration: .01ms; }
    .barra-estructura, .quitar-parte, .boton-estructura:hover { transform: none; }
  }

  /* La × para sacar una foto del documento: aparece al pasar por encima. La rúbrica
     tiene la suya, en la esquina de la firma: se podía poner una firma arrastrándola
     y después no había cómo sacarla, que es la mitad del trabajo. */
  .fotos figure, .firmas .rubrica-caja { position: relative; }
  .quitar-foto {
    position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; padding: 0;
    border: 0; border-radius: 999px; background: ${ACENTO}; color: #fff;
    font: 700 13px/1 sans-serif; cursor: pointer; box-shadow: 0 1px 4px ${ACENTO}40;
    opacity: 0; transform: scale(.85);
    transition: opacity .22s ease-out, transform .22s ease-out, background .16s ease-out;
  }
  .quitar-foto:hover { background: #b3261e; }
  /* ── Los controles de estructura ──────────────────────────────────────────
     Todos van POSICIONADOS EN ABSOLUTO, sin excepción: un botón en el flujo
     agregaría su alto al documento y correría todo lo que viene abajo, y este
     documento tiene que ser el resultado, no una aproximación con botones. Se
     muestran al pasar por encima de lo que van a tocar. */
  section[data-en], [data-bloque], [data-libre], .libre th, .libre td { position: relative; }
  /* ── Cómo aparecen ────────────────────────────────────────────────────────
     Suave y en dos tiempos: los controles suben 3 px mientras aparecen, con una
     curva que frena al final (los 12 ms lineales de antes se leían como un
     parpadeo), y se van más lento de lo que llegan —140 ms para entrar, 220 para
     salir— así que pasar el mouse de un botón al de al lado no los apaga en el
     camino. Nada de esto mueve el documento: son cajas en absoluto y lo que se
     anima es su propia opacidad y su propio transform. */
  .barra-estructura {
    position: absolute; top: 0; right: 0; z-index: 5; display: flex; gap: 4px;
    opacity: 0; transform: translateY(3px); pointer-events: none;
    transition: opacity .22s ease-out, transform .22s ease-out;
  }
  section[data-en]:hover > .barra-estructura,
  [data-bloque]:hover > .barra-estructura,
  .barra-estructura:focus-within {
    opacity: 1; transform: translateY(0); pointer-events: auto;
    transition: opacity .14s ease-out, transform .14s ease-out;
  }
  /* Naranjo lleno y no un contorno sobre el papel: un botón tiene que leerse como
     un botón a la primera, y encima del texto del documento —que es negro sobre
     blanco— el contorno fino desaparecía. */
  .boton-estructura {
    border: 0; border-radius: 999px; background: ${ACENTO}; color: #fff;
    padding: 3px 9px; font: 700 8.5px/1.4 sans-serif; letter-spacing: .05em;
    text-transform: uppercase; cursor: pointer; white-space: nowrap;
    box-shadow: 0 1px 4px ${ACENTO}40;
    transition: background .16s ease-out, box-shadow .16s ease-out, transform .16s ease-out;
  }
  .boton-estructura:hover { background: ${TINTA}; box-shadow: 0 2px 7px #17141140; transform: translateY(-1px); }
  .boton-estructura:active { transform: translateY(0); }
  .boton-estructura:focus-visible { outline: 2px solid ${TINTA}; outline-offset: 2px; }
  /* El bloque agregado a mano se distingue al pasar por encima, y con un outline:
     un borde o un padding —el primer intento— empujaría su texto unos milímetros y
     el párrafo cortaría distinto que en el PDF. El outline se dibuja por fuera y no
     ocupa lugar. */
  [data-bloque]:hover { outline: 1px dashed ${ACENTO}55; outline-offset: 3px; }
  /* La × de un párrafo, una columna o una fila: en su esquina, al pasar por encima. */
  .quitar-parte {
    position: absolute; top: 1px; right: 1px; z-index: 5; width: 17px; height: 17px; padding: 0;
    border: 0; border-radius: 999px; background: ${ACENTO}; color: #fff;
    font: 700 12px/1 sans-serif; cursor: pointer; box-shadow: 0 1px 3px ${ACENTO}40;
    opacity: 0; transform: scale(.85);
    transition: opacity .22s ease-out, transform .22s ease-out, background .16s ease-out;
  }
  .quitar-parte:hover { background: #b3261e; }
  /* Cada × aparece al pasar por encima de LO QUE SACA, y solo esa: con todas
     visibles a la vez, en una cabecera de tabla que es una sola franja oscura, no se
     puede saber a qué columna pertenece cada una. La de la fila se muestra desde
     cualquier celda de la fila, no solo desde la última —donde está—: nadie va a
     buscar el borde derecho para sacar una fila. */
  p[data-libre="parrafo"]:hover > .quitar-parte,
  th[data-libre="columna"]:hover > .quitar-parte,
  tr[data-libre="fila"]:hover .quitar-parte,
  .quitar-parte:focus {
    opacity: 1; transform: scale(1);
    transition: opacity .14s ease-out, transform .14s ease-out, background .16s ease-out;
  }

  .fotos figure:hover .quitar-foto,
  .firmas .rubrica-caja:hover .quitar-foto,
  .quitar-foto:focus {
    opacity: 1; transform: scale(1);
    transition: opacity .14s ease-out, transform .14s ease-out, background .16s ease-out;
  }
  /* La rúbrica es chica y clara: la × va pegada a su esquina y un poco más chica,
     que con el tamaño de las del cuerpo tapaba media firma. */
  /* Adentro de la esquina y no colgando por fuera: el bloque del primer firmante
     arranca en el margen izquierdo de la hoja, y una rúbrica angosta dejaba la × del
     lado de afuera del papel, cortada. Adentro no se puede cortar nunca. */
  .firmas .quitar-foto { top: 1px; right: 1px; width: 16px; height: 16px; font-size: 11px; }
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
  /**
   * Soltaron un archivo del escritorio sobre una celda de logo del encabezado.
   *
   * Es el otro logo que hay que poner en cada oferta y era lo único que seguía
   * viviendo solo en un panel aparte: el hueco donde va está a la vista en el
   * documento, así que arrastrarlo ahí es el camino corto.
   */
  alSoltarLogo?: (archivo: File, cual: "casa" | "cliente") => void;
  /**
   * Soltaron sobre una celda de logo una imagen que YA está en la oferta.
   *
   * Pasa seguido: el borrador trae el logo del cliente o su membrete como una de sus
   * imágenes —por eso quedan sin sección— y hasta ahora había que bajarla del cajón y
   * volverla a subir para usarla de logo.
   */
  alUsarComoLogo?: (indice: number, cual: "casa" | "cliente") => void;
  /**
   * Apretaron la × de una foto del documento.
   *
   * `deLaFirma` distingue la rúbrica de una foto del cuerpo. Solo sirve para
   * decirlo en pantalla —"Sacando la firma…"— pero es la diferencia entre un aviso
   * que confirma lo que se acaba de apretar y uno genérico que no confirma nada.
   */
  alQuitarImagen?: (indice: number, deLaFirma: boolean) => void;
  /**
   * Pidieron agregar o sacar estructura: un subtítulo, un párrafo, una columna, una
   * fila. Cambia la forma del documento, así que quien lo reciba tiene que aplicarlo
   * sobre el dato y volver a pedir la maqueta: la numeración de los subtítulos y el
   * índice los arma el servidor.
   */
  alCambiarEstructura?: (operacion: OperacionDeEstructura) => void;
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
  prepararEstructura(doc, opciones);

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
 * Los controles para agregar y sacar estructura, sobre el documento.
 *
 * Antes esto vivía solo en el formulario, y con razón: agregar una fila cambia la
 * numeración, los cortes de página y el índice, y eso lo arma el servidor. Lo que
 * estaba mal era la conclusión —que entonces había que ir a otra pantalla a
 * pedirlo—. El pedido se hace acá, donde se ve dónde va a caer; el que arma sigue
 * siendo el servidor, y por eso después de cada pedido el documento se vuelve a
 * pedir entero.
 *
 * Ni un botón en el flujo del documento: todos van en absoluto, en la esquina de lo
 * que tocan y visibles al pasar por encima. Un botón que ocupa lugar corre el texto,
 * y entonces lo que se ve en pantalla deja de ser lo que se imprime — que es lo
 * único que esta pantalla tiene que garantizar.
 *
 * Los botones se agregan al DOM de la pantalla y no a la plantilla, igual que la ×
 * de las fotos: en el PDF no existen, y el documento se rearma entero en cada
 * cambio.
 */
function prepararEstructura(doc: Document, opciones: OpcionesDeEdicion): void {
  const pedir = opciones.alCambiarEstructura;
  if (!pedir) return;

  const boton = (texto: string, titulo: string, operacion: OperacionDeEstructura): HTMLElement => {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "boton-estructura";
    el.textContent = texto;
    el.title = titulo;
    // El documento es contenteditable por partes: sin esto, apretar un botón que
    // está dentro de un bloque editable primero mueve el cursor y después dispara.
    el.addEventListener("mousedown", (evento) => evento.preventDefault());
    el.addEventListener("click", (evento) => {
      evento.preventDefault();
      pedir(operacion);
    });
    return el;
  };

  const equis = (titulo: string, operacion: OperacionDeEstructura): HTMLElement => {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "quitar-parte";
    el.textContent = "\u00d7";
    el.title = titulo;
    el.setAttribute("aria-label", titulo);
    el.addEventListener("mousedown", (evento) => evento.preventDefault());
    el.addEventListener("click", (evento) => {
      evento.preventDefault();
      pedir(operacion);
    });
    return el;
  };

  const barra = (dentroDe: HTMLElement, botones: HTMLElement[]): void => {
    const caja = doc.createElement("div");
    caja.className = "barra-estructura";
    for (const b of botones) caja.appendChild(b);
    dentroDe.appendChild(caja);
  };

  // Una sección, un "+ Subtítulo". La portada no lleva —no es una sección del
  // documento, la arma la plantilla— y por eso el atributo lo llevan las otras.
  for (const seccion of doc.querySelectorAll<HTMLElement>("section[data-en]")) {
    const en = SECCIONES_DEL_DOCUMENTO.find((clave) => clave === seccion.dataset.en);
    // Lo que dice el DOM es un dato, no una promesa: una sección con un nombre que
    // no existe no lleva el botón, en vez de mandar ese nombre al dato.
    if (!en) continue;
    // Dos, y en este orden: primero el subtítulo, que es lo que se necesita casi
    // siempre —ordenar algo DENTRO de la sección— y después el título, que agrega una
    // sección nueva al documento y por lo tanto se numera y entra al índice.
    barra(seccion, [
      boton("+ Subtítulo", "Agregar un subtítulo dentro de esta sección", {
        tipo: "agregarBloque",
        en,
        nivel: "subtitulo",
      }),
      boton("+ Título", "Agregar una sección nueva, justo después de esta", {
        tipo: "agregarBloque",
        en,
        nivel: "titulo",
      }),
    ]);
  }

  for (const caja of doc.querySelectorAll<HTMLElement>("[data-bloque]")) {
    const bloque = Number(caja.dataset.bloque);
    const tieneTabla = caja.querySelector("table.libre") !== null;
    barra(caja, [
      boton(`+ ${ROTULO_DE_OPERACION.agregarParrafo}`, "Agregar un párrafo", {
        tipo: "agregarParrafo",
        bloque,
      }),
      tieneTabla
        ? boton(`+ ${ROTULO_DE_OPERACION.agregarFila}`, "Agregar una fila a la tabla", {
            tipo: "agregarFila",
            bloque,
          })
        : boton(`+ ${ROTULO_DE_OPERACION.agregarTabla}`, "Agregar una tabla", {
            tipo: "agregarTabla",
            bloque,
          }),
      ...(tieneTabla
        ? [
            boton(`+ ${ROTULO_DE_OPERACION.agregarColumna}`, "Agregar una columna a la tabla", {
              tipo: "agregarColumna",
              bloque,
            }),
          ]
        : []),
      boton("Quitar", ROTULO_DE_OPERACION.quitarBloque, { tipo: "quitarBloque", bloque }),
    ]);

    for (const parrafo of caja.querySelectorAll<HTMLElement>('[data-libre="parrafo"]')) {
      parrafo.appendChild(
        equis(ROTULO_DE_OPERACION.quitarParrafo, {
          tipo: "quitarParrafo",
          bloque,
          parrafo: Number(parrafo.dataset.parrafo),
        }),
      );
    }
    for (const columna of caja.querySelectorAll<HTMLElement>('[data-libre="columna"]')) {
      columna.appendChild(
        equis(ROTULO_DE_OPERACION.quitarColumna, {
          tipo: "quitarColumna",
          bloque,
          columna: Number(columna.dataset.columna),
        }),
      );
    }
    // La × de la fila va en su ÚLTIMA celda: una fila de tabla no es un buen ancla
    // para posicionar en absoluto, y la última celda es la que queda del lado donde
    // están todas las demás ×.
    for (const fila of caja.querySelectorAll<HTMLElement>('[data-libre="fila"]')) {
      const ultima = fila.querySelector<HTMLElement>("td:last-child");
      ultima?.appendChild(
        equis(ROTULO_DE_OPERACION.quitarFila, {
          tipo: "quitarFila",
          bloque,
          fila: Number(fila.dataset.fila),
        }),
      );
    }
  }
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
  /** Lo que dice la pastilla mientras la foto está encima. */
  rotulo: string;
  /** El destino dentro del documento, en el formato que entiende leerDestino. */
  destino?: string;
  /** O una de las dos celdas de logo del encabezado, que no es una ubicación. */
  logo?: "casa" | "cliente";
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

  // El encabezado, primero: sus celdas están fuera de toda sección, pero el orden
  // igual se declara para que se lea la intención.
  const celdaDeLogo = nodo.closest<HTMLElement>("[data-logo]");
  if (celdaDeLogo) {
    const cual = celdaDeLogo.dataset.logo === "casa" ? "casa" : "cliente";
    return {
      elemento: celdaDeLogo,
      logo: cual,
      // Corto, porque la celda mide 30 mm: con el texto largo la pastilla tapaba
      // media cabecera.
      rotulo: cual === "casa" ? "Logo de la empresa" : "Logo del cliente",
    };
  }

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
  const puedeRecibir = Boolean(
    opciones.alSoltarImagen ||
      opciones.alSoltarArchivos ||
      opciones.alSoltarLogo ||
      opciones.alUsarComoLogo,
  );
  if (!puedeRecibir && !opciones.alQuitarImagen) return () => {};

  // La × de cada foto ya dibujada. Se agrega al DOM de la pantalla y no a la
  // plantilla: en el PDF no existe, y este documento se vuelve a armar entero cada
  // vez que se refresca la vista.
  if (opciones.alQuitarImagen) {
    // Las fotos del cuerpo y las rúbricas del cierre: las dos son imágenes puestas
    // en el documento y se sacan igual. La rúbrica lleva el atributo en la imagen
    // misma y el botón va en la caja que la envuelve, para que caiga en la esquina de
    // la firma y no en la del hueco, que es más grande.
    const conBoton: [HTMLElement, HTMLElement][] = [];
    for (const figura of doc.querySelectorAll<HTMLElement>("figure[data-imagen]")) {
      conBoton.push([figura, figura]);
    }
    for (const rubrica of doc.querySelectorAll<HTMLElement>("img.rubrica[data-imagen]")) {
      const caja = rubrica.closest<HTMLElement>(".rubrica-caja");
      if (caja) conBoton.push([rubrica, caja]);
    }

    for (const [imagen, donde] of conBoton) {
      const esFirma = donde !== imagen;
      const rotulo = esFirma ? "Sacar esta firma del documento" : "Sacar esta foto del documento";
      const boton = doc.createElement("button");
      boton.type = "button";
      boton.className = "quitar-foto";
      boton.title = rotulo;
      boton.setAttribute("aria-label", rotulo);
      boton.textContent = "\u00d7";
      boton.addEventListener("click", (evento) => {
        evento.preventDefault();
        opciones.alQuitarImagen?.(Number(imagen.dataset.imagen), esFirma);
      });
      donde.appendChild(boton);
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
    const blanco = blancoEn(evento.target);
    // Sobre una celda de logo mandan otros dos manejadores: es poner el logo, no
    // ubicar una imagen en el documento.
    const paraLogo = Boolean(blanco?.logo);
    return {
      traeFoto:
        tipos.includes(TIPO_ARRASTRE) &&
        Boolean(paraLogo ? opciones.alUsarComoLogo : opciones.alSoltarImagen),
      traeArchivos:
        tipos.includes("Files") && Boolean(paraLogo ? opciones.alSoltarLogo : opciones.alSoltarArchivos),
      blanco,
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
      if (!numero) return;
      if (blanco.logo) opciones.alUsarComoLogo?.(Number(numero), blanco.logo);
      else if (blanco.destino) opciones.alSoltarImagen?.(Number(numero), blanco.destino);
      return;
    }

    if (!traeArchivos) return;
    const archivos = [...(evento.dataTransfer?.files ?? [])];
    if (archivos.length === 0) return;
    evento.preventDefault();
    // Un logo es UNO: si sueltan tres archivos sobre la celda, entra el primero.
    if (blanco?.logo) opciones.alSoltarLogo?.(archivos[0], blanco.logo);
    else opciones.alSoltarArchivos?.(archivos, blanco?.destino ?? null);
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
