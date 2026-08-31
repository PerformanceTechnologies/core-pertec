import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extraerDeArchivo, extraerTextoDePdf, type ImagenExtraida } from "@/lib/cotizador/obra/extraer-texto";
import sharp from "sharp";
import { extraerImagenesDePdf } from "@/lib/cotizador/obra/extraer-imagenes-pdf";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import {
  NOMBRE_DE_TIPO,
  TIPOS_DE_DOCUMENTO,
  esOfertaTecnica,
  type LecturaDelTipo,
  type OfertaCanonica,
  type TipoDeDocumento,
} from "./tipos";
import {
  armarDocumentoLibre,
  armarOferta,
  type LecturaLetra,
  type LecturaLibre,
  type LecturaNumeros,
} from "./normalizar";

/**
 * De un borrador en Word, Excel o PDF a la estructura canónica.
 *
 * Es el Paso 1 del flujo, y el reparto de trabajo es el que hace confiable todo
 * el módulo: **el modelo transcribe, el servidor calcula**. El modelo lee el
 * borrador y devuelve lo que está escrito, sin sumar ni completar. Los totales
 * —dotación, horas, TOTAL NETO— y las verificaciones los pone ./verificar.ts, que
 * además comprueba que lo impreso cuadre.
 *
 * ── Por qué son DOS lecturas y no una ──────────────────────────────────────
 *
 * Un esquema de salida se compila a una gramática y la API la rechaza si se pasa
 * de grande. La estructura canónica completa —18 objetos anidados, 67
 * propiedades— no pasa: "The compiled grammar is too large". Antes de eso hubo
 * dos rechazos más, uno por tipos unión (tope 16, había 35) y otro por
 * propiedades opcionales, que obligan a la gramática a admitir todas sus
 * combinaciones.
 *
 * Así que la lectura se parte en dos por naturaleza del dato, no por tamaño:
 *
 *  - LA LETRA: lo que se transcribe y se imprime tal cual. Identificación,
 *    alcance, metodología, condiciones, aportes, cierre, anexo.
 *  - LOS NÚMEROS: los tres cuadros sobre los que el servidor calcula y verifica.
 *    Dotación, turnos y líneas de precio.
 *
 * Cada esquema es plano y chico. Van en paralelo: son dos lecturas
 * independientes del mismo documento, así que hacerlas en serie duplicaría el
 * tiempo sin motivo, y el tiempo es lo que corta la función. Armar la estructura
 * con las dos partes es trabajo de ./normalizar.ts.
 */

/**
 * Cuántos caracteres de texto por página hacen que un PDF valga la pena leer.
 *
 * Una página de oferta con datos tiene más de mil. Una escaneada —que es una
 * foto— devuelve casi cero, y ahí no hay nada que leer: hay que mirarla, así que
 * ese PDF sí va como documento aunque cueste diez veces más.
 */
const MINIMO_TEXTO_POR_PAGINA = 150;

function cliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Falta ANTHROPIC_API_KEY en las variables de entorno. " +
        "Cargala en Vercel → Settings → Environment Variables para habilitar la lectura de borradores.",
    );
  }
  return new Anthropic();
}

/**
 * TODO obligatorio, de un solo tipo y sin anidar más de lo necesario.
 *
 * Nada de nullables ni de opcionales: los dos hacen explotar la gramática. "El
 * documento no lo trae" se dice con un valor vacío —texto en blanco, número en 0,
 * lista vacía— y ./normalizar.ts lo traduce.
 */
const objeto = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const texto = { type: "string" } as const;
const listaDeTexto = { type: "array", items: { type: "string" } } as const;

