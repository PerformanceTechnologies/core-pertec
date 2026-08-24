import type { EmpresaIdentidad } from "@/lib/cotizador/empresas";
import { firmaDe, type OfertaCanonica, type SeccionConImagenes, type TotalesOferta } from "./tipos";
import { ESTILO_PERTEC, type EstiloMaestro } from "./estilo";
import { SIN_LOGOS, imagenSegura, logoSeguro, type ImagenDibujable, type LogosDocumento } from "./logo";

/**
 * El maestro del formato de ofertas técnicas, como código.
 *
 * Acá está el cambio de fondo respecto de duplicar un archivo y reemplazarle el
 * contenido a mano: el diseño vive en el CSS de este archivo, así que **no puede
 * derivar entre ofertas**. La paleta, las tipografías, el header de tres celdas,
 * el footer, el estilo de las tablas y el numeral de color de los hitos son los
 * mismos en la oferta número 1 y en la número 200, porque son los mismos treinta
 * y tantos selectores.
 *
 * Y hay un pedido que se cumple solo por construcción: "si una sección no aplica,
 * elimínala y renumera todo de forma correlativa, actualizando el índice y las
 * referencias cruzadas". La numeración no se transcribe: se genera contando las
 * secciones presentes (ver `armarSecciones`). No es que salga bien — es que no
 * hay forma de que salga mal.
 *
 * Todo lo que se interpola pasa por `esc()`. Un borrador es texto que escribió
 * otra persona: si trae un "<" sin escapar, rompe el documento o inyecta marcado.
 */

/** Una sección ya numerada, lista para el índice y para el cuerpo. */
interface SeccionArmada {
  /** "1", "2"… o "A" para el anexo. */ numero: string;
  titulo: string;
  cuerpo: string;
  /**
   * No partir esta sección entre dos páginas.
   *
   * Salió impreso: "8 CIERRE Y FIRMA" quedó al final de una página con una línea
   * de texto y media página en blanco debajo, y el bloque de firmas apareció
   * arriba de la siguiente, sin título — un nombre suelto abriendo una hoja. Pasa
   * porque el bloque de firmas no se puede partir y, si no cabe, se va entero.
   * Marcando la sección, se va entera: eso se lee como "la sección empieza en
   * página nueva", que en un documento es normal, en vez de como un descuadre.
   *
   * Solo para secciones cortas por naturaleza. En una larga forzaría un salto y
   * dejaría el hueco que se quiere evitar.
   */
  junto?: boolean;
  /** Qué sección es, para saber qué imágenes le tocan y cuáles quedaron sin lugar. */
  clave?: SeccionConImagenes;
}

/**
 * Un monto tal como se lee en el papel.
 *
 * Se exporta porque el editor sobre el documento recalcula las celdas de total
 * mientras se escribe, y tiene que escribirlas con este formato exacto: si armara
 * el suyo, el número cambiaría de aspecto al tipear y volvería al original recién
 * al guardar.
 */
export const clp = (n: number) => "$ " + Math.round(n).toLocaleString("es-CL") + ".-";

/**
 * La identidad de la empresa, omitiendo lo que no esté cargado.
 *
 * Salió impreso: una oferta emitida con la identidad a medio cargar mostraba en el
 * encabezado la palabra "RUT" sola, sin número, y la razón social en blanco. El
 * tipo EmpresaIdentidad lo dice desde el principio —"quien renderiza debe omitir
 * lo que esté en blanco, nunca inventarlo"— y esta plantilla no lo cumplía.
 */
const razonDe = (e: EmpresaIdentidad) => e.razonSocial.trim();
const rutDe = (e: EmpresaIdentidad) => (e.rut.trim() ? `RUT ${e.rut.trim()}` : "");

/** "RUT 77.889.868-3 · Martínez de Rozas N° 4467, Santiago", saltando lo que falte. */
function identidadDeFirma(e: EmpresaIdentidad): string {
  const lugar = [e.direccion.trim(), e.ciudad.trim()].filter(Boolean).join(", ");
  return [rutDe(e), lugar].filter(Boolean).join(" · ");
}

/**
 * La referencia del pie, sin repetir el número de oferta.
 *
 * El título que trae un borrador suele llevar el número adentro ("OFERTA TÉCNICA
 * ECONÓMICA OS 009 2026 - SERVICIO DE REEMPLAZO…"). Anteponerlo otra vez daba un
 * pie que ocupaba línea y media y aplastaba la dirección y la paginación.
 */
export function referenciaDePie(numero: string | null, cliente: string | null, titulo: string): string {
  // Número y cliente, no el título. La propuesta hecha a mano pone
  // "OS 009 – 2026 · CT-6 · Axinntus Serv. Ind.": corto y suficiente para saber de
  // qué documento es esta hoja. El título completo ocupaba línea y media y había
  // que recortarlo con puntos suspensivos, que es peor que no ponerlo.
  const partes = [numero?.trim(), cliente?.trim()].filter(Boolean);
  return partes.length ? partes.join(" · ") : titulo.trim();
}

/** Escapa todo lo que viene del borrador. */
function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Filas de una tabla simple etiqueta/valor, salteando las vacías.
 *
 * Cada valor lleva `data-campo` con la ruta del dato dentro de la oferta. Eso es lo
 * que permite editar SOBRE el documento sin perder la estructura: lo que se toca en
 * pantalla sigue siendo ese campo y no un pedazo de HTML suelto. En el PDF los
 * atributos no se ven; en el editor son el puente entre el papel y el dato.
 */
function filasEtiqueta(pares: [string, string | null, string?][]): string {
  return (
    pares
      // `!= null` cubre también el ausente: el modelo omite lo que el documento no
      // trae, y con la comparación estricta una clave que falta imprimía la palabra
      // "undefined" en la tabla de identificación.
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v, ruta]) => `<tr><th class="etiqueta">${esc(k)}</th><td${campo(ruta)}>${esc(v)}</td></tr>`)
      .join("")
  );
}

/** El atributo que ata un texto del documento a su campo, o nada. */
function campo(ruta?: string, tipo?: "numero"): string {
  if (!ruta) return "";
  return ` data-campo="${ruta}"${tipo ? ` data-tipo="${tipo}"` : ""}`;
}

/**
 * Filtra filas sin perder el índice real.
 *
 * Las filas vacías no se imprimen —eso ya era así—, pero desde que cada celda lleva
 * su `data-campo` el índice tiene que seguir siendo la posición dentro de la oferta
 * y no la de la lista ya filtrada. Con `filter().map((f, i) => …)` no lo es: basta
 * una fila vacía arriba para que editar la tercera fila de la pantalla escriba en la
 * cuarta del dato, en silencio.
 */
function conIndice<T>(filas: T[], sirve: (fila: T) => boolean): { fila: T; i: number }[] {
  return filas.map((fila, i) => ({ fila, i })).filter(({ fila }) => sirve(fila));
}

