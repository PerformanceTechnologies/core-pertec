import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { extraerTexto, extraerTextoDePdf } from "@/lib/cotizador/obra/extraer-texto";
import { formatoDe } from "@/lib/cotizador/obra/formatos";
import type { OfertaCanonica } from "./tipos";
import { armarOferta, type LecturaLetra, type LecturaNumeros } from "./normalizar";

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

/** Lo común a las dos lecturas: quién es PERTEC y la regla que las gobierna. */
const PREAMBULO = `Normalizás borradores de ofertas técnicas de Performance Technologies SpA (PERTEC),
que presta servicios de vulcanización y cambio de correas transportadoras en faenas mineras y plantas.

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
async function leerParte<T>(
  contenido: Anthropic.ContentBlockParam[],
  instrucciones: string,
  esquema: Record<string, unknown>,
  pedido: string,
  maxTokens: number,
  nombreArchivo: string,
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
      output_config: { effort: "high", format: { type: "json_schema", schema: esquema } },
      messages: [{ role: "user", content: [...contenido, { type: "text", text: pedido }] }],
    })
    .finalMessage();

  if (respuesta.stop_reason === "refusal") {
    throw new Error(
      `El modelo no pudo procesar "${nombreArchivo}". Revisá que el archivo sea la oferta y no otro ` +
        "documento.",
    );
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

export async function leerBorrador(
  archivo: Buffer,
  mimeType: string,
  nombreArchivo: string,
): Promise<OfertaCanonica> {
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

  if (formato === "pdf") {
    const { texto, paginas } = await extraerTextoDePdf(archivo);
    const porPagina = paginas > 0 ? texto.length / paginas : 0;

    contenido =
      porPagina >= MINIMO_TEXTO_POR_PAGINA
        ? [
            {
              type: "text",
              text:
                `Contenido del borrador, extraído de un PDF de ${paginas} página(s). OJO: en un PDF ` +
                `el texto sale sin la disposición de la página, así que las columnas de una tabla ` +
                `vienen pegadas en la cabecera —por ejemplo "ÍTCANTCARGOUNV. UNITV. TOTAL"— y los ` +
                `valores de cada fila siguen en ESE mismo orden. Es una tabla, leela como tabla.\n\n` +
                texto,
              cache_control: { type: "ephemeral" },
            },
          ]
        : [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: archivo.toString("base64") },
              cache_control: { type: "ephemeral" },
            },
          ];
  } else {
    contenido = [
      {
        type: "text",
        text: `Contenido del borrador, extraído de un ${
          formato === "excel" ? "archivo de Excel" : "documento de Word"
        }:\n\n${await extraerTexto(archivo, formato, nombreArchivo)}`,
        cache_control: { type: "ephemeral" },
      },
    ];
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

  return armarOferta(letra, numeros);
}