const ESQUEMA_LETRA = objeto({
  titulo: { type: "string", description: "El título del servicio, tal como lo titula el documento." },
  numeroOferta: texto,
  fecha: texto,
  validez: texto,
  cliente: texto,
  atencion: texto,
  copia: texto,
  referencia: texto,
  faena: texto,
  alcanceIntroduccion: texto,
  alcanceActividades: listaDeTexto,
  alcanceTrabajosPrevios: listaDeTexto,
  metodologiaAntes: {
    ...listaDeTexto,
    description: "Actividades previas a la detención de planta, una por elemento.",
  },
  metodologiaDurante: listaDeTexto,
  especificaciones: {
    type: "array",
    description: "Las filas de la tabla de especificaciones técnicas y equipo.",
    items: objeto({ parametro: { type: "string" }, especificacion: { type: "string" } }),
  },
  condicionesComerciales: listaDeTexto,
  aportesPertec: { ...listaDeTexto, description: "Lo que aporta la empresa que ofrece." },
  aportesCliente: { ...listaDeTexto, description: "Lo que aporta el cliente o mandante." },
  cierreTexto: texto,
  firmantes: {
    type: "array",
    items: objeto({
      nombre: { type: "string" },
      cargo: { type: "string" },
      empresa: texto,
    }),
  },
  cierreCc: texto,
  anexoRespaldos: listaDeTexto,
  anexoMandantes: { ...listaDeTexto, description: "Nombres de mandantes y contratos ejecutados." },
  anexoNotaEquipo: texto,
  ubicacionImagenes: {
    type: "array",
    description:
      "Dónde va cada imagen del borrador: una entrada por imagen que se usa, con el número del " +
      "marcador y la sección donde ESTABA en el documento original. Lista vacía si no hay ninguna " +
      "o si todas son logos.",
    items: objeto({
      imagen: { type: "number", description: "El número del marcador [IMAGEN n]." },
      seccion: {
        type: "string",
        description:
          "Una de: alcance, metodologia, especificaciones, organizacion, programa, precio, " +
          "condiciones, aportes, cierre, anexo.",
      },
      epigrafe: {
        type: "string",
        description:
          "El pie de la imagen, si el borrador lo trae escrito al lado o adentro de ella: " +
          '"Maniobra de izaje de carrete con grúa", "Disposición de equipos correa CT-6". Una frase, ' +
          "sin numerarla. En blanco si no hay.",
      },
    }),
  },
  firmaImagen: {
    type: "number",
    description:
      "El número del marcador [IMAGEN n] que es la firma escaneada del firmante. 0 si no hay firma " +
      "escaneada en el borrador.",
  },
  porConfirmar: {
    ...listaDeTexto,
    description: "Datos ausentes o ambiguos, nombrados. Nunca adivinados.",
  },
  omitidas: {
    ...listaDeTexto,
    description:
      "Secciones que no aplican, una por elemento y con el motivo después de dos puntos: " +
      '"Especificaciones: el servicio es un traslado, no hay equipo vulcanizador".',
  },
});

const ESQUEMA_NUMEROS = objeto({
  personalEspecialista: {
    type: "array",
    description: "El cuadro de personal especialista del alcance, si el documento trae uno aparte.",
    items: objeto({ cargo: { type: "string" }, dotacion: { type: "number" } }),
  },
  cuadroPersonal: {
    type: "array",
    description: "El cuadro de personal del servicio: un elemento por cargo, con su dotación.",
    items: objeto({
      cargo: { type: "string" },
      dotacion: { type: "number", description: "Personas de ese cargo, tal como está en la columna." },
      regimen: texto,
    }),
  },
  responsabilidades: {
    type: "array",
    items: objeto({ cargo: { type: "string" }, descripcion: { type: "string" } }),
  },
  organizacionNota: texto,
  programaIntroduccion: texto,
  turnos: {
    type: "array",
    items: objeto({
      turno: { type: "string", description: 'El rótulo del turno: "T1", "Turno 1".' },
      jornada: { type: "string" },
      horas: { type: "number" },
    }),
  },
  programaNota: texto,
  lineasPrecio: {
    type: "array",
    items: objeto({
      cantidad: { type: "number" },
      cargo: { type: "string", description: "La descripción de la línea, completa." },
      unidad: { type: "string" },
      valorUnitario: { type: "number", description: "Sin puntos ni símbolo de moneda." },
      valorTotalImpreso: {
        type: "number",
        description:
          "El total de la línea TAL COMO ESTÁ IMPRESO. No lo calcules: si el documento no lo trae, 0. " +
          "Sirve para comprobar la multiplicación.",
      },
    }),
  },
  totalNetoImpreso: {
    type: "number",
    description: "El TOTAL NETO impreso al pie de la tabla. No lo sumes: si no está impreso, 0.",
  },
  precioNota: texto,
  porConfirmar: {
    ...listaDeTexto,
    description: "Cifras ausentes o ambiguas, nombradas. Nunca adivinadas.",
  },
});

/**
 * ¿Qué es este documento?
 *
 * Antes de leer hay que saber CON QUÉ ESQUEMA leer. El módulo asumía que todo borrador es
 * una oferta técnica, y con una ficha técnica el resultado era un documento mutilado
 * —sin precio ni dotación, porque no los tiene— más dos avisos falsos.
 *
 * Es una llamada corta y aparte, no un campo más en las otras dos, porque decide CUÁL de
 * las lecturas correr. Y sale barata: va con el mismo bloque de contenido, que ya está
 * marcado como cacheable, así que el borrador entero no se vuelve a pagar.
 *
 * `enum` no se usa —igual que en `ubicacionImagenes.seccion`— porque los tipos unión tienen
 * tope de 16 en la gramática: la lista va en la descripción y el servidor valida.
 */