/**
 * El cuerpo de una tabla, partido en grupos que no se cortan mal.
 *
 * Salió impreso, y es lo mismo que pasaba con las listas: el navegador parte donde
 * le toca. Una tabla de precios terminó con sus cinco líneas al pie de una página y
 * la fila de TOTAL NETO sola en la siguiente, debajo de una cabecera repetida que
 * no encabezaba nada. Y el cronograma quedó con T1 y T2 en una hoja y T3, T4 y el
 * total en la otra.
 *
 * Un `<table>` acepta VARIOS `<tbody>`, y el navegador sí respeta
 * `break-inside: avoid` en un tbody. Así que el cuerpo se parte en tramos con la
 * misma regla que las listas: una tabla corta va entera, y una larga mantiene juntas
 * la cabeza y —sobre todo— la cola con su fila de total, que es la que nunca puede
 * quedar sola.
 */
const FILAS_TABLA_ENTERA = 8;
const FILAS_PEGADAS = 2;

export function cuerpoDeTabla(filas: string[], filaDeTotal = ""): string {
  if (filas.length === 0) return `<tbody>${filaDeTotal}</tbody>`;

  if (filas.length <= FILAS_TABLA_ENTERA) {
    return `<tbody class="junta">${filas.join("")}${filaDeTotal}</tbody>`;
  }

  const cabeza = filas.slice(0, FILAS_PEGADAS);
  const cola = filas.slice(-FILAS_PEGADAS);
  const medio = filas.slice(FILAS_PEGADAS, filas.length - FILAS_PEGADAS);

  return (
    `<tbody class="junta">${cabeza.join("")}</tbody>` +
    (medio.length ? `<tbody>${medio.join("")}</tbody>` : "") +
    `<tbody class="junta">${cola.join("")}${filaDeTotal}</tbody>`
  );
}

/**
 * Cuántos ítems se quedan pegados al título de una lista.
 *
 * Salió impreso: "ANTES DE LA DETENCIÓN DE PLANTA" quedó al pie de una página con
 * UN ítem debajo y los otros tres en la siguiente. Y en otra corrida, el título
 * del bloque siguiente no cupo y dejó media página en blanco. Las dos cosas son
 * el mismo defecto: el navegador parte donde le toca, y un título con un ítem
 * suelto no dice nada.
 *
 * Con tres, el bloque ya se lee como un bloque. El servidor sabe cuántos ítems
 * hay antes de imprimir, así que puede decidir qué mantener junto en vez de
 * dejarlo al azar de dónde cae el corte.
 */
const ITEMS_PEGADOS_AL_TITULO = 3;

/** Una lista corta entra entera en cualquier hueco razonable: no se parte nunca. */
const MAXIMO_LISTA_ENTERA = 6;

/** Los <li> de un tramo, con el numeral siguiendo la cuenta global. */
function itemsDeHitos(items: string[], desde: number, ruta?: string): string {
  return items
    .map(
      (texto, i) =>
        `<li><span class="numeral">${String(desde + i + 1).padStart(2, "0")}</span>` +
        `<span${campo(ruta ? `${ruta}.${desde + i}` : undefined)}>${esc(texto)}</span></li>`,
    )
    .join("");
}

/**
 * Una lista de hitos que no se puede partir mal.
 *
 * Corta, va entera. Larga, se parte en tres tramos: el título con los primeros
 * ítems, el medio que puede fluir libremente, y los dos últimos juntos — así
 * tampoco queda un ítem solo abriendo una página. Cada tramo cerrado va en un
 * `.grupo`, que es lo único que el navegador respeta de verdad
 * (`break-inside: avoid`).
 *
 * El separador es un `border-top` en cada ítem menos el primero de la lista, no
 * el primero de cada tramo: si fuera por tramo, en los cortes quedarían dos
 * ítems pegados sin línea.
 */
function hitos(items: string[], titulo?: string, ruta?: string): string {
  if (items.length === 0) return "";
  const encabezado = titulo ? `<h3>${esc(titulo)}</h3>` : "";

  if (items.length <= MAXIMO_LISTA_ENTERA) {
    return (
      `<div class="grupo">${encabezado}` +
      `<ol class="hitos primera">${itemsDeHitos(items, 0, ruta)}</ol></div>`
    );
  }

  const cabeza = items.slice(0, ITEMS_PEGADOS_AL_TITULO);
  const cola = items.slice(-2);
  const medio = items.slice(ITEMS_PEGADOS_AL_TITULO, items.length - 2);

  return (
    `<div class="grupo">${encabezado}` +
    `<ol class="hitos primera">${itemsDeHitos(cabeza, 0, ruta)}</ol></div>` +
    (medio.length ? `<ol class="hitos">${itemsDeHitos(medio, ITEMS_PEGADOS_AL_TITULO, ruta)}</ol>` : "") +
    `<div class="grupo"><ol class="hitos">${itemsDeHitos(cola, items.length - 2, ruta)}</ol></div>`
  );
}

/**
 * Numera los subtítulos de una sección: 3.1, 3.2, 3.3…
 *
 * Como con las secciones, el número NO se transcribe: se cuenta al armar. La
 * propuesta hecha a mano numera así y sirve para lo que sirve un número —poder
 * decir "la secuencia 4.2" en otra parte del documento— pero mantenerlo a mano
 * entre versiones es justo lo que se rompe.
 */
function numerarSubsecciones(cuerpo: string, numeroDeSeccion: string): string {
  let n = 0;
  return cuerpo.replace(/<h3>/g, () => {
    n += 1;
    return `<h3><span class="sub">${numeroDeSeccion}.${n}</span> `;
  });
}

/**
 * La grilla de imágenes de una sección, o "" si no tiene.
 *
 * Las imágenes salen DONDE ESTABAN en el borrador y no todas juntas al final: un
 * diagrama entre dos pasos del trabajo pertenece a la metodología, y sacarlo de ahí
 * para pegarlo en el anexo convierte el documento en un collage.
 *
 * Cada figura va en su celda del mismo alto, con la imagen centrada adentro: con
 * altos naturales las filas no alinean y se lee como imágenes tiradas. Una más
 * ancha que 1.6:1 ocupa la fila completa, porque un diagrama a media página no se
 * lee.
 */
function grillaDeImagenes(
  numeros: number[] | undefined,
  imagenes: Record<number, ImagenDibujable>,
  epigrafes: Record<number, string> = {},
): string {
  const usables = (numeros ?? [])
    .map((indice) => ({ indice, imagen: imagenes[indice] }))
    .filter((par) => imagenSegura(par.imagen?.uri) !== null);
  if (usables.length === 0) return "";

  return (
    `<div class="fotos">` +
    usables
      .map(({ indice, imagen }, i) => {
        // El número del pie lo pone el documento, como el de las secciones: en la
        // propuesta hecha a mano cada foto va numerada con su epígrafe, y contar a
        // mano es justo lo que se desordena entre versiones.
        const numero = String(i + 1).padStart(2, "0");
        const epigrafe = epigrafes[indice];
        return (
          `<figure${imagen.apaisada ? ' class="ancha"' : ""}>` +
          `<img src="${imagen.uri}" alt="">` +
          `<figcaption>${numero}${
            epigrafe ? `. <span${campo(`epigrafesDeImagenes.${indice}`)}>${esc(epigrafe)}</span>` : ""
          }</figcaption>` +
          `</figure>`
        );
      })
      .join("") +
    `</div>`
  );
}

