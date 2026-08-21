import type { EmpresaIdentidad } from "@/lib/cotizador/empresas";
import type { OfertaCanonica, TotalesOferta } from "./tipos";
import { ESTILO_PERTEC, type EstiloMaestro } from "./estilo";
import { SIN_LOGOS, logoSeguro, type LogosDocumento } from "./logo";

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
}

const clp = (n: number) => "$ " + Math.round(n).toLocaleString("es-CL") + ".-";

/** Escapa todo lo que viene del borrador. */
function esc(valor: unknown): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Filas de una tabla simple etiqueta/valor, salteando las vacías. */
function filasEtiqueta(pares: [string, string | null][]): string {
  return (
    pares
      // `!= null` cubre también el ausente: el modelo omite lo que el documento no
      // trae, y con la comparación estricta una clave que falta imprimía la palabra
      // "undefined" en la tabla de identificación.
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => `<tr><th class="etiqueta">${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join("")
  );
}

/** Lista de hitos con el numeral en naranjo, como el maestro. */
function hitos(items: string[]): string {
  return `<ol class="hitos">${items
    .map(
      (t, i) =>
        `<li><span class="numeral">${String(i + 1).padStart(2, "0")}</span><span>${esc(t)}</span></li>`,
    )
    .join("")}</ol>`;
}

/**
 * Arma las secciones que SÍ aplican, en orden, y les asigna su número.
 *
 * Esta función es la que hace innecesario "renumerar": el número de cada sección
 * es su posición en esta lista, calculada al momento de generar el PDF.
 */
function armarSecciones(oferta: OfertaCanonica, totales: TotalesOferta): SeccionArmada[] {
  const secciones: SeccionArmada[] = [];
  const agregar = (titulo: string, cuerpo: string) =>
    secciones.push({ numero: String(secciones.length + 1), titulo, cuerpo });

  const id = oferta.identificacion;
  agregar(
    "Identificación de la oferta",
    `<table class="datos">${filasEtiqueta([
      ["Oferta N°", id.numeroOferta],
      ["Fecha", id.fecha],
      ["Validez", id.validez],
      ["Cliente", id.cliente],
      ["Atención", id.atencion],
      ["Copia", id.copia],
      ["Referencia", id.referencia],
      ["Faena", id.faena],
    ])}</table>`,
  );

  if (oferta.alcance) {
    const a = oferta.alcance;
    let cuerpo = a.introduccion ? `<p>${esc(a.introduccion)}</p>` : "";
    if (a.actividades.length) {
      cuerpo += `<h3>Actividades comprendidas</h3>${hitos(a.actividades)}`;
    }
    if (a.trabajosPrevios.length) {
      cuerpo += `<h3>Trabajos previos considerados</h3>${hitos(a.trabajosPrevios)}`;
    }
    if (a.personalEspecialista.length) {
      cuerpo +=
        `<h3>Personal especialista considerado</h3>` +
        tablaDotacion(a.personalEspecialista, totales.dotacionTotal, false);
    }
    if (cuerpo) agregar("Alcance del servicio", cuerpo);
  }

  if (oferta.metodologia) {
    const m = oferta.metodologia;
    let cuerpo = "";
    if (m.antesDeLaDetencion.length) {
      cuerpo += `<h3>Antes de la detención de planta</h3>${hitos(m.antesDeLaDetencion)}`;
    }
    if (m.duranteLaDetencion.length) {
      cuerpo += `<h3>Durante la detención de planta</h3>${hitos(m.duranteLaDetencion)}`;
    }
    if (cuerpo) agregar("Metodología y secuencia de trabajo", cuerpo);
  }

  if (oferta.especificaciones?.length) {
    agregar(
      "Especificaciones técnicas y equipo",
      `<table class="tabla"><colgroup><col style="width:34%"><col></colgroup>
        <thead><tr><th>Parámetro</th><th>Especificación</th></tr></thead>
        <tbody>${oferta.especificaciones
          // Igual que las tarjetas: sin parámetro, la fila no existe.
          .filter((e) => e.parametro.trim() !== "")
          .map((e) => `<tr><td>${esc(e.parametro)}</td><td>${esc(e.especificacion)}</td></tr>`)
          .join("")}</tbody></table>`,
    );
  }

  if (oferta.organizacion) {
    const o = oferta.organizacion;
    let cuerpo = o.nota ? `<p>${esc(o.nota)}</p>` : "";
    if (o.cuadroPersonal.length) {
      cuerpo += `<h3>Cuadro de personal</h3>${tablaDotacion(o.cuadroPersonal, totales.dotacionTotal, true)}`;
    }
    // Una responsabilidad sin cargo no se dibuja: vaciar el cargo en el editor es
    // la forma de sacar una tarjeta que quedó de otra oferta.
    const responsabilidades = o.responsabilidades.filter((r) => r.cargo.trim() !== "");
    if (responsabilidades.length) {
      cuerpo +=
        `<h3>Organización del servicio</h3><div class="tarjetas">` +
        responsabilidades
          .map(
            (r, i) =>
              `<div class="tarjeta ${i % 2 === 0 ? "naranjo" : "teal"}">
                 <p class="cargo">${esc(r.cargo)}</p><p>${esc(r.descripcion)}</p></div>`,
          )
          .join("") +
        `</div>`;
    }
    if (cuerpo) agregar("Dotación y organización del servicio", cuerpo);
  }

  if (oferta.programa?.turnos.length) {
    const p = oferta.programa;
    let acumulado = 0;
    agregar(
      "Programa y plazos",
      (p.introduccion ? `<p>${esc(p.introduccion)}</p>` : "") +
        `<table class="tabla"><colgroup><col style="width:14%"><col style="width:28%"><col style="width:12%"><col></colgroup>
          <thead><tr><th>Turno</th><th>Jornada</th><th class="num">Horas</th><th>Avance acumulado</th></tr></thead>
          <tbody>${p.turnos
            .map((t) => {
              acumulado += t.horas;
              const ancho = Math.round((acumulado / totales.horasPrograma) * 100);
              return `<tr><td>${esc(t.turno)}</td><td>${esc(t.jornada)}</td><td class="num">${esc(t.horas)}</td>
                <td><span class="barra"><span style="width:${ancho}%"></span></span>
                <span class="avance">${esc(acumulado)} h de ${esc(totales.horasPrograma)} h</span></td></tr>`;
            })
            .join("")}
            <tr class="total"><td>Total</td>
              <td>${esc(totales.cantidadTurnos)} turno${totales.cantidadTurnos === 1 ? "" : "s"}</td>
              <td class="num">${esc(totales.horasPrograma)}</td><td></td></tr>
          </tbody></table>` +
        (p.nota ? `<p class="nota">${esc(p.nota)}</p>` : ""),
    );
  }

  if (oferta.precio?.lineas.length) {
    const pr = oferta.precio;
    agregar(
      "Precio del servicio",
      `<table class="tabla precios">
        <colgroup><col style="width:6%"><col style="width:8%"><col><col style="width:10%"><col style="width:15%"><col style="width:15%"></colgroup>
        <thead><tr><th>Ít</th><th class="num">Cant</th><th>Cargo</th><th>Un</th><th class="num">V. Unit</th><th class="num">V. Total</th></tr></thead>
        <tbody>${pr.lineas
          .map(
            (l, i) =>
              `<tr><td>${i + 1}.</td><td class="num">${esc(String(l.cantidad).padStart(2, "0"))}</td>
               <td>${esc(l.cargo)}</td><td>${esc(l.unidad)}</td>
               <td class="num">${clp(l.valorUnitario)}</td>
               <td class="num">${clp(l.cantidad * l.valorUnitario)}</td></tr>`,
          )
          .join("")}
          <tr class="total"><td colspan="5">Total neto — no incluye IVA</td>
            <td class="num">${clp(totales.totalNetoCalculado)}</td></tr>
        </tbody></table>` +
        `<p class="nota">${esc(pr.nota ?? "Valores en pesos chilenos, netos. Los precios ofrecidos no incluyen IVA.")}</p>`,
    );
  }

  if (oferta.condicionesComerciales?.length) {
    agregar("Condiciones comerciales", hitos(oferta.condicionesComerciales));
  }

  if (oferta.aportes && (oferta.aportes.pertec.length || oferta.aportes.cliente.length)) {
    const columna = (titulo: string, items: string[]) =>
      `<div class="columna"><p class="cabecera">${esc(titulo)}</p>
         <ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
    agregar(
      "Aportes de las partes",
      `<div class="aportes">${columna("Aportes de PERTEC", oferta.aportes.pertec)}${columna(
        `Aportes del cliente`,
        oferta.aportes.cliente,
      )}</div>`,
    );
  }

  if (oferta.cierre) {
    const c = oferta.cierre;
    agregar(
      "Cierre y firma",
      (c.texto ? `<p>${esc(c.texto)}</p>` : "") +
        `<div class="firmas">${c.firmantes
          .map(
            (f) =>
              `<div class="firma"><span class="linea"></span><p class="nombre">${esc(f.nombre)}</p>
                 <p class="cargo">${esc(f.cargo)}${f.empresa ? `<br>${esc(f.empresa)}` : ""}</p></div>`,
          )
          .join("")}</div>` +
        (c.cc ? `<p class="cc">${esc(c.cc)}</p>` : ""),
    );
  }

  return secciones;
}