const ESQUEMA_TIPO = objeto({
  tipo: {
    type: "string",
    description:
      "Qué es este documento, una de: oferta (una oferta o propuesta técnica y económica, " +
      "con alcance del servicio y precio), ficha_tecnica (las características de un equipo, " +
      "un producto o un material: parámetros, medidas, condiciones de uso), procedimiento " +
      "(cómo se ejecuta un trabajo, paso por paso, con sus resguardos), informe (el reporte " +
      "de algo que YA pasó: una inspección, un avance, un incidente), otro (cualquier otra cosa).",
  },
  confianza: {
    type: "string",
    description: 'Qué tan claro está: "alta", "media" o "baja".',
  },
  porQue: {
    type: "string",
    description:
      "En una línea, qué del documento lo delata: el título, una sección, una tabla. Se le " +
      "muestra a la persona que revisa, así que tiene que decir algo verificable mirando el " +
      'archivo — no "parece una ficha técnica".',
  },
});

/**
 * El documento tal como está, sin estructura canónica.
 *
 * Un solo tipo de objeto por bloque con un campo discriminador, y no cinco tipos distintos,
 * porque la gramática no admite uniones grandes ni propiedades opcionales (ver arriba). Lo
 * que no aplica va vacío: texto en blanco, listas vacías, imagen en 0.
 *
 * EL ORDEN DEL ARREGLO ES EL ORDEN DEL DOCUMENTO, y eso es lo que hace que las imágenes
 * queden donde estaban: un bloque de imagen entre dos de texto conserva la posición que la
 * lectura de oferta descarta (ahí solo se guarda la sección).
 */
const ESQUEMA_LIBRE = objeto({
  titulo: { type: "string", description: "El título del documento, tal como lo titula." },
  subtitulo: {
    type: "string",
    description: "El subtítulo o la línea de identificación bajo el título, si la trae. En blanco si no.",
  },
  cliente: { type: "string", description: "A quién va dirigido, si el documento lo dice. En blanco si no." },
  fecha: { type: "string", description: "La fecha del documento, tal como está escrita. En blanco si no." },
  codigo: {
    type: "string",
    description:
      "El código o número del documento, si lo trae: un código de ficha, de procedimiento o de " +
      "informe. En blanco si no.",
  },
  bloques: {
    type: "array",
    description: "El documento entero, en orden, bloque por bloque.",
    items: objeto({
      tipo: {
        type: "string",
        description:
          'Qué es este bloque, uno de: "titulo" (un título de sección del documento), ' +
          '"subtitulo" (un título de segundo nivel), "parrafos" (uno o varios párrafos o una ' +
          'lista de ítems), "tabla" (una tabla con sus columnas y sus filas), "imagen" (una de ' +
          "las imágenes del borrador, en el lugar donde estaba).",
      },
      texto: {
        type: "string",
        description: 'El título, cuando el tipo es "titulo" o "subtitulo". En blanco en los demás.',
      },
      parrafos: {
        ...listaDeTexto,
        description:
          'Los párrafos o los ítems, uno por elemento, cuando el tipo es "parrafos". Sin numerarlos: ' +
          "la numeración la pone el sistema. Lista vacía en los demás.",
      },
      columnas: {
        ...listaDeTexto,
        description:
          'Los encabezados de la tabla, cuando el tipo es "tabla". Si la tabla no tiene encabezados, ' +
          "lista vacía.",
      },
      filas: {
        type: "array",
        description:
          'Las filas de la tabla, cuando el tipo es "tabla": una lista por fila, con una celda por ' +
          "columna y en el mismo orden. Lista vacía en los demás.",
        items: listaDeTexto,
      },
      imagen: {
        type: "number",
        description: 'El número del marcador [IMAGEN n], cuando el tipo es "imagen". 0 en los demás.',
      },
      epigrafe: {
        type: "string",
        description:
          "El pie de la imagen, si el documento lo trae escrito. Sin numerarlo. En blanco si no hay.",
      },
    }),
  },
  porConfirmar: {
    ...listaDeTexto,
    description: "Datos ausentes o ambiguos, nombrados. Nunca adivinados.",
  },
});

/** Lo común a las dos lecturas: quién es PERTEC y la regla que las gobierna. */
const PREAMBULO = `Normalizás documentos de Performance Technologies SpA (PERTEC), que presta servicios
de vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

Tu tarea NO es diseñar ni redactar de nuevo: es extraer el contenido del borrador para que el servidor
lo maquete y lo verifique después.

REGLA PRINCIPAL: transcribís, no calculás.

TODAS las claves del esquema van siempre. Lo que el borrador no trae se dice con un valor vacío —texto
en blanco, número en 0, lista vacía— y se nombra en "porConfirmar". Nunca lo adivines ni pongas un
guion o un "N/A" como si fuera el dato.

QUÉ VA EN "porConfirmar". Solo lo que una PERSONA tiene que decidir o corregir antes de emitir: un
precio en blanco, un monto en 0 que parece pendiente, una fecha o un nombre ambiguos, dos partes del
documento que dicen cosas distintas. NO describas la forma del documento —"no trae cuadro de
responsabilidades", "no hay tabla de turnos"—: una sección que no está, el sistema simplemente no la
imprime, y llenar la lista con eso hace que nadie la lea.`;