/**
 * Arma las secciones que SÍ aplican, en orden, y les asigna su número.
 *
 * Esta función es la que hace innecesario "renumerar": el número de cada sección
 * es su posición en esta lista, calculada al momento de generar el PDF.
 */
function armarSecciones(
  oferta: OfertaCanonica,
  totales: TotalesOferta,
  imagenes: Record<number, ImagenDibujable>,
  empresa: EmpresaIdentidad,
): SeccionArmada[] {
  const secciones: SeccionArmada[] = [];
  const agregar = (titulo: string, cuerpo: string, clave?: SeccionConImagenes, junto = false) =>
    secciones.push({
      numero: String(secciones.length + 1),
      titulo,
      // La grilla de la sección va al final de su cuerpo, que es donde estaba en el
      // borrador respecto del texto que la rodea.
      cuerpo: numerarSubsecciones(
        cuerpo +
          (clave
            ? grillaDeImagenes(oferta.imagenesPorSeccion?.[clave], imagenes, oferta.epigrafesDeImagenes ?? {})
            : ""),
        String(secciones.length + 1),
      ),
      junto,
      clave,
    });

  const id = oferta.identificacion;
  agregar(
    "Identificación de la oferta",
    `<table class="datos">${filasEtiqueta([
      ["Oferta N°", id.numeroOferta, "identificacion.numeroOferta"],
      ["Fecha", id.fecha, "identificacion.fecha"],
      ["Validez", id.validez, "identificacion.validez"],
      ["Cliente", id.cliente, "identificacion.cliente"],
      ["Atención", id.atencion, "identificacion.atencion"],
      ["Copia", id.copia, "identificacion.copia"],
      ["Referencia", id.referencia, "identificacion.referencia"],
      ["Faena", id.faena, "identificacion.faena"],
    ])}</table>`,
  );

  if (oferta.alcance) {
    const a = oferta.alcance;
    let cuerpo = a.introduccion ? `<p${campo("alcance.introduccion")}>${esc(a.introduccion)}</p>` : "";
    if (a.actividades.length) {
      cuerpo += hitos(a.actividades, "Actividades comprendidas", "alcance.actividades");
    }
    if (a.trabajosPrevios.length) {
      cuerpo += hitos(a.trabajosPrevios, "Trabajos previos considerados", "alcance.trabajosPrevios");
    }
    if (a.personalEspecialista.length) {
      cuerpo +=
        `<h3>Personal especialista considerado</h3>` +
        tablaDotacion(a.personalEspecialista, totales.dotacionTotal, "alcance.personalEspecialista", false);
    }
    if (cuerpo) agregar("Alcance del servicio", cuerpo, "alcance");
  }

  if (oferta.metodologia) {
    const m = oferta.metodologia;
    let cuerpo = "";
    if (m.antesDeLaDetencion.length) {
      cuerpo += hitos(
        m.antesDeLaDetencion,
        "Antes de la detención de planta",
        "metodologia.antesDeLaDetencion",
      );
    }
    if (m.duranteLaDetencion.length) {
      cuerpo += hitos(
        m.duranteLaDetencion,
        "Durante la detención de planta",
        "metodologia.duranteLaDetencion",
      );
    }
    if (cuerpo) agregar("Metodología y secuencia de trabajo", cuerpo, "metodologia");
  }

  if (oferta.especificaciones?.length) {
    agregar(
      "Especificaciones técnicas y equipo",
      `<table class="tabla"><colgroup><col style="width:34%"><col></colgroup>
        <thead><tr><th>Parámetro</th><th>Especificación</th></tr></thead>
        ${cuerpoDeTabla(
          // Igual que las tarjetas: sin parámetro, la fila no existe.
          conIndice(oferta.especificaciones, (e) => e.parametro.trim() !== "").map(
            ({ fila: e, i }) =>
              `<tr><td${campo(`especificaciones.${i}.parametro`)}>${esc(e.parametro)}</td>` +
              `<td${campo(`especificaciones.${i}.especificacion`)}>${esc(e.especificacion)}</td></tr>`,
          ),
        )}</table>`,
      "especificaciones",
    );
  }

  if (oferta.organizacion) {
    const o = oferta.organizacion;
    let cuerpo = o.nota ? `<p${campo("organizacion.nota")}>${esc(o.nota)}</p>` : "";
    if (o.cuadroPersonal.length) {
      cuerpo += `<h3>Cuadro de personal</h3>${tablaDotacion(o.cuadroPersonal, totales.dotacionTotal, "organizacion.cuadroPersonal", true)}`;
    }
    // Una responsabilidad sin cargo no se dibuja: vaciar el cargo en el editor es
    // la forma de sacar una tarjeta que quedó de otra oferta.
    const responsabilidades = conIndice(o.responsabilidades, (r) => r.cargo.trim() !== "");
    if (responsabilidades.length) {
      cuerpo +=
        `<h3>Organización del servicio</h3><div class="tarjetas">` +
        responsabilidades
          .map(
            // El color alterna por posición impresa, no por índice del dato: si no, una
            // tarjeta salteada deja dos del mismo color pegadas.
            ({ fila: r, i }, orden) =>
              `<div class="tarjeta ${orden % 2 === 0 ? "naranjo" : "teal"}">
                 <p class="cargo"${campo(`organizacion.responsabilidades.${i}.cargo`)}>${esc(r.cargo)}</p>
                 <p${campo(`organizacion.responsabilidades.${i}.descripcion`)}>${esc(r.descripcion)}</p></div>`,
          )
          .join("") +
        `</div>`;
    }
    if (cuerpo) agregar("Dotación y organización del servicio", cuerpo, "organizacion");
  }

  if (oferta.programa?.turnos.length) {
    const p = oferta.programa;
    let acumulado = 0;
    agregar(
      "Programa y plazos",
      (p.introduccion ? `<p${campo("programa.introduccion")}>${esc(p.introduccion)}</p>` : "") +
        `<table class="tabla"><colgroup><col style="width:14%"><col style="width:28%"><col style="width:12%"><col></colgroup>
          <thead><tr><th>Turno</th><th>Jornada</th><th class="num">Horas</th><th>Avance acumulado</th></tr></thead>
          ${cuerpoDeTabla(
            conIndice(p.turnos, (turno) => turno.turno.trim() !== "" || turno.horas !== 0).map(
              ({ fila: t, i }) => {
                acumulado += t.horas;
                const ancho = Math.round((acumulado / totales.horasPrograma) * 100);
                return (
                  `<tr><td${campo(`programa.turnos.${i}.turno`)}>${esc(t.turno)}</td>` +
                  `<td${campo(`programa.turnos.${i}.jornada`)}>${esc(t.jornada)}</td>` +
                  `<td class="num"${campo(`programa.turnos.${i}.horas`, "numero")}>${esc(t.horas)}</td>` +
                  `<td data-calculado="avance"><span class="barra"><span style="width:${ancho}%"></span></span>
                  <span class="avance">${esc(acumulado)} h de ${esc(totales.horasPrograma)} h</span></td></tr>`
                );
              },
            ),
            `<tr class="total"><td>Total</td>
              <td data-calculado="turnos">${esc(totales.cantidadTurnos)} turno${
                totales.cantidadTurnos === 1 ? "" : "s"
              }</td>
              <td class="num" data-calculado="horas">${esc(totales.horasPrograma)}</td><td></td></tr>`,
          )}</table>` +
        (p.nota ? `<p class="nota"${campo("programa.nota")}>${esc(p.nota)}</p>` : ""),
      "programa",
    );
  }

  if (oferta.precio?.lineas.length) {
    const pr = oferta.precio;
    agregar(
      "Precio del servicio",
      `<table class="tabla precios">
        <colgroup><col style="width:6%"><col style="width:8%"><col><col style="width:10%"><col style="width:15%"><col style="width:15%"></colgroup>
        <thead><tr><th>Ít</th><th class="num">Cant</th><th>Cargo</th><th>Un</th><th class="num">V. Unit</th><th class="num">V. Total</th></tr></thead>
        ${cuerpoDeTabla(
          // Una línea sin descripción y sin monto es una fila que alguien agregó y no
          // completó: no se imprime. Con una de las dos cosas, sí — y el control de
          // "valor unitario en 0" la marca para que se revise.
          conIndice(pr.lineas, (linea) => linea.cargo.trim() !== "" || linea.valorUnitario !== 0).map(
            // El número de ítem es el del papel —1, 2, 3 sin saltos— y el de la ruta es
            // el del dato: no tienen por qué coincidir.
            ({ fila: l, i }, orden) =>
              `<tr><td>${orden + 1}.</td>` +
              `<td class="num"${campo(`precio.lineas.${i}.cantidad`, "numero")}>${esc(
                String(l.cantidad).padStart(2, "0"),
              )}</td>` +
              `<td${campo(`precio.lineas.${i}.cargo`)}>${esc(l.cargo)}</td>` +
              `<td${campo(`precio.lineas.${i}.unidad`)}>${esc(l.unidad)}</td>` +
              `<td class="num"${campo(`precio.lineas.${i}.valorUnitario`, "numero")}>${clp(
                l.valorUnitario,
              )}</td>` +
              `<td class="num" data-calculado="linea">${clp(l.cantidad * l.valorUnitario)}</td></tr>`,
          ),
          `<tr class="total"><td colspan="5">Total neto — no incluye IVA</td>
            <td class="num" data-calculado="totalNeto">${clp(totales.totalNetoCalculado)}</td></tr>`,
        )}</table>` +
        `<p class="nota"${campo("precio.nota")}>${esc(
          pr.nota ?? "Valores en pesos chilenos, netos. Los precios ofrecidos no incluyen IVA.",
        )}</p>`,
      "precio",
    );
  }

  if (oferta.condicionesComerciales?.length) {
    agregar(
      "Condiciones comerciales",
      hitos(oferta.condicionesComerciales, undefined, "condicionesComerciales"),
      "condiciones",
    );
  }

  if (oferta.aportes && (oferta.aportes.pertec.length || oferta.aportes.cliente.length)) {
    const columna = (titulo: string, items: string[], ruta: string) =>
      `<div class="columna"><p class="cabecera">${esc(titulo)}</p>
         <ul>${items.map((t, i) => `<li${campo(`${ruta}.${i}`)}>${esc(t)}</li>`).join("")}</ul></div>`;
    agregar(
      "Aportes de las partes",
      `<div class="aportes">${columna(
        "Aportes de PERTEC",
        oferta.aportes.pertec,
        "aportes.pertec",
      )}${columna(`Aportes del cliente`, oferta.aportes.cliente, "aportes.cliente")}</div>`,
      "aportes",
    );
  }

  if (oferta.cierre) {
    const c = oferta.cierre;
    // La rúbrica de cada uno, resuelta antes de dibujar: hace falta saber si HAY
    // alguna para decidir el hueco de todos.
    const rubricas = c.firmantes.map((_, i) => imagenSegura(imagenes[firmaDe(c, i) ?? -1]?.uri));
    const hayRubrica = rubricas.some(Boolean);
    agregar(
      "Cierre y firma",
      (c.texto ? `<p${campo("cierre.texto")}>${esc(c.texto)}</p>` : "") +
        `<div class="firmas">${c.firmantes
          .map((f, i) => {
            // La rúbrica va ARRIBA de la línea, apoyada en ella, como en un papel
            // firmado. Cada firmante lleva la suya: una propuesta firmada por dos
            // personas lleva dos rúbricas distintas, no la misma dos veces.
            //
            // El hueco se reserva para TODOS cuando hay alguna, aunque solo uno la
            // tenga: si no, la línea del que firma queda más abajo que la del que
            // no, y el bloque sale desalineado.
            const rubrica = rubricas[i];
            return (
              `<div class="firma">` +
              (hayRubrica
                ? `<span class="hueco-rubrica">${
                    rubrica ? `<img class="rubrica" src="${rubrica}" alt="">` : ""
                  }</span>`
                : "") +
              `<span class="linea"></span>` +
              `<p class="nombre"${campo(`cierre.firmantes.${i}.nombre`)}>${esc(f.nombre)}</p>` +
              `<p class="cargo"><span${campo(`cierre.firmantes.${i}.cargo`)}>${esc(f.cargo)}</span>` +
              (f.empresa
                ? `<br><span${campo(`cierre.firmantes.${i}.empresa`)}>${esc(f.empresa)}</span>`
                : "") +
              `</p></div>`
            );
          })
          .join("")}</div>` +
        // La identidad de quien firma, bajo las firmas: en la propuesta hecha a
        // mano va el RUT y la sucursal, que es lo que hace del bloque una firma y
        // no dos nombres sueltos.
        (identidadDeFirma(empresa) ? `<p class="identidad">${esc(identidadDeFirma(empresa))}</p>` : "") +
        (c.cc ? `<p class="cc"${campo("cierre.cc")}>${esc(c.cc)}</p>` : ""),
      "cierre",
      // Corta por naturaleza —un párrafo, una o dos firmas y el cc— y la que peor
      // queda partida.
      true,
    );
  }

  return secciones;
}