function tablaDotacion(
  filas: { cargo: string; dotacion: number; regimen?: string | null }[],
  total: number,
  conRegimen: boolean,
): string {
  const columnas = conRegimen
    ? `<colgroup><col><col style="width:16%"><col style="width:30%"></colgroup>`
    : `<colgroup><col><col style="width:20%"></colgroup>`;
  const encabezado = conRegimen
    ? `<tr><th>Cargo</th><th class="num">Dotación</th><th>Régimen</th></tr>`
    : `<tr><th>Cargo</th><th class="num">Dotación</th></tr>`;
  return `<table class="tabla">${columnas}<thead>${encabezado}</thead><tbody>${filas
    .map(
      (f) =>
        `<tr><td>${esc(f.cargo)}</td><td class="num">${esc(f.dotacion)}</td>${
          conRegimen ? `<td>${esc(f.regimen ?? "")}</td>` : ""
        }</tr>`,
    )
    .join("")}<tr class="total"><td>Total</td><td class="num">${esc(total)}</td>${
    conRegimen ? "<td></td>" : ""
  }</tr></tbody></table>`;
}

/** El anexo: se numera con letra, no con número, igual que en el maestro. */
function armarAnexo(anexo: OfertaCanonica["anexo"]): SeccionArmada | null {
  if (!anexo) return null;
  let cuerpo = "";
  if (anexo.respaldoInstitucional.length) {
    cuerpo +=
      `<h3>Respaldo institucional</h3>` + anexo.respaldoInstitucional.map((p) => `<p>${esc(p)}</p>`).join("");
  }
  if (anexo.mandantes.length) {
    cuerpo +=
      `<h3>Principales mandantes y contratos ejecutados con nuestro personal</h3>` +
      `<div class="mandantes">${anexo.mandantes.map((m) => `<span>${esc(m)}</span>`).join("")}</div>`;
  }
  if (anexo.notaEquipo) cuerpo += `<p>${esc(anexo.notaEquipo)}</p>`;
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
): string {
  const secciones = armarSecciones(oferta, totales);
  const anexo = armarAnexo(oferta.anexo);
  const todas = anexo ? [...secciones, anexo] : secciones;
  const id = oferta.identificacion;

  const referenciaPie = [id.numeroOferta, oferta.titulo].filter(Boolean).join(" · ");
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
    font-size: 9px; text-transform: uppercase; color: ${estilo.colorTinta}; }
  .header .centro { flex: 1; border-right: 1px solid ${estilo.colorBorde}; flex-direction: row;
    align-items: center; justify-content: space-between; }
  .header .cliente { width: ${estilo.anchoCeldaLateral}mm; align-items: center; justify-content: center;
    color: ${estilo.colorSuave}; font-size: 8px; text-transform: uppercase; letter-spacing: .08em; }
  /* Con max-width y max-height y sin dimensiones propias, el navegador escala la
     imagen conservando la proporción: un logo apaisado y uno cuadrado caben los
     dos en la celda sin deformarse. align-self evita que el flex lo estire. */
  .header img { max-width: 100%; max-height: ${estilo.altoHeader - 8}mm; }
  .header .marca img { align-self: flex-start; }
  .header .cliente img { align-self: center; }
  .header .empresa { font-weight: 700; font-size: 11px; }
  .header .rut { color: ${estilo.colorSuave}; font-size: 8.5px; }
  .header .oferta { text-align: right; font-size: 9px; color: ${estilo.colorSuave}; }
  .header .oferta b { color: ${estilo.colorTinta}; }

  .footer {
    margin-top: 10mm; border-top: 1px solid ${estilo.colorBorde}; padding-top: 2mm;
    display: flex; justify-content: space-between; gap: 6mm;
    font-size: 7.5px; color: ${estilo.colorSuave};
  }

  h2 { font-size: ${estilo.tamanoTitulo}px; font-family: ${estilo.fuenteTitulos}; text-transform: uppercase; letter-spacing: -.01em; margin: 9mm 0 3mm;
       padding-bottom: 2mm; border-bottom: 1.6px solid ${estilo.colorTinta}; display: flex; gap: 4mm;
       align-items: baseline; page-break-after: avoid; }
  h2 .n { color: ${estilo.colorAcento}; font-weight: 700; }
  h2:first-of-type { margin-top: 0; }
  h3 { font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; margin: 5mm 0 2mm;
       page-break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  p.nota { color: ${estilo.colorSuave}; font-size: 8.5px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  .datos th.etiqueta { width: 32%; text-align: left; vertical-align: top; padding: 2mm 3mm;
    background: ${estilo.colorFondoSuave}; color: ${estilo.colorSuave}; font-size: 8px; text-transform: uppercase;
    letter-spacing: .06em; font-weight: 600; }
  .datos td { padding: 2mm 3mm; background: ${estilo.colorFondoSuave}; }
  /* Separador por contraste con el fondo de la fila, no un blanco fijo: con un
     maestro de paleta oscura un blanco acá sería una raya. */
  .datos tr + tr th, .datos tr + tr td { border-top: 1px solid ${estilo.colorCabeceraTexto}; }

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

  ol.hitos { list-style: none; margin: 0 0 3mm; padding: 0; }
  ol.hitos li { display: flex; gap: 3mm; padding: 1.6mm 0; border-top: 1px solid ${estilo.colorFondoTotal};
    page-break-inside: avoid; }
  ol.hitos li:first-child { border-top: 0; }
  ol.hitos .numeral { color: ${estilo.colorAcento}; font-weight: 700; font-size: 9px; min-width: 6mm; }

  .tarjetas { display: flex; flex-wrap: wrap; gap: 3mm; }
  .tarjeta { flex: 1 1 46%; border: 1px solid ${estilo.colorFondoTotal}; border-left-width: 2.5mm; padding: 2.5mm 3mm;
    page-break-inside: avoid; }
  .tarjeta.naranjo { border-left-color: ${estilo.colorAcento}; }
  .tarjeta.teal { border-left-color: ${estilo.colorAcentoAlterno}; }
  .tarjeta .cargo { text-transform: uppercase; font-size: 8.5px; letter-spacing: .05em;
    font-weight: 700; margin-bottom: 1mm; }

  .aportes { display: flex; gap: 4mm; }
  .aportes .columna { flex: 1; }
  .aportes .cabecera { background: ${estilo.colorCabecera}; color: ${estilo.colorCabeceraTexto}; padding: 2mm 3mm; font-size: 8px;
    text-transform: uppercase; letter-spacing: .06em; font-weight: 600; margin: 0; }
  .aportes ul { list-style: none; margin: 0; padding: 0; }
  .aportes li { padding: 2mm 3mm; page-break-inside: avoid; }
  .aportes li:nth-child(even) { background: ${estilo.colorFondoSuave}; }

  .firmas { display: flex; gap: 12mm; margin-top: 18mm; page-break-inside: avoid; }
  .firmas .firma { flex: 1; }
  .firmas .linea { display: block; border-top: 1px solid ${estilo.colorTinta}; margin-bottom: 1.5mm; }
  .firmas .nombre { font-weight: 700; margin: 0; }
  .firmas .cargo { color: ${estilo.colorSuave}; margin: 0; font-size: 9px; }
  .cc { color: ${estilo.colorSuave}; font-size: 8.5px; margin-top: 8mm; }

  .mandantes { display: flex; flex-wrap: wrap; gap: 0 6mm; }
  .mandantes span { flex: 0 0 calc(33.333% - 4mm); border-bottom: 1px solid ${estilo.colorFondoTotal};
    padding: 2mm 0; }

  .indice { margin-bottom: 4mm; }
  .indice li { display: flex; gap: 4mm; padding: 1.6mm 0; border-top: 1px solid ${estilo.colorFondoTotal}; list-style: none; }
  .indice .n { color: ${estilo.colorAcento}; font-weight: 700; min-width: 6mm; }
  .portada { page-break-after: always; }
  /* En la portada el logo va grande: es la única página que alguien mira antes
     de leer nada. */
  .portada .logo { margin-bottom: 9mm; }
  .portada .logo img { max-height: 20mm; max-width: 90mm; }
  .portada .rotulo { color: ${estilo.colorAcento}; font-size: 8.5px; letter-spacing: .16em;
    text-transform: uppercase; margin-bottom: 3mm; }
  .portada h1 { font-size: ${estilo.tamanoPortada}px; font-family: ${estilo.fuenteTitulos}; line-height: 1.08; text-transform: uppercase; margin: 0 0 3mm; }
  .portada .faena { color: ${estilo.colorSuave}; font-size: 13px; margin-bottom: 14mm; }

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
      <div><div class="empresa">${esc(empresa.razonSocial)}</div>
           <div class="rut">RUT ${esc(empresa.rut)}</div></div>
      <div class="oferta">Oferta <b>${esc(id.numeroOferta ?? "—")}</b><br>Fecha <b>${esc(id.fecha ?? "—")}</b></div>
    </div>
    <div class="cliente">${
      logoCliente ? `<img src="${logoCliente}" alt="">` : esc(estilo.rotuloLogoCliente)
    }</div>
  </div>

  <div class="footer">
    <span>${esc([empresa.direccion, empresa.ciudad].filter(Boolean).join(", "))}</span>
    <span>${esc(referenciaPie)}</span>
    <span>Vista en pantalla</span>
  </div>

  <section class="portada">
    ${logoCasa ? `<div class="logo"><img src="${logoCasa}" alt=""></div>` : ""}
    <p class="rotulo">Oferta técnica y económica</p>
    <h1>${esc(oferta.titulo)}</h1>
    ${id.faena ? `<p class="faena">${esc(id.faena)}</p>` : ""}
    <table class="datos">${filasEtiqueta([
      ["Oferta N°", id.numeroOferta],
      ["Fecha", id.fecha],
      ["Cliente", id.cliente],
      ["Preparado por", `${empresa.razonSocial} · RUT ${empresa.rut}`],
    ])}</table>

    <h2><span class="n">·</span> Índice de contenidos</h2>
    <ul class="indice">${todas
      .map((s) => `<li><span class="n">${esc(s.numero)}</span><span>${esc(s.titulo)}</span></li>`)
      .join("")}</ul>
  </section>

  ${todas
    .map(
      (s) =>
        `<section><h2><span class="n">${esc(s.numero)}</span> ${esc(s.titulo)}</h2>${s.cuerpo}</section>`,
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
 * Dos cosas propias de estas plantillas que no se adivinan: heredan
 * `font-size: 0`, así que hay que declararlo en cada elemento, y no cargan CSS
 * externo, así que todo va en línea.
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
  // Estas cajas no cargan CSS externo, así que el escalado de la imagen también
  // va en línea. El alto se ata al del encabezado para que un maestro con
  // encabezado bajo no deje el logo colgando fuera de la celda.
  const imagen = `max-width:100%;max-height:${estilo.altoHeader - 9}mm;`;
  const referenciaPie = [id.numeroOferta, oferta.titulo].filter(Boolean).join(" \u00b7 ");
  const direccion = [empresa.direccion, empresa.ciudad].filter(Boolean).join(", ");
  const celda = "padding:2mm 3mm;display:flex;flex-direction:column;justify-content:center;";

  return {
    headerTemplate: `<div style="width:100%;font-family:${estilo.fuenteCuerpo};color:${estilo.colorTinta};
        padding:0 ${estilo.margenLateral}mm;-webkit-print-color-adjust:exact;">
      <div style="display:flex;border:1px solid ${estilo.colorBorde};height:${estilo.altoHeader - 2}mm;">
        <div style="${celda}width:${estilo.anchoCeldaLateral - 2}mm;border-right:1px solid ${estilo.colorBorde};font-size:7px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;">${
            logoCasa
              ? `<img src="${logoCasa}" alt="" style="${imagen}align-self:flex-start;">`
              : esc(empresa.nombre)
          }</div>
        <div style="${celda}flex:1;border-right:1px solid ${estilo.colorBorde};flex-direction:row;
          align-items:center;justify-content:space-between;">
          <div><div style="font-size:9px;font-weight:700;">${esc(empresa.razonSocial)}</div>
            <div style="font-size:7px;color:${estilo.colorSuave};">RUT ${esc(empresa.rut)}</div></div>
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
    footerTemplate: `<div style="width:100%;font-family:${estilo.fuenteCuerpo};font-size:6.5px;
        color:${estilo.colorSuave};padding:0 ${estilo.margenLateral}mm;">
      <div style="display:flex;justify-content:space-between;gap:6mm;border-top:1px solid ${estilo.colorBorde};
        padding-top:2mm;">
        <span>${esc(direccion)}</span>
        <span>${esc(referenciaPie)}</span>
        <span>P\u00e1gina <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    </div>`,
  };
}