const INSTRUCCIONES_LETRA = `${PREAMBULO}

Esta lectura es LA LETRA de la oferta: lo que se transcribe y se imprime tal cual. Los cuadros con
cifras —dotación, turnos, precios— los lee otra pasada; no los transcribas acá.

- Fidelidad literal en nombres, fechas, referencias y faena. No redondees, no resumas, no completes.
- Podés corregir ortografía y mejorar la redacción de los párrafos narrativos, sin cambiar el
  significado técnico ni comercial. En nombres propios y en cifras, no.
- Las listas van con un elemento por ítem del documento, sin numerarlos: la numeración la pone el
  sistema.
- LAS IMÁGENES DEL BORRADOR. El texto trae marcadores "[IMAGEN 1]", "[IMAGEN 2]"… donde estaba cada
  imagen. Cada una va en "ubicacionImagenes" con LA SECCIÓN DONDE ESTABA, no todas juntas al final:
  un borrador pone el diagrama de disposición de equipos en medio de la metodología y las fotos de
  faena en el anexo, y así tienen que salir. Mirá qué texto rodea al marcador y elegí esa sección.
    · Si al lado o adentro de la imagen hay un pie escrito, transcribilo en "epigrafe" tal cual, sin
      numerarlo: la numeración la pone el sistema.
    · Un diagrama entre dos pasos del trabajo → "metodologia".
    · Fotos después de un párrafo del tipo "Fotografías de referencia incluidas" o del respaldo de la
      empresa → "anexo".
    · Una tabla o un esquema de equipo → "especificaciones".
    · Una firma escaneada —la rúbrica a mano junto al nombre del firmante— NO va acá: va en
      "firmaImagen".
    · El LOGO o el membrete de la empresa no van en ninguna sección: el sistema pone el logo por su
      cuenta. Omitilos. Se reconocen por ser anchos y bajos (proporción mayor a 2.5:1), por repetirse,
      o por estar en la primera página antes del título.
  ANTE LA DUDA, LA IMAGEN VA, y si no está claro en qué sección estaba, va en "anexo". Omitir una foto
  por no estar seguro deja el documento sin ella; la persona que revisa ve todas las imágenes con su
  miniatura y puede moverlas de sección o sacarlas.
- LAS LISTAS DE METODOLOGÍA LLEVAN SOLO PASOS. Una frase que dice cuánto dura el trabajo ("realizar la
  actividad en 48 horas, 2 días") o en cuántos turnos se ejecuta ("4 turnos de 12 horas en turnos día y
  noche") NO es un paso de la secuencia: es el programa, y lo transcribe la otra lectura a partir de esa
  misma frase. No la agregues al final de "durante la detención" — quedaría dos veces en el documento,
  una como paso y otra como programa.
- LAS ESPECIFICACIONES CASI NUNCA VIENEN EN TABLA. Suelen estar en un párrafo técnico y hay que
  separarlas en parámetro y valor. Ejemplo real: "La cinta es del tipo EP800/4, de 63\" de ancho. El
  equipo vulcanizador a utilizar constará de tres pares de platos rectangulares 33\" x 78\" y 13 pares
  de rieles de 92 a 96\"" son tres filas — Cinta / EP800/4, 63\" de ancho · Platos / 3 pares
  rectangulares de 33\" x 78\" · Rieles / 13 pares de 92 a 96\". Está escrito, solo que en prosa.
- SECCIONES QUE NO APLICAN: el maestro trae todas las secciones posibles y cada oferta usa las que le
  corresponden — un traslado de rollos no tiene especificaciones de equipo vulcanizador y un cambio de
  correa sí. Si una sección no aplica, dejá sus campos vacíos y nombrala en "omitidas" con el motivo.
  No la llenes con texto de relleno.
- No busques inconsistencias ni sumas que no cuadren: eso lo hace el servidor con aritmética.`;