/**
 * Una fila vacía no se imprime.
 *
 * Desde que el editor permite agregar filas, "agregué una y no la completé" es un
 * caso normal — y una fila en blanco en el cuadro de personal de una oferta que se
 * manda a un cliente es peor que no tenerla. Es la misma regla que ya regía para
 * las tarjetas de responsabilidades: vaciar el cargo la saca.
 */
function tablaDotacion(
  filas: { cargo: string; dotacion: number; regimen?: string | null }[],
  total: number,
  ruta: string,
  conRegimen: boolean,
): string {
  const columnas = conRegimen
    ? `<colgroup><col><col style="width:16%"><col style="width:30%"></colgroup>`
    : `<colgroup><col><col style="width:20%"></colgroup>`;
  const encabezado = conRegimen
    ? `<tr><th>Cargo</th><th class="num">Dotación</th><th>Régimen</th></tr>`
    : `<tr><th>Cargo</th><th class="num">Dotación</th></tr>`;
  return (
    `<table class="tabla">${columnas}<thead>${encabezado}</thead>` +
    cuerpoDeTabla(
      conIndice(filas, (fila) => fila.cargo.trim() !== "").map(
        ({ fila: f, i }) =>
          `<tr><td${campo(`${ruta}.${i}.cargo`)}>${esc(f.cargo)}</td>` +
          `<td class="num"${campo(`${ruta}.${i}.dotacion`, "numero")}>${esc(f.dotacion)}</td>` +
          (conRegimen ? `<td${campo(`${ruta}.${i}.regimen`)}>${esc(f.regimen ?? "")}</td>` : "") +
          `</tr>`,
      ),
      `<tr class="total"><td>Total</td><td class="num" data-calculado="dotacion">${esc(total)}</td>${
        conRegimen ? "<td></td>" : ""
      }</tr>`,
    ) +
    `</table>`
  );
}

/** El anexo: se numera con letra, no con número, igual que en el maestro. */
function armarAnexo(
  anexo: OfertaCanonica["anexo"],
  fotos: number[] | undefined,
  imagenes: Record<number, ImagenDibujable>,
  epigrafes: Record<number, string>,
): SeccionArmada | null {
  // Con fotos elegidas la sección existe aunque no traiga texto: si no, elegir una
  // foto para el anexo de un borrador que no tiene anexo escrito la hacía
  // desaparecer sin decir nada.
  if (!anexo && !(fotos ?? []).length) return null;
  let cuerpo = "";
  if (anexo?.respaldoInstitucional.length) {
    const [primero, ...resto] = anexo.respaldoInstitucional;
    cuerpo +=
      `<div class="grupo"><h3>Respaldo institucional</h3>` +
      `<p${campo("anexo.respaldoInstitucional.0")}>${esc(primero)}</p></div>` +
      resto
        .map((parrafo, i) => `<p${campo(`anexo.respaldoInstitucional.${i + 1}`)}>${esc(parrafo)}</p>`)
        .join("");
  }
  if (anexo?.mandantes.length) {
    // Título, rejilla y nota en un solo grupo. Salió impreso partido en dos: tres
    // mandantes al pie de una página y los otros tres abriendo la siguiente, con
    // una hoja casi vacía detrás. Es una rejilla de seis nombres, siempre corta:
    // no hay razón para que se parta nunca.
    cuerpo +=
      `<div class="grupo">` +
      `<h3>Principales mandantes y contratos ejecutados con nuestro personal</h3>` +
      `<div class="mandantes">${anexo!.mandantes
        .map((m, i) => `<span${campo(`anexo.mandantes.${i}`)}>${esc(m)}</span>`)
        .join("")}</div>` +
      `</div>`;
  }

  // Las fotos del anexo, con su título y con la nota del borrador como epígrafe.
  //
  // La nota estaba antes junto a los mandantes y no es de ahí: en un borrador dice
  // "Fotografías de referencia incluidas: CODELCO - División Radomiro Tomic…", que
  // es exactamente el epígrafe de estas fotos.
  const grilla = grillaDeImagenes(fotos, imagenes, epigrafes);
  if (grilla) {
    cuerpo +=
      `<div class="grupo"><h3>Fotografías de referencia</h3>` +
      (anexo?.notaEquipo ? `<p class="nota"${campo("anexo.notaEquipo")}>${esc(anexo.notaEquipo)}</p>` : "") +
      `</div>` +
      grilla;
  } else if (anexo?.notaEquipo) {
    cuerpo += `<p${campo("anexo.notaEquipo")}>${esc(anexo.notaEquipo)}</p>`;
  }

  if (!cuerpo) return null;
  return {
    numero: "A",
    titulo: "Anexo — respaldos y experiencia en trabajos similares",
    cuerpo,
  };
}

/**
 * El HTML completo de la oferta, listo para imprimir.
 *
 * El header y el footer se repiten en cada página con `position: fixed` dentro de
 * `@page`, que es como Chromium los mantiene al imprimir; la paginación sale de
 * los contadores CSS `counter(page)` y `counter(pages)`, así que "Página 7 de 11"
 * no lo cuenta nadie a mano.
 */