const INSTRUCCIONES_NUMEROS = `${PREAMBULO}

Esta lectura son LOS NÚMEROS de la oferta: los cuadros de dotación, el programa de turnos y la tabla
de precios. La parte narrativa la lee otra pasada; no la transcribas acá.

- NO calcules ningún total. Ni la dotación total, ni las horas del programa, ni el TOTAL NETO, ni el
  total de una línea de precio. Esos los calcula el sistema, y de paso comprueba que coincidan con lo
  impreso. Si el documento IMPRIME un total, transcribilo en el campo que dice "impreso" —sirve de
  control—; si no lo imprime, poné 0.
- Una fila por cargo y una fila por turno. Si un cargo aparece con dotación 3, va una sola fila con
  dotación 3, no tres filas.
- LOS CUADROS MUCHAS VECES NO SON TABLAS. Un borrador escribe la cuadrilla y el programa en el texto,
  y hay que armar las filas con lo que dice. Dos ejemplos reales:
    · "Cambio y empalme CT-6, con cuadrilla día y noche, la que está conformada por: 2 Supervisores /
      2 APR / 4 M1 vulcanizador / 4 M2 vulcanizador / 6 Ayudantes vulcanizadores" son CINCO filas de
      cuadroPersonal, con su dotación y con régimen "Día y noche".
    · "para ser ejecutado en 4 turnos de 12 horas (2 días efectivos) en turnos día y noche" son CUATRO
      filas de turnos de 12 horas cada una: T1 y T3 de día, T2 y T4 de noche.
  Eso no es inventar: está escrito, solo que en un párrafo. Lo que no se puede hacer es sumar —ni las
  personas, ni las horas, ni los totales—; eso lo hace el sistema con las filas que transcribas.
- LA CANTIDAD DE UNA LÍNEA DE PRECIO. Si la tabla no trae columna de cantidad —pasa seguido, la
  cabecera es "Ítem | Cargo | Unidad | Precio"— la cantidad de cada línea es 1: el total de la línea es
  su precio. No pongas 0, porque 0 haría que el sistema calcule un total de cero pesos para una oferta
  de cien millones.
- SI EL BORRADOR VINO DE UN PDF, las tablas llegan aplastadas: la cabecera aparece como una sola
  palabra ("ÍTCANTCARGOUNV. UNITV. TOTAL") y los valores de cada fila vienen seguidos, en el mismo
  orden que esa cabecera. Reconstruí las columnas por el orden y por lo que es cada dato: un monto con
  "$" es un precio, "Global" o "Día" es la unidad. Si una celda estaba vacía en el documento, en el
  texto simplemente no aparece nada entre dos valores — no corras los datos de columna para llenarla.
- Los montos van sin puntos, sin espacios y sin símbolo de moneda: 15885200. Un precio en blanco va en
  0 y se nombra en "porConfirmar"; un precio impreso como "$ 0.-" también va en 0, y ahí decilo:
  probablemente está pendiente de confirmar.
- Si el borrador de verdad no trae precios ni programa en ninguna parte —ni en tabla ni en el texto—
  dejá esas listas vacías.`;

const INSTRUCCIONES_TIPO = `${PREAMBULO}

Tu única tarea acá es DECIR QUÉ ES este documento, para que el sistema lo lea con el esquema que
corresponde. No transcribas nada.

- Miralo completo antes de decidir. El título manda, pero una "oferta" sin precio ni alcance del
  servicio probablemente no sea una oferta, y una tabla de parámetros y medidas es una ficha técnica
  aunque el archivo se llame "propuesta".
- Una OFERTA tiene lo que se va a hacer y cuánto cuesta: alcance del servicio, dotación, plazos,
  precio. Es el caso más común acá.
- Una FICHA TÉCNICA describe una cosa —un equipo, un material, un repuesto— con sus parámetros.
- Un PROCEDIMIENTO dice cómo se ejecuta un trabajo, paso por paso, con sus resguardos.
- Un INFORME reporta algo que ya pasó: una inspección, un avance, un incidente.
- Si dudás entre dos, elegí el que explique MÁS del documento y decilo en "confianza": con "baja",
  la persona que revisa lo ve y lo puede cambiar. Preferí "otro" antes que forzar un tipo.`;