export function ofertaAHtml(
  oferta: OfertaCanonica,
  totales: TotalesOferta,
  empresa: EmpresaIdentidad,
  // El estilo del maestro elegido. Sin maestro, el de PERTEC: una oferta sale
  // igual que antes de que los maestros existieran.
  estilo: EstiloMaestro = ESTILO_PERTEC,
  // Los logos, ya resueltos a data URI por logos-archivo.ts. Sin logos el
  // encabezado sale en texto, igual que antes de que se pudieran subir.
  logos: LogosDocumento = SIN_LOGOS,
  // Las imágenes del borrador que el documento va a dibujar, por número de
  // marcador y ya resueltas a data URI (ver lib/ofertas/imagenes.ts). Las que no
  // estén acá simplemente no se dibujan.
  imagenes: Record<number, ImagenDibujable> = {},
): string {
  const secciones = armarSecciones(oferta, totales, imagenes, empresa);
  // Una imagen asignada a una sección que este documento no tiene —fotos en
  // "especificaciones" cuando no hay especificaciones— no se pierde: cae al anexo.
  // Elegir una imagen y que no aparezca en ninguna parte es lo peor que puede hacer
  // esa pantalla.
  const emitidas = new Set(secciones.map((seccion) => seccion.clave).filter(Boolean));
  const enElAnexo = oferta.imagenesPorSeccion?.anexo ?? [];
  const huerfanas = Object.entries(oferta.imagenesPorSeccion ?? {})
    .filter(([clave]) => clave !== "anexo" && !emitidas.has(clave as SeccionConImagenes))
    .flatMap(([, indices]) => indices ?? []);
  const anexo = armarAnexo(
    oferta.anexo,
    [...enElAnexo, ...huerfanas],
    imagenes,
    oferta.epigrafesDeImagenes ?? {},
  );
  const todas = anexo ? [...secciones, anexo] : secciones;
  const id = oferta.identificacion;

  const referenciaPie = referenciaDePie(id.numeroOferta, id.cliente, oferta.titulo);
  // Se revalidan acá y no solo al bajarlos: este archivo es el que interpola el
  // valor en un `src`, así que el control tiene que estar en el borde del
  // documento. Lo que no pasa vuelve al texto, que es un resultado correcto.
  const logoCasa = logoSeguro(logos.casa);
  const logoCliente = logoSeguro(logos.cliente);

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(id.numeroOferta ?? "Oferta")}</title>
<style>
  /* Los márgenes reales los pone page.pdf() al imprimir, porque el header y el
     footer repetidos son cajas de Chromium y no elementos del documento (ver
     plantillasDeImpresion). Acá solo se declara el tamaño. */
  @page { size: A4; margin: 32mm ${estilo.margenLateral}mm 22mm; }
  * { box-sizing: border-box; }
  body {
    font-family: ${estilo.fuenteCuerpo};
    color: ${estilo.colorTinta}; font-size: ${estilo.tamanoCuerpo}px; line-height: 1.45; margin: 0;
    counter-reset: pagina;
  }

  /* El header y el footer de ESTE documento son solo para la vista en pantalla.
     Al imprimir se ocultan y los pone Chromium como cajas de margen, que es la
     única forma de que se repitan en cada página sin encabalgarse con el texto y
     de que la paginación funcione. Un position:fixed con offsets negativos
     —el primer intento— se veía bien en el navegador y en el PDF caía encima del
     contenido, con "Página 0 de 0". */
  .header {
    margin-bottom: 8mm; height: ${estilo.altoHeader}mm;
    display: flex; border: 1px solid ${estilo.colorBorde};
  }
  .header > div { padding: 3mm 4mm; display: flex; flex-direction: column; justify-content: center; }
  .header .marca { width: ${estilo.anchoCeldaLateral}mm; border-right: 1px solid ${estilo.colorBorde}; font-weight: 700; letter-spacing: .06em;
    font-size: 9px; text-transform: uppercase; color: ${estilo.colorTinta};
    align-items: center; text-align: center; }
  .header .centro { flex: 1; border-right: 1px solid ${estilo.colorBorde}; flex-direction: row;
    align-items: center; justify-content: space-between; }
  .header .cliente { width: ${estilo.anchoCeldaLateral}mm; align-items: center; justify-content: center;
    color: ${estilo.colorSuave}; font-size: 8px; text-transform: uppercase; letter-spacing: .08em; }
  /* Con max-width y max-height y sin dimensiones propias, el navegador escala la
     imagen conservando la proporción: un logo apaisado y uno cuadrado caben los
     dos en la celda sin deformarse. align-self evita que el flex lo estire. */
  .header img { max-width: 100%; max-height: ${estilo.altoHeader - 8}mm; }
  /* Centrado en su celda, las dos: el logo de la casa y el del cliente. La celda
     ya centra vertical con justify-content, así que align-self resuelve el
     horizontal. */
  .header .marca img, .header .cliente img { align-self: center; }
  .header .empresa { font-weight: 700; font-size: 11px; }
  .header .rut { color: ${estilo.colorSuave}; font-size: 8.5px; }
  .header .oferta { text-align: right; font-size: 9px; color: ${estilo.colorSuave}; }
  .header .oferta b { color: ${estilo.colorTinta}; }

  /* La referencia del medio se recorta con puntos suspensivos en vez de empujar a
     la dirección y a la paginación, que son las dos que siempre tienen que leerse. */
  .footer {
    margin-top: 10mm; border-top: 1px solid ${estilo.colorBorde}; padding-top: 2mm;
    display: flex; justify-content: space-between; gap: 6mm; align-items: baseline;
    font-size: 7.5px; color: ${estilo.colorSuave};
  }
  .footer .referencia { flex: 1; min-width: 0; text-align: center; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .footer .fijo { flex: none; }

  /* El ritmo vertical, medido en la OS 009: con los valores anteriores el documento
     pedía 30mm más de los que tenía y arrastraba una sexta hoja con un solo bloque
     adentro. Bajar el aire de los títulos no lo aprieta, lo ordena. */
  h2 { font-size: ${estilo.tamanoTitulo}px; font-family: ${estilo.fuenteTitulos}; text-transform: uppercase; letter-spacing: -.01em; margin: 7.5mm 0 2.5mm;
       padding-bottom: 2mm; border-bottom: 1.6px solid ${estilo.colorTinta}; display: flex; gap: 4mm;
       align-items: baseline; page-break-after: avoid; }
  h2 .n { color: ${estilo.colorAcento}; font-weight: 700; }
  h2:first-of-type { margin-top: 0; }
  h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; margin: 4mm 0 1.6mm;
       page-break-after: avoid; }
  h3 .sub { color: ${estilo.colorAcento}; }
  /* Nunca una línea sola cruzando de página: dos arriba y dos abajo como mínimo. */
  p { margin: 0 0 2.5mm; orphans: 2; widows: 2; }
  section.junto { page-break-inside: avoid; }
  /* Una nota de sección es una referencia cruzada —"la secuencia 4.2 se ejecuta
     dentro de los turnos de la sección 7"— y en la propuesta hecha a mano va con
     una barra al costado, no como un párrafo más. */
  p.nota { color: ${estilo.colorSuave}; font-size: 8.5px; padding-left: 3mm;
    border-left: 1.2px solid ${estilo.colorAcentoAlterno}; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  .datos th.etiqueta { width: 32%; text-align: left; vertical-align: top; padding: 2mm 3mm;
    background: ${estilo.colorFondoSuave}; color: ${estilo.colorSuave}; font-size: 8px; text-transform: uppercase;
    letter-spacing: .06em; font-weight: 600; }
  .datos td { padding: 2mm 3mm; background: ${estilo.colorFondoSuave}; }
  /* Separador por contraste con el fondo de la fila, no un blanco fijo: con un
     maestro de paleta oscura un blanco acá sería una raya. */
  .datos tr + tr th, .datos tr + tr td { border-top: 1px solid ${estilo.colorCabeceraTexto}; }
  /* En la portada, sin bloque de fondo: la propuesta hecha a mano deja los datos
     sueltos sobre el papel y el aire hace el trabajo. Adentro, en la sección de
     identificación, sí van con fondo. */
  .datos.limpia th.etiqueta, .datos.limpia td { background: transparent; }
  .datos.limpia tr + tr th, .datos.limpia tr + tr td { border-top: 0; }
  .datos.limpia th.etiqueta, .datos.limpia td { padding: 1.4mm 3mm 1.4mm 0; }

  /* Una cabecera de tabla sola al pie de una página no dice nada: se va con sus
     primeras filas. Y los tramos del cuerpo —ver cuerpoDeTabla— no se parten:
     es lo que impide que la fila de total abra una página sola. */
  thead { page-break-after: avoid; }
  tbody.junta { page-break-inside: avoid; }
  .tabla thead th { background: ${estilo.colorCabecera}; color: ${estilo.colorCabeceraTexto}; text-align: left; padding: 2mm 3mm;
    font-size: 8px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }
  .tabla td { padding: 2mm 3mm; vertical-align: top; }
  .tabla tbody tr:nth-child(even) td { background: ${estilo.colorFondoSuave}; }
  .tabla .num { text-align: right; }
  .tabla tr.total td { background: ${estilo.colorFondoTotal}; font-weight: 700; border-top: 1px solid ${estilo.colorBorde}; }
  .precios tr.total td:first-child { text-align: right; text-transform: uppercase;
    letter-spacing: .04em; font-size: 9px; }

  .barra { display: inline-block; width: 42%; height: 2.4mm; background: ${estilo.colorFondoTotal}; vertical-align: middle;
    border-radius: 1.2mm; overflow: hidden; }
  .barra > span { display: block; height: 100%; background: ${estilo.colorAcento}; }
  .avance { font-size: 8px; color: ${estilo.colorSuave}; margin-left: 2mm; }

  /* Los tramos de una lista comparten el margen inferior: solo el último lo lleva,
     para que partir una lista no agregue aire en el medio. */
  ol.hitos { list-style: none; margin: 0; padding: 0; }
  ol.hitos:last-child, .grupo:last-child ol.hitos { margin-bottom: 3mm; }
  ol.hitos li { display: flex; gap: 3mm; padding: 1.6mm 0; border-top: 1px solid ${estilo.colorFondoTotal};
    page-break-inside: avoid; }
  /* Solo el primero de la lista completa, no el de cada tramo. */
  ol.hitos.primera li:first-child { border-top: 0; }
  /* Lo único que el navegador respeta de verdad para no partir un bloque. */
  .grupo { page-break-inside: avoid; }
  ol.hitos .numeral { color: ${estilo.colorAcento}; font-weight: 700; font-size: 9px; min-width: 6mm; }

  /* Ídem: con flex, un número impar de tarjetas dejaba la última estirada a lo
     ancho de la hoja. En rejilla, todas miden lo mismo. */
  .tarjetas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm;
    align-items: start; }
  .tarjeta { border: 1px solid ${estilo.colorFondoTotal}; border-left-width: 2.5mm; padding: 2.5mm 3mm;
    page-break-inside: avoid; }
  .tarjeta.naranjo { border-left-color: ${estilo.colorAcento}; }
  .tarjeta.teal { border-left-color: ${estilo.colorAcentoAlterno}; }
  .tarjeta .cargo { text-transform: uppercase; font-size: 8.5px; letter-spacing: .05em;
    font-weight: 700; margin-bottom: 1mm; }

  /* Rejilla y no flex: dos columnas exactamente iguales, y alineadas arriba
     para que la más corta no se estire y desalinee el rayado de las filas. */
  .aportes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm;
    align-items: start; margin-bottom: 3mm; }
  .aportes .cabecera { background: ${estilo.colorCabecera}; color: ${estilo.colorCabeceraTexto}; padding: 2mm 3mm; font-size: 8px;
    text-transform: uppercase; letter-spacing: .06em; font-weight: 600; margin: 0; }
  .aportes ul { list-style: none; margin: 0; padding: 0; }
  .aportes li { padding: 2mm 3mm; page-break-inside: avoid; }
  .aportes li:nth-child(even) { background: ${estilo.colorFondoSuave}; }

  /* 18mm de aire forzado hacían que el bloque no cupiera y se fuera entero a la
     página siguiente, dejando media hoja en blanco. */
  /* Una línea de firma necesita una línea clara, no diez milímetros de nada. */
  .firmas { display: flex; gap: 12mm; margin-top: 6mm; page-break-inside: avoid; }
  /* La línea de firma NO ocupa el ancho de la hoja. Con un solo firmante quedaba de
     borde a borde y se leía como otro separador de sección, justo debajo del de la
     cabecera. En la propuesta hecha a mano cada firma toma poco menos de media
     columna, y con dos firmantes entran las dos. */
  .firmas .firma { flex: 0 1 78mm; max-width: 78mm; }
  .firmas .linea { display: block; border-top: 1px solid ${estilo.colorTinta}; margin-bottom: 1.5mm; }
  /* El hueco de la rúbrica mide lo mismo para todos los firmantes, así las líneas
     quedan a la misma altura; la firma se apoya en su línea, como en un papel. */
  .firmas .hueco-rubrica { display: flex; align-items: flex-end; height: 17mm; margin-bottom: 1mm; }
  .firmas .rubrica { display: block; max-height: 17mm; max-width: 62mm; }

  /* Las fotos del anexo: dos por fila, cada una entera o en la página siguiente.
     el avoid va en la figura y no en la grilla: la grilla puede tener seis
     fotos y no cabe en media página, pero una foto partida en dos no es una foto. */
  /* Celdas del MISMO alto y la imagen centrada adentro. Con altos naturales la
     grilla quedaba despareja —cada foto de su tamaño, las filas sin alinear— y se
     leía como un montón de imágenes al final en vez de un anexo. La celda uniforme
     cuesta algo de aire alrededor de las fotos más cuadradas; a cambio, cierra. */
  .fotos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; margin-top: 3mm; }
  .fotos figure { margin: 0; page-break-inside: avoid; }
  .fotos figure img { height: 60mm; }
  .fotos figure.ancha img { height: 76mm; }
  /* El pie va DEBAJO de la imagen y fuera de su marco, como en la propuesta
     hecha a mano: numerado por el sistema y con el epígrafe del borrador. */
  .fotos figcaption { margin-top: 1.5mm; font-size: 8px; color: ${estilo.colorSuave};
    line-height: 1.35; }
  /* Una foto ancha o un diagrama ocupan la fila completa: a media página no se leen. */
  .fotos figure.ancha { grid-column: 1 / -1; }
  /* Se ajusta por contain y no por cover: varias de estas imágenes son collages
     con texto adentro, y recortarlas se come justo lo que explican. Que las filas
     queden de altos distintos es el precio correcto. */
  /* La caja de la imagen se ajusta a la imagen, no al revés: con width:100% el
     borde trazaba la celda y la foto quedaba con bandas blancas a los costados. */
  .fotos img { width: 100%; object-fit: contain; display: block;
    background: ${estilo.colorFondoSuave}; border: 1px solid ${estilo.colorBorde}; }
  .firmas .nombre { font-weight: 700; margin: 0; }
  .firmas .cargo { color: ${estilo.colorSuave}; margin: 0; font-size: 9px; }
  .identidad { color: ${estilo.colorSuave}; font-size: 8.5px; margin-top: 5mm; }
  .cc { color: ${estilo.colorSuave}; font-size: 8.5px; margin-top: 6mm; }

  /* Tres columnas iguales por rejilla: con flex y un calc, el último nombre de
     cada fila quedaba de otro ancho y las líneas no cerraban parejas. */
  .mandantes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 6mm;
    page-break-inside: avoid; }
  .mandantes span { border-bottom: 1px solid ${estilo.colorFondoTotal}; padding: 2mm 0; }

  .indice { margin-bottom: 4mm; }
  .indice li { display: flex; gap: 4mm; padding: 1.6mm 0; border-top: 1px solid ${estilo.colorFondoTotal}; list-style: none; }
  .indice .n { color: ${estilo.colorAcento}; font-weight: 700; min-width: 6mm; }
  .portada { page-break-after: always; }
  /* La portada NO lleva el logo aparte: el encabezado se repite en todas las
     páginas, incluida ella, así que salía dos veces. La propuesta hecha a mano
     tampoco lo repite. */
  .portada .rotulo { color: ${estilo.colorAcento}; font-size: 8.5px; letter-spacing: .16em;
    text-transform: uppercase; margin-bottom: 3mm; }
  /* La regla corta bajo el rótulo, como en la propuesta hecha a mano: ancla el
     título en la página en vez de dejarlo flotando. */
  .portada .rotulo::after { content: ""; display: block; width: 26mm; margin-top: 2.5mm;
    border-top: 1.2px solid ${estilo.colorAcento}; }
  .portada h1 { font-size: ${estilo.tamanoPortada}px; font-family: ${estilo.fuenteTitulos}; line-height: 1.08; text-transform: uppercase; margin: 0 0 3mm; }
  .portada .faena { color: ${estilo.colorSuave}; font-size: 13px; margin-bottom: 10mm; }

  /* AL FINAL a propósito: tiene la misma especificidad que .header y .footer, así
     que si fuera antes ganaría la declaración de abajo y el header saldría igual.
     Pasó: la portada mostraba la cabecera dos veces, la del documento y la que
     repite Chromium. Una media query no agrega especificidad, solo condiciona. */
  @media print { .header, .footer { display: none; } }
</style></head>
<body>
  <div class="header">
    <div class="marca">${logoCasa ? `<img src="${logoCasa}" alt="">` : esc(empresa.nombre)}</div>
    <div class="centro">
      <div>${razonDe(empresa) ? `<div class="empresa">${esc(razonDe(empresa))}</div>` : ""}${
        rutDe(empresa) ? `<div class="rut">${esc(rutDe(empresa))}</div>` : ""
      }</div>
      <div class="oferta">Oferta <b>${esc(id.numeroOferta ?? "—")}</b><br>Fecha <b>${esc(id.fecha ?? "—")}</b></div>
    </div>
    <div class="cliente">${
      logoCliente ? `<img src="${logoCliente}" alt="">` : esc(estilo.rotuloLogoCliente)
    }</div>
  </div>

  <div class="footer">
    <span class="fijo">${esc([empresa.direccion, empresa.ciudad].filter(Boolean).join(", "))}</span>
    <span class="referencia">${esc(referenciaPie)}</span>
    <span class="fijo">Vista en pantalla</span>
  </div>

  <section class="portada">
    <p class="rotulo">Oferta técnica y económica</p>
    <h1${campo("titulo")}>${esc(oferta.titulo)}</h1>
    ${id.faena ? `<p class="faena"${campo("identificacion.faena")}>${esc(id.faena)}</p>` : ""}
    <table class="datos limpia">${filasEtiqueta([
      ["Oferta N°", id.numeroOferta, "identificacion.numeroOferta"],
      ["Fecha", id.fecha, "identificacion.fecha"],
      ["Cliente", id.cliente, "identificacion.cliente"],
      ["Preparado por", [razonDe(empresa) || empresa.nombre, rutDe(empresa)].filter(Boolean).join(" · ")],
    ])}</table>

    <h2><span class="n">·</span> Índice de contenidos</h2>
    <ul class="indice">${todas
      .map((s) => `<li><span class="n">${esc(s.numero)}</span><span>${esc(s.titulo)}</span></li>`)
      .join("")}</ul>
  </section>

  ${todas
    .map(
      (s) =>
        `<section${s.junto ? ' class="junto"' : ""}><h2><span class="n">${esc(s.numero)}</span> ${esc(
          s.titulo,
        )}</h2>${s.cuerpo}</section>`,
    )
    .join("")}