const INSTRUCCIONES_LIBRE = `${PREAMBULO}

Este documento NO es una oferta técnica, así que no tiene una estructura fija que llenar: tu tarea es
transcribirlo TAL COMO ESTÁ para que el sistema lo maquete con el formato de la casa.

- RESPETÁ EL ORDEN Y LA JERARQUÍA del original. El arreglo de bloques se imprime en ese orden, así que
  un bloque fuera de lugar sale fuera de lugar.
- No inventes secciones que el documento no tiene, y no le pongas las de una oferta —alcance, precio,
  dotación— si no están. Tampoco resumas ni reordenes para que "quede mejor".
- Podés corregir ortografía y redacción de los párrafos, sin cambiar el significado técnico. En
  nombres propios, códigos, medidas y cifras, no se toca nada.
- LAS LISTAS van con un elemento por ítem, sin numerarlos ni ponerles viñeta: la numeración la pone el
  sistema.
- LAS TABLAS van como tabla: los encabezados en "columnas" y una lista por fila en "filas", con una
  celda por columna y en el mismo orden. Si una celda del documento está vacía, va un texto en blanco
  —no corras los datos de columna para llenarla—. Todo como texto, incluidos los números: acá el
  sistema no calcula nada.
- LAS IMÁGENES son un bloque más, EN EL LUGAR DONDE ESTABAN. El texto trae marcadores "[IMAGEN 1]",
  "[IMAGEN 2]"… Cada marcador es un bloque de tipo "imagen" con ese número, puesto entre los bloques de
  texto que lo rodean: es lo que hace que el diagrama salga junto al párrafo que lo explica y no al
  final. Si el borrador trae un pie escrito al lado, transcribilo en "epigrafe".
    · El LOGO o el membrete de la empresa NO son un bloque: el sistema pone el logo por su cuenta.
      Omitilos. Se reconocen por ser anchos y bajos (proporción mayor a 2.5:1), por repetirse, o por
      estar en la primera página antes del título.
    · ANTE LA DUDA, LA IMAGEN VA. Omitirla deja el documento sin ella; ponerla donde no corresponde se
      arregla arrastrándola, y la persona que revisa ve todas las imágenes con su miniatura.
- El TÍTULO del documento va en "titulo", no como primer bloque: el sistema lo imprime en la portada.
- No busques inconsistencias ni sumes nada: acá no hay totales que verificar.`;

/**
 * Una de las dos lecturas. Misma mecánica, distinto esquema y distinta consigna.
 *
 * El tope de salida hay que pensarlo contando el pensamiento extendido: cuenta
 * contra `max_tokens` igual que el JSON. Con una oferta larga —dos listas de
 * aportes de veinte ítems, especificaciones sacadas de la prosa— los 12.000 que
 * había se agotaban pensando y la respuesta salía cortada a la mitad, sin JSON
 * válido. Tampoco conviene poner un número enorme: a la velocidad de salida del
 * modelo, 30.000 tokens no entran en el tiempo de la función.
 */
/**
 * El inventario de imágenes, para que el modelo pueda distinguirlas.
 *
 * El marcador solo dice DÓNDE estaba una imagen. Sin las medidas, decidir si es
 * una foto, un diagrama o un logo es adivinar — y pasó: el modelo omitió una
 * imagen de 1162×667 px "por no poder determinar con certeza" qué era, y el anexo
 * salió vacío. Las proporciones lo resuelven casi solas: un membrete es ancho y
 * bajo, una foto de faena es grande y de proporción de cámara.
 */
async function inventarioDeImagenes(imagenes: ImagenExtraida[]): Promise<string> {
  if (imagenes.length === 0) return "";

  const lineas = await Promise.all(
    imagenes.map(async (imagen) => {
      let medidas = "medidas desconocidas";
      try {
        const info = await sharp(imagen.contenido).metadata();
        if (info.width && info.height) {
          medidas = `${info.width}×${info.height} px (proporción ${(info.width / info.height).toFixed(2)}:1)`;
        }
      } catch {
        // Una imagen que sharp no abre igual va listada: el modelo la ubica por su
        // posición y el servidor la descarta al guardar.
      }
      const donde = imagen.pagina ? `, página ${imagen.pagina}` : "";
      return `[IMAGEN ${imagen.indice}]: ${medidas}${donde}`;
    }),
  );

  return `\n\nLAS IMÁGENES QUE TRAE EL BORRADOR:\n${lineas.join("\n")}\n`;
}

async function leerParte<T>(
  contenido: Anthropic.ContentBlockParam[],
  instrucciones: string,
  esquema: Record<string, unknown>,
  pedido: string,
  maxTokens: number,
  nombreArchivo: string,
  // "high" para transcribir, que es donde se equivoca caro. La clasificación es una
  // decisión de una línea y con "medium" contesta en un cuarto del tiempo.
  effort: "medium" | "high" = "high",
): Promise<T> {
  // Streaming: el SDK se niega a hacer sin streaming una llamada cuya duración
  // posible pase de 10 minutos, y además una conexión que espera callada varios
  // minutos es justo la que corta un intermediario. finalMessage() rearma la
  // respuesta completa, así que no hay que atender evento por evento.
  const respuesta = await cliente()
    .messages.stream({
      model: "claude-sonnet-5",
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: instrucciones, cache_control: { type: "ephemeral" } }],
      output_config: { effort, format: { type: "json_schema", schema: esquema } },
      messages: [{ role: "user", content: [...contenido, { type: "text", text: pedido }] }],
    })
    .finalMessage();

  if (respuesta.stop_reason === "refusal") {
    throw new Error(`El modelo no pudo procesar "${nombreArchivo}".`);
  }
  if (respuesta.stop_reason === "max_tokens") {
    // El mensaje anterior decía "se agotó el presupuesto de tokens", que se lee
    // como que la cuenta se quedó sin saldo. No es eso: es el tope de largo de
    // ESTA respuesta, que está unas líneas más arriba en este archivo.
    throw new Error(
      `La lectura de "${nombreArchivo}" quedó incompleta: la respuesta llegó a su tope de largo. ` +
        "No tiene que ver con el saldo de la cuenta. Si tenés el borrador en Word, subí el .docx en " +
        "vez del PDF: se lee como texto y ocupa una fracción.",
    );
  }

  const salida = respuesta.content.find((b) => b.type === "text");
  if (!salida || salida.type !== "text") {
    throw new Error(`La lectura de "${nombreArchivo}" no devolvió datos.`);
  }
  return JSON.parse(salida.text) as T;
}

/**
 * Lo que sale de leer un borrador: la oferta y las imágenes que traía.
 *
 * Las imágenes vienen aparte del contenido porque son cosas distintas: el
 * contenido dice qué imagen va dónde (por número) y esta lista trae los bytes,
 * que el servidor guarda y el contenido nunca ve.
 */
export interface BorradorLeido {
  contenido: OfertaCanonica;
  imagenes: ImagenExtraida[];
  /** Con qué esquema se leyó. Manda: decide qué controles corren. */
  tipo: TipoDeDocumento;
}

/** El tipo que dijo el modelo, saneado contra la lista real. */
function tipoLeido(bruto: unknown): LecturaDelTipo {
  const crudo = bruto as { tipo?: unknown; confianza?: unknown; porQue?: unknown } | null;
  const dicho = typeof crudo?.tipo === "string" ? crudo.tipo.trim().toLowerCase() : "";
  // "oferta_tecnica" es como se le pide al modelo (es más claro en el prompt) y "oferta" es
  // como se guarda: son la misma cosa.
  const normalizado = dicho === "oferta_tecnica" ? "oferta" : dicho;
  const tipo = TIPOS_DE_DOCUMENTO.find((t) => t === normalizado);
  const confianza =
    crudo?.confianza === "baja" || crudo?.confianza === "media"
      ? (crudo.confianza as "baja" | "media")
      : "alta";

  return {
    // Un tipo que no está en la lista se trata como "otro" y NO como oferta: forzar el
    // esquema de oferta sobre algo que no lo es es justo el error que esto viene a arreglar.
    tipo: tipo ?? "otro",
    // Si no se reconoció lo que dijo, la confianza no puede ser alta.
    confianza: tipo ? confianza : "baja",
    porQue: typeof crudo?.porQue === "string" ? crudo.porQue.trim() : "",
  };
}