</body></html>`;
}

/**
 * Las cajas de header y footer que repite Chromium en cada página.
 *
 * Van por acá y no como elementos del documento porque es la única forma de que
 * se repitan sin encabalgarse con el texto, y porque la paginación real
 * —"Página 3 de 11"— solo existe en estas cajas: Chromium las rellena con las
 * clases `pageNumber` y `totalPages`.
 *
 * Tres cosas propias de estas plantillas que no se adivinan: heredan
 * `font-size: 0`, así que hay que declararlo en cada elemento; no cargan CSS
 * externo, así que todo va en línea —y ahí una comilla doble en la tipografía
 * cerraría el atributo, ver `fuente`—; y no heredan el `box-sizing: border-box`
 * del documento, así que un `width: 100%` con `padding` se pasa del ancho de la
 * hoja.
 */
export function plantillasDeImpresion(
  oferta: OfertaCanonica,
  empresa: EmpresaIdentidad,
  estilo: EstiloMaestro = ESTILO_PERTEC,
  logos: LogosDocumento = SIN_LOGOS,
): { headerTemplate: string; footerTemplate: string } {
  const id = oferta.identificacion;
  const logoCasa = logoSeguro(logos.casa);
  const logoCliente = logoSeguro(logos.cliente);
  // Estas cajas van con estilos EN LÍNEA, así que una comilla doble en la
  // tipografía cierra el atributo y se pierde todo lo que sigue. Pasó: el
  // encabezado salía en otra fuente y sin su margen lateral —más ancho que el
  // texto de la página— porque el `padding` venía después del `font-family`. La
  // fuente ya se sanea con comillas simples; esto es el cinturón.
  const fuente = estilo.fuenteCuerpo.replace(/"/g, "'");
  // Estas cajas no cargan CSS externo, así que el escalado de la imagen también
  // va en línea. El alto se ata al del encabezado para que un maestro con
  // encabezado bajo no deje el logo colgando fuera de la celda.
  const imagen = `max-width:100%;max-height:${estilo.altoHeader - 9}mm;`;
  const referenciaPie = referenciaDePie(id.numeroOferta, id.cliente, oferta.titulo);
  const direccion = [empresa.direccion, empresa.ciudad].filter(Boolean).join(", ");
  const celda = "padding:2mm 3mm;display:flex;flex-direction:column;justify-content:center;";

  return {
    headerTemplate: `<div style="box-sizing:border-box;width:100%;font-family:${fuente};color:${estilo.colorTinta};
        padding:0 ${estilo.margenLateral}mm;-webkit-print-color-adjust:exact;">
      <div style="display:flex;border:1px solid ${estilo.colorBorde};height:${estilo.altoHeader - 2}mm;">
        <div style="${celda}width:${estilo.anchoCeldaLateral - 2}mm;border-right:1px solid ${estilo.colorBorde};font-size:7px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;align-items:center;text-align:center;">${
            logoCasa
              ? `<img src="${logoCasa}" alt="" style="${imagen}align-self:center;">`
              : esc(empresa.nombre)
          }</div>
        <div style="${celda}flex:1;border-right:1px solid ${estilo.colorBorde};flex-direction:row;
          align-items:center;justify-content:space-between;">
          <div>${
            razonDe(empresa)
              ? `<div style="font-size:9px;font-weight:700;">${esc(razonDe(empresa))}</div>`
              : ""
          }${
            rutDe(empresa)
              ? `<div style="font-size:7px;color:${estilo.colorSuave};">${esc(rutDe(empresa))}</div>`
              : ""
          }</div>
          <div style="font-size:7px;color:${estilo.colorSuave};text-align:right;">
            Oferta <b style="color:${estilo.colorTinta};">${esc(id.numeroOferta ?? "\u2014")}</b><br>
            Fecha <b style="color:${estilo.colorTinta};">${esc(id.fecha ?? "\u2014")}</b></div>
        </div>
        <div style="${celda}width:${estilo.anchoCeldaLateral - 2}mm;align-items:center;font-size:6.5px;color:${estilo.colorSuave};
          letter-spacing:.08em;text-transform:uppercase;">${
            logoCliente
              ? `<img src="${logoCliente}" alt="" style="${imagen}">`
              : esc(estilo.rotuloLogoCliente)
          }</div>
      </div>
    </div>`,
    footerTemplate: `<div style="box-sizing:border-box;width:100%;font-family:${fuente};font-size:6.5px;
        color:${estilo.colorSuave};padding:0 ${estilo.margenLateral}mm;">
      <div style="display:flex;justify-content:space-between;gap:6mm;align-items:baseline;
        border-top:1px solid ${estilo.colorBorde};padding-top:2mm;">
        <span style="flex:none;">${esc(direccion)}</span>
        <span style="flex:1;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;
          text-overflow:ellipsis;">${esc(referenciaPie)}</span>
        <span style="flex:none;">P\u00e1gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    </div>`,
  };
}