export async function leerBorrador(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<BorradorLeido> {
  const formato = formatoDe(mimeType, nombreArchivo);
  if (!formato) {
    throw new Error(
      `"${nombreArchivo}" no es un formato que se pueda leer. Se aceptan Word (.docx), ` +
        "PDF y Excel (.xlsx, .xlsm).",
    );
  }

  // Un PDF se lee como TEXTO, no como documento. Mandarlo como documento hace que
  // la API procese una imagen por página —el 85% de los tokens en páginas sin un
  // solo dato: portada, índice, anexo de fotos— y esa entrada enorme era la que
  // dejaba al modelo sin techo de salida, con la lectura cortada a la mitad. La
  // misma oferta como texto son ~1.500 tokens en vez de ~20.000.
  //
  // Con una excepción: un PDF escaneado no tiene texto que extraer. Ahí sí va como
  // documento, porque hay que mirarlo.
  //
  // Word y Excel nunca fueron documento: la API no los acepta como tal, y no
  // tienen páginas que rasterizar.
  let contenido: Anthropic.ContentBlockParam[];
  // Un PDF no entrega sus imágenes: pdf-parse extrae texto, no ilustraciones. Las
  // fotos de un borrador se recuperan del .docx, que es donde de verdad están.
  let imagenes: ImagenExtraida[] = [];

  if (formato === "pdf") {
    const { texto, paginas, porPagina } = await extraerTextoDePdf(archivo);
    const porPaginaTexto = texto.length / Math.max(1, paginas);

    if (porPaginaTexto >= MINIMO_TEXTO_POR_PAGINA) {
      // Las imágenes de un PDF se sacan del archivo y no del texto, así que de
      // ellas se sabe la PÁGINA y no el punto del párrafo. El marcador va al final
      // del texto de su página, que ubica bien lo que hay que ubicar: las fotos
      // del anexo están en las páginas del anexo y el membrete en la primera.
      imagenes = await extraerImagenesDePdf(archivo);

      const conMarcadores = porPagina
        .map((textoDePagina, i) => {
          const marcadores = imagenes
            .filter((imagen) => imagen.pagina === i + 1)
            .map((imagen) => `[IMAGEN ${imagen.indice}]`)
            .join(" ");
          return `── Página ${i + 1} ──\n${textoDePagina}${marcadores ? `\n${marcadores}` : ""}`;
        })
        .join("\n\n");

      contenido = [
        {
          type: "text",
          text:
            `Contenido del borrador, extraído de un PDF de ${paginas} página(s). DOS COSAS:\n` +
            `1) En un PDF el texto sale sin la disposición de la página, así que las columnas de una ` +
            `tabla vienen pegadas en la cabecera —por ejemplo "ÍTCANTCARGOUNV. UNITV. TOTAL"— y los ` +
            `valores de cada fila siguen en ESE mismo orden. Es una tabla, leela como tabla.\n` +
            (imagenes.length
              ? `2) El PDF trae ${imagenes.length} imagen(es). Cada marcador [IMAGEN n] está al final ` +
                `del texto de la página donde se dibuja esa imagen — no en el punto exacto del ` +
                `párrafo, que en un PDF no se puede saber.\n`
              : "2) El PDF no trae imágenes.\n") +
            (await inventarioDeImagenes(imagenes)) +
            `\n${conMarcadores}`,
          cache_control: { type: "ephemeral" },
        },
      ];
    } else {
      contenido = [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") },
          cache_control: { type: "ephemeral" },
        },
      ];
    }
  } else {
    const leido = await extraerDeArchivo(archivo, formato, nombreArchivo);
    imagenes = leido.imagenes;
    contenido = [
      {
        type: "text",
        text:
          `Contenido del borrador, extraído de un ${
            formato === "excel" ? "archivo de Excel" : "documento de Word"
          }` +
          (imagenes.length
            ? `. Trae ${imagenes.length} imagen(es), marcadas como [IMAGEN n] en el lugar exacto ` +
              `donde estaban`
            : "") +
          `:` +
          (await inventarioDeImagenes(imagenes)) +
          `\n\n${leido.texto}`,
        cache_control: { type: "ephemeral" },
      },
    ];
  }

  // PRIMERO QUÉ ES, después cómo se lee. Es una llamada más, pero es la que evita el
  // error caro: leer una ficha técnica con el esquema de una oferta produce un documento
  // mutilado y dos avisos falsos. Sale barata porque el bloque del borrador ya viene
  // marcado como cacheable y las lecturas de abajo lo reusan.
  const lectura = tipoLeido(
    await leerParte<unknown>(
      contenido,
      INSTRUCCIONES_TIPO,
      ESQUEMA_TIPO,
      `¿Qué es este documento? (archivo: ${nombreArchivo})`,
      2000,
      nombreArchivo,
      "medium",
    ),
  );

  if (!esOfertaTecnica(lectura.tipo)) {
    // El camino libre: una sola lectura, porque no hay cuadros que el servidor calcule.
    const libre = await leerParte<LecturaLibre>(
      contenido,
      INSTRUCCIONES_LIBRE,
      ESQUEMA_LIBRE,
      `Transcribí este documento tal como está (archivo: ${nombreArchivo}).`,
      20000,
      nombreArchivo,
    );
    const armado = armarDocumentoLibre(libre, lectura.tipo);
    return {
      contenido: {
        ...armado,
        lectura,
        // Con la clasificación dudosa, el aviso va a "Por revisar": es una decisión que
        // tomó el sistema sobre la forma del documento entero, y tiene que poder
        // corregirse antes de emitir.
        porConfirmar:
          lectura.confianza === "alta"
            ? armado.porConfirmar
            : [
                `Se leyó como ${NOMBRE_DE_TIPO[lectura.tipo].toLowerCase()} con confianza ` +
                  `${lectura.confianza}${lectura.porQue ? `: ${lectura.porQue}` : ""}. Si es otra cosa, ` +
                  "cambiá el tipo del documento.",
                ...armado.porConfirmar,
              ],
      },
      imagenes,
      tipo: lectura.tipo,
    };
  }

  // En paralelo: son dos lecturas independientes del mismo documento y el tiempo
  // total de la función es lo que limita. En serie tardaría el doble sin ganar
  // nada — la segunda no necesita ver el resultado de la primera.
  const [letra, numeros] = await Promise.all([
    leerParte<LecturaLetra>(
      contenido,
      INSTRUCCIONES_LETRA,
      ESQUEMA_LETRA,
      `Transcribí la letra de este borrador (archivo: ${nombreArchivo}).`,
      20000,
      nombreArchivo,
    ),
    leerParte<LecturaNumeros>(
      contenido,
      INSTRUCCIONES_NUMEROS,
      ESQUEMA_NUMEROS,
      `Transcribí los cuadros con cifras de este borrador (archivo: ${nombreArchivo}).`,
      14000,
      nombreArchivo,
    ),
  ]);

  const armada = armarOferta(letra, numeros);
  return { contenido: { ...armada, lectura }, imagenes, tipo: "oferta" };
}
