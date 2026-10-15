import "server-only";
import { LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { fechaCorta } from "./acreditacion-modelo";
import { formatearPesos } from "./arranque-modelo";
import {
  pesosCompactos,
  type Atencion,
  type DocumentosDelTablero,
  type ModuloDelTablero,
  type ResumenDeAcreditacion,
  type ResumenDeArranqueDelTablero,
  type ResumenDeVehiculos,
  type SaludDelContrato,
  type Tono,
} from "./dashboard-modelo";
import { textoDePlazo } from "./plazos-modelo";

// El reporte del contrato en PDF: lo mismo que el tablero, para imprimir o mandar por correo.
//
// pdf-lib y no un navegador sin pantalla: no necesita Chromium (que en Vercel pesa más que la
// función) ni leer archivos de fuentes en tiempo de ejecución. A cambio todo se dibuja a mano:
// texto, barras y anillos. Por eso el diseño es sobrio y de una sola columna: legible en papel.
//
// Las fuentes estándar de PDF solo codifican Latin-1 (WinAnsi): tildes y eñes sí, flechas y signos
// raros no. `limpiar()` reemplaza lo que no cabe, en vez de dejar que pdf-lib falle a mitad del
// documento.

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 42;
const ANCHO_UTIL = A4.ancho - MARGEN * 2;

// La paleta de Pertec con los nombres de core-ih: «azul» es el naranjo de marca y «cian» el teal.
const COLOR = {
  azul: rgb(200 / 255, 82 / 255, 23 / 255),
  azulSuave: rgb(224 / 255, 122 / 255, 61 / 255),
  cian: rgb(0 / 255, 160 / 255, 128 / 255),
  tinta: rgb(23 / 255, 20 / 255, 17 / 255),
  gris: rgb(120 / 255, 113 / 255, 101 / 255),
  grisClaro: rgb(231 / 255, 225 / 255, 216 / 255),
  fondo: rgb(250 / 255, 248 / 255, 245 / 255),
  verde: rgb(16 / 255, 185 / 255, 129 / 255),
  ambar: rgb(217 / 255, 119 / 255, 6 / 255),
  rojo: rgb(220 / 255, 38 / 255, 38 / 255),
  blanco: rgb(1, 1, 1),
};

const DE_TONO: Record<Tono, ReturnType<typeof rgb>> = {
  ok: COLOR.verde,
  curso: COLOR.azulSuave,
  aviso: COLOR.ambar,
  critico: COLOR.rojo,
  neutro: COLOR.gris,
  marca: COLOR.azul,
};

const REEMPLAZOS: [RegExp, string][] = [
  [/→/g, "->"],
  [/←/g, "<-"],
  [/≈/g, "~"],
  [/−/g, "-"],
  [/[“”«»]/g, '"'],
  [/[‘’]/g, "'"],
  [/…/g, "..."],
  [/[•●▪]/g, "-"],
  [/✓/g, "ok"],
  [/ /g, " "],
];

/** Deja solo lo que una fuente estándar de PDF sabe dibujar (Latin-1 y unas pocas más). */
function limpiar(texto: string): string {
  let t = texto;
  for (const [re, por] of REEMPLAZOS) t = t.replace(re, por);
  // Lo que quede fuera de Latin-1 (más lo permitido de Windows-1252) se vuelve «?».
  return t.replace(/[^\x20-\x7E -ÿ€–—‘’“”•…]/g, "?");
}

export interface DatosDelReporte {
  contrato: { nombre: string; fechaInicio: string | null; administrador: string | null; cliente?: string | null };
  /** El logo de la empresa del contrato, si tiene. */
  logo?: { tipo: string; bytes: Buffer } | null;
  hoy: string;
  generadoPor: string;
  inicio: string | null;
  general: { porcentaje: number; medidos: number };
  salud: SaludDelContrato;
  modulos: ModuloDelTablero[];
  atenciones: Atencion[];
  documentos: DocumentosDelTablero | null;
  acreditacion: ResumenDeAcreditacion | null;
  vehiculos: ResumenDeVehiculos | null;
  logistica: ResumenDeArranqueDelTablero | null;
  gastos: ResumenDeArranqueDelTablero | null;
}

interface Tramo {
  etiqueta: string;
  valor: number;
  color: ReturnType<typeof rgb>;
}

/** Una página a la vez, con el cursor de arriba hacia abajo y saltos de página donde hacen falta. */
class Lienzo {
  private paginas: PDFPage[] = [];
  private pagina!: PDFPage;
  y = 0;

  private constructor(
    readonly doc: PDFDocument,
    readonly normal: PDFFont,
    readonly negrita: PDFFont,
    private readonly titulo: string,
    /** El cliente del contrato: va arriba a la derecha si no hay logo. */
    private readonly cliente: string | null,
    /** El logo de la empresa, arriba a la derecha en cada página (en core-ih, el de Codelco). */
    private readonly logo: PDFImage | null,
  ) {}

  static async crear(
    titulo: string,
    cliente: string | null,
    logo: { tipo: string; bytes: Buffer } | null = null,
  ): Promise<Lienzo> {
    const doc = await PDFDocument.create();
    doc.setTitle(limpiar(titulo));
    doc.setAuthor("Core Pertec");
    doc.setCreator("Core Pertec · Performance Technologies");
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
    // Un logo que no se puede incrustar no impide el reporte: se usa el nombre del cliente.
    const imagen = logo
      ? await (logo.tipo === "image/png" ? doc.embedPng(logo.bytes) : doc.embedJpg(logo.bytes)).catch(() => null)
      : null;
    const lienzo = new Lienzo(doc, normal, negrita, titulo, cliente, imagen);
    lienzo.nuevaPagina();
    return lienzo;
  }

  nuevaPagina(): void {
    this.pagina = this.doc.addPage([A4.ancho, A4.alto]);
    this.paginas.push(this.pagina);
    // La franja de marca de arriba, la misma en todas las páginas.
    this.pagina.drawRectangle({ x: 0, y: A4.alto - 14, width: A4.ancho, height: 14, color: COLOR.azul });
    this.pagina.drawRectangle({ x: 0, y: A4.alto - 17, width: A4.ancho * 0.22, height: 3, color: COLOR.cian });
    // El logo (o, sin logo, el cliente) arriba a la derecha, en TODAS las páginas: es de quien es
    // el contrato.
    if (this.logo) {
      const alto = 30;
      const ancho = Math.min((alto * this.logo.width) / this.logo.height, 120);
      const altoFinal = (ancho * this.logo.height) / this.logo.width;
      this.pagina.drawImage(this.logo, { x: A4.ancho - MARGEN - ancho, y: A4.alto - 22 - altoFinal, width: ancho, height: altoFinal });
    } else if (this.cliente) {
      const texto = limpiar(this.cliente).toUpperCase();
      const tamano = 9;
      const ancho = this.negrita.widthOfTextAtSize(texto, tamano);
      this.pagina.drawText(texto, { x: A4.ancho - MARGEN - ancho, y: A4.alto - 36, size: tamano, font: this.negrita, color: COLOR.gris });
    }
    this.y = A4.alto - 60;
  }

  /** Salta de página si no queda `alto` puntos hacia abajo. */
  asegurar(alto: number): void {
    if (this.y - alto < MARGEN + 24) this.nuevaPagina();
  }

  espacio(puntos: number): void {
    this.y -= puntos;
  }

  /** El ancho en puntos de un texto, para centrarlo o alinearlo. */
  ancho(texto: string, tamano: number, negrita = false): number {
    return (negrita ? this.negrita : this.normal).widthOfTextAtSize(limpiar(texto), tamano);
  }

  /** Divide un texto en líneas que quepan en `ancho`. */
  envolver(texto: string, ancho: number, tamano: number, fuente: PDFFont = this.normal): string[] {
    const salida: string[] = [];
    for (const parrafo of limpiar(texto).split("\n")) {
      let actual = "";
      for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho) actual = prueba;
        else {
          if (actual) salida.push(actual);
          actual = palabra;
        }
      }
      salida.push(actual);
    }
    return salida.length > 0 ? salida : [""];
  }

  /** Una línea de texto en (x, y); recorta con «...» si no cabe en `maxAncho`. */
  linea(
    texto: string,
    x: number,
    y: number,
    opciones: { tamano?: number; negrita?: boolean; color?: ReturnType<typeof rgb>; maxAncho?: number; derecha?: boolean } = {},
  ): void {
    const tamano = opciones.tamano ?? 9;
    const fuente = opciones.negrita ? this.negrita : this.normal;
    let t = limpiar(texto);
    if (opciones.maxAncho !== undefined) {
      while (t.length > 1 && fuente.widthOfTextAtSize(t, tamano) > opciones.maxAncho) t = t.slice(0, -1);
      if (t !== limpiar(texto)) t = `${t.slice(0, -1)}...`;
    }
    const xFinal = opciones.derecha ? x - fuente.widthOfTextAtSize(t, tamano) : x;
    this.pagina.drawText(t, { x: xFinal, y, size: tamano, font: fuente, color: opciones.color ?? COLOR.tinta });
  }

  /** Un párrafo; devuelve cuánto alto ocupó y mueve el cursor. */
  parrafo(
    texto: string,
    opciones: { tamano?: number; negrita?: boolean; color?: ReturnType<typeof rgb>; x?: number; ancho?: number; interlinea?: number } = {},
  ): void {
    const tamano = opciones.tamano ?? 9.5;
    const ancho = opciones.ancho ?? ANCHO_UTIL;
    const x = opciones.x ?? MARGEN;
    const lineas = this.envolver(texto, ancho, tamano, opciones.negrita ? this.negrita : this.normal);
    const paso = tamano * (opciones.interlinea ?? 1.35);
    for (const l of lineas) {
      this.asegurar(paso);
      this.linea(l, x, this.y - tamano, { tamano, negrita: opciones.negrita, color: opciones.color });
      this.y -= paso;
    }
  }

  /** Título de sección: ocupa su propia página si se lo pide. */
  seccion(texto: string, opciones: { nueva?: boolean; ayuda?: string } = {}): void {
    // Si no caben el título, su ayuda y la primera fila de contenido, la sección empieza en la página
    // siguiente: un título solo al pie de una hoja es peor que un hueco pequeño. Con el resto fluye
    // todo seguido, sin dejar medias hojas en blanco entre módulos.
    if (opciones.nueva) this.nuevaPagina();
    else {
      this.asegurar(130);
      // Aire entre un módulo y el siguiente cuando siguen en la misma hoja.
      if (this.y < A4.alto - 120) this.y -= 16;
    }
    this.linea(texto.toUpperCase(), MARGEN, this.y - 14, { tamano: 15, negrita: true, color: COLOR.azul });
    this.y -= 22;
    this.pagina.drawRectangle({ x: MARGEN, y: this.y, width: 36, height: 2.5, color: COLOR.cian });
    this.y -= 10;
    if (opciones.ayuda) {
      this.parrafo(opciones.ayuda, { tamano: 9, color: COLOR.gris });
      this.y -= 4;
    }
  }

  subtitulo(texto: string): void {
    this.asegurar(70);
    this.y -= 6;
    this.linea(texto.toUpperCase(), MARGEN, this.y - 9, { tamano: 8.5, negrita: true, color: COLOR.gris });
    this.y -= 18;
  }

  /** Una fila de cifras en cajas iguales. */
  cifras(cifras: { valor: string; etiqueta: string; tono?: Tono }[]): void {
    const alto = 46;
    this.asegurar(alto + 8);
    const separacion = 8;
    const ancho = (ANCHO_UTIL - separacion * (cifras.length - 1)) / cifras.length;
    cifras.forEach((c, i) => {
      const x = MARGEN + i * (ancho + separacion);
      this.pagina.drawRectangle({ x, y: this.y - alto, width: ancho, height: alto, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 0.6 });
      this.linea(c.valor, x + 9, this.y - 24, {
        tamano: 17,
        negrita: true,
        color: c.tono && c.tono !== "neutro" ? DE_TONO[c.tono] : COLOR.tinta,
        maxAncho: ancho - 14,
      });
      this.linea(c.etiqueta.toUpperCase(), x + 9, this.y - 38, { tamano: 6.8, negrita: true, color: COLOR.gris, maxAncho: ancho - 14 });
    });
    this.y -= alto + 10;
  }

  /** Una barra de avance fina. */
  barra(x: number, y: number, ancho: number, porcentaje: number, color: ReturnType<typeof rgb>, alto = 6): void {
    this.pagina.drawRectangle({ x, y, width: ancho, height: alto, color: COLOR.grisClaro });
    const lleno = Math.max(0, Math.min(1, porcentaje / 100)) * ancho;
    if (lleno > 0) this.pagina.drawRectangle({ x, y, width: lleno, height: alto, color });
  }

  /** Una barra partida en tramos, con su leyenda debajo. */
  barraPartida(tramos: Tramo[], opciones: { total?: number; formato?: (n: number) => string } = {}): void {
    const formato = opciones.formato ?? ((n: number) => String(n));
    const presentes = tramos.filter((t) => t.valor > 0);
    const total = opciones.total ?? presentes.reduce((n, t) => n + t.valor, 0);
    this.asegurar(44);
    const alto = 14;
    this.pagina.drawRectangle({ x: MARGEN, y: this.y - alto, width: ANCHO_UTIL, height: alto, color: COLOR.grisClaro });
    let x = MARGEN;
    if (total > 0) {
      for (const t of presentes) {
        const ancho = (t.valor / total) * ANCHO_UTIL;
        this.pagina.drawRectangle({ x, y: this.y - alto, width: ancho, height: alto, color: t.color });
        x += ancho;
      }
    }
    this.y -= alto + 10;

    // Leyenda en líneas que se parten solas.
    let lx = MARGEN;
    for (const t of tramos) {
      const texto = limpiar(`${t.etiqueta} ${formato(t.valor)}`);
      const w = this.normal.widthOfTextAtSize(texto, 8) + 16;
      if (lx + w > MARGEN + ANCHO_UTIL) {
        lx = MARGEN;
        this.y -= 11;
      }
      this.pagina.drawRectangle({ x: lx, y: this.y - 7, width: 6, height: 6, color: t.color });
      this.linea(texto, lx + 10, this.y - 6.5, { tamano: 8, color: COLOR.gris });
      lx += w + 8;
    }
    this.y -= 16;
  }

  /** Filas con etiqueta, barra y un texto a la derecha. */
  barrasHorizontales(
    filas: { etiqueta: string; detalle?: string; porcentaje: number; texto: string; tono?: Tono }[],
    opciones: { anchoDeEtiqueta?: number } = {},
  ): void {
    const anchoEtiqueta = opciones.anchoDeEtiqueta ?? 170;
    const anchoTexto = 86;
    const anchoBarra = ANCHO_UTIL - anchoEtiqueta - anchoTexto - 16;
    for (const f of filas) {
      this.asegurar(24);
      this.linea(f.etiqueta, MARGEN, this.y - 9, { tamano: 9, negrita: true, maxAncho: anchoEtiqueta });
      if (f.detalle) this.linea(f.detalle, MARGEN, this.y - 19, { tamano: 7, color: COLOR.gris, maxAncho: anchoEtiqueta });
      this.barra(MARGEN + anchoEtiqueta + 8, this.y - 12, anchoBarra, f.porcentaje, DE_TONO[f.tono ?? "curso"], 7);
      this.linea(f.texto, MARGEN + ANCHO_UTIL, this.y - 10, { tamano: 8.5, negrita: true, derecha: true, maxAncho: anchoTexto });
      this.y -= f.detalle ? 25 : 20;
    }
    this.y -= 4;
  }

  /** Una tabla simple: encabezado y filas con rayas. */
  tabla(
    columnas: { titulo: string; ancho: number; derecha?: boolean }[],
    filas: { celdas: string[]; tono?: Tono }[],
  ): void {
    const total = columnas.reduce((n, c) => n + c.ancho, 0);
    const escala = ANCHO_UTIL / total;
    const anchos = columnas.map((c) => c.ancho * escala);

    const encabezado = () => {
      this.asegurar(30);
      this.pagina.drawRectangle({ x: MARGEN, y: this.y - 16, width: ANCHO_UTIL, height: 16, color: COLOR.azul });
      let x = MARGEN;
      columnas.forEach((c, i) => {
        this.linea(c.titulo.toUpperCase(), c.derecha ? x + anchos[i] - 6 : x + 6, this.y - 11, {
          tamano: 7,
          negrita: true,
          color: COLOR.blanco,
          derecha: c.derecha,
          maxAncho: anchos[i] - 10,
        });
        x += anchos[i];
      });
      this.y -= 16;
    };

    encabezado();
    filas.forEach((fila, n) => {
      if (this.y - 18 < MARGEN + 24) {
        this.nuevaPagina();
        encabezado();
      }
      if (n % 2 === 1) this.pagina.drawRectangle({ x: MARGEN, y: this.y - 17, width: ANCHO_UTIL, height: 17, color: COLOR.fondo });
      let x = MARGEN;
      fila.celdas.forEach((celda, i) => {
        this.linea(celda, columnas[i].derecha ? x + anchos[i] - 6 : x + 6, this.y - 12, {
          tamano: 8.2,
          negrita: i === 0,
          derecha: columnas[i].derecha,
          maxAncho: anchos[i] - 10,
          color: fila.tono && i === columnas.length - 1 ? DE_TONO[fila.tono] : COLOR.tinta,
        });
        x += anchos[i];
      });
      this.y -= 17;
    });
    this.y -= 8;
  }

  /** El anillo de avance: un arco grueso sobre una pista. */
  anillo(cx: number, cy: number, radio: number, porcentaje: number, color: ReturnType<typeof rgb>, grosor = 11): void {
    this.pagina.drawCircle({ x: cx, y: cy, size: radio, borderColor: COLOR.grisClaro, borderWidth: grosor });
    const p = Math.max(0, Math.min(100, porcentaje));
    if (p >= 99.9) {
      this.pagina.drawCircle({ x: cx, y: cy, size: radio, borderColor: color, borderWidth: grosor });
    } else if (p > 0) {
      const t = (p / 100) * Math.PI * 2;
      const ex = radio * Math.sin(t);
      const ey = -radio * Math.cos(t);
      this.pagina.drawSvgPath(`M 0 ${-radio} A ${radio} ${radio} 0 ${t > Math.PI ? 1 : 0} 1 ${ex} ${ey}`, {
        x: cx,
        y: cy,
        borderColor: color,
        borderWidth: grosor,
        borderLineCap: LineCapStyle.Round,
      });
    }
  }

  /** Cuánto espacio libre queda hasta el pie. */
  get libre(): number {
    return this.y - (MARGEN + 24);
  }

  get paginaActual(): PDFPage {
    return this.pagina;
  }

  /** Los pies de página, con el número total ya conocido. */
  ponerPies(pie: string): void {
    const total = this.paginas.length;
    this.paginas.forEach((p, i) => {
      p.drawLine({ start: { x: MARGEN, y: MARGEN + 8 }, end: { x: A4.ancho - MARGEN, y: MARGEN + 8 }, thickness: 0.5, color: COLOR.grisClaro });
      p.drawText(limpiar(pie), { x: MARGEN, y: MARGEN - 4, size: 7.5, font: this.normal, color: COLOR.gris });
      const n = `Página ${i + 1} de ${total}`;
      p.drawText(n, { x: A4.ancho - MARGEN - this.normal.widthOfTextAtSize(n, 7.5), y: MARGEN - 4, size: 7.5, font: this.normal, color: COLOR.gris });
    });
  }

  async guardar(): Promise<Uint8Array> {
    return await this.doc.save();
  }
}

// -----------------------------------------------------------------------------
//  Las páginas
// -----------------------------------------------------------------------------

const TONO_DE_SALUD: Record<Tono, ReturnType<typeof rgb>> = DE_TONO;

function textoDelPlazo(m: ModuloDelTablero): string {
  return m.plazo ? `${fechaCorta(m.plazo.fecha)} · ${textoDePlazo(m.plazo)}` : "Sin fecha límite";
}

function tonoDePlazoDe(m: ModuloDelTablero): Tono {
  if (!m.plazo) return "neutro";
  return m.plazo.estado === "vencido" ? "critico" : m.plazo.estado === "por_vencer" || m.plazo.estado === "hoy" ? "aviso" : "neutro";
}

function portada(l: Lienzo, d: DatosDelReporte): void {
  l.linea("REPORTE DEL CONTRATO", MARGEN, l.y - 8, { tamano: 9, negrita: true, color: COLOR.azulSuave });
  l.y -= 20;
  l.linea(d.contrato.nombre, MARGEN, l.y - 22, { tamano: 26, negrita: true, color: COLOR.azul, maxAncho: ANCHO_UTIL });
  l.y -= 36;

  const meta = [`Emitido el ${fechaCorta(d.hoy)}`, d.inicio, d.contrato.administrador ? `Administra ${d.contrato.administrador}` : null]
    .filter(Boolean)
    .join("   ·   ");
  l.linea(meta, MARGEN, l.y - 8, { tamano: 9, color: COLOR.gris });
  l.y -= 26;

  // El anillo y el semáforo, lado a lado.
  const alto = 142;
  l.paginaActual.drawRectangle({ x: MARGEN, y: l.y - alto, width: ANCHO_UTIL, height: alto, color: COLOR.fondo, borderColor: COLOR.grisClaro, borderWidth: 0.6 });
  const cx = MARGEN + 76;
  const cy = l.y - 68;
  l.anillo(cx, cy, 44, d.general.medidos === 0 ? 0 : d.general.porcentaje, COLOR.azulSuave, 12);
  const porcentaje = d.general.medidos === 0 ? "-" : `${d.general.porcentaje}%`;
  l.linea(porcentaje, cx - l.ancho(porcentaje, 22, true) / 2, cy - 8, { tamano: 22, negrita: true, color: COLOR.azul });
  l.linea("AVANCE GENERAL", cx - l.ancho("AVANCE GENERAL", 7, true) / 2, cy - 62, { tamano: 7, negrita: true, color: COLOR.gris });

  const tx = MARGEN + 160;
  l.linea(d.salud.titulo, tx, l.y - 40, { tamano: 17, negrita: true, color: TONO_DE_SALUD[d.salud.tono] });
  const lineas = l.envolver(d.salud.frase, ANCHO_UTIL - 176, 10);
  lineas.slice(0, 4).forEach((t, i) => l.linea(t, tx, l.y - 60 - i * 14, { tamano: 10, color: COLOR.tinta }));
  l.linea(
    `${d.general.medidos} ${d.general.medidos === 1 ? "módulo medido" : "módulos medidos"}  ·  ${d.atenciones.length} ${d.atenciones.length === 1 ? "punto de atención" : "puntos de atención"}`,
    tx,
    l.y - alto + 16,
    { tamano: 8.5, color: COLOR.gris },
  );
  l.y -= alto + 18;

  l.subtitulo("Cómo va cada módulo");
  l.tabla(
    [
      { titulo: "Módulo", ancho: 150 },
      { titulo: "Avance", ancho: 52, derecha: true },
      { titulo: "Detalle", ancho: 118 },
      { titulo: "Fecha límite", ancho: 130 },
    ],
    d.modulos.map((m) => ({
      celdas: [
        m.nombre,
        m.avance.total === 0 ? "-" : `${m.avance.porcentaje}%`,
        m.avance.total === 0 ? "Sin datos" : `${m.avance.subidos} de ${m.avance.total} ${m.unidad}`,
        textoDelPlazo(m),
      ],
      tono: tonoDePlazoDe(m),
    })),
  );

  // Una barra por módulo, para verlo de un vistazo.
  for (const m of d.modulos) {
    l.asegurar(16);
    l.linea(m.nombre, MARGEN, l.y - 8, { tamano: 8, color: COLOR.gris, maxAncho: 150 });
    l.barra(MARGEN + 160, l.y - 9, ANCHO_UTIL - 200, m.avance.porcentaje, m.avance.porcentaje >= 100 ? COLOR.verde : COLOR.azulSuave, 6);
    l.linea(m.avance.total === 0 ? "-" : `${m.avance.porcentaje}%`, MARGEN + ANCHO_UTIL, l.y - 8.5, { tamano: 8.5, negrita: true, derecha: true });
    l.y -= 15;
  }
  l.y -= 10;

  l.subtitulo("Quién responde por cada módulo");
  const conResponsables = d.modulos.filter((m) => m.responsables !== undefined);
  if (conResponsables.length === 0) {
    l.parrafo("Los módulos con fecha límite todavía no tienen responsables asignados.", { color: COLOR.gris, tamano: 9 });
  } else {
    l.tabla(
      [
        { titulo: "Módulo", ancho: 160 },
        { titulo: "Responsables", ancho: 240 },
      ],
      conResponsables.map((m) => ({ celdas: [m.nombre, m.responsables && m.responsables.length > 0 ? m.responsables.join(", ") : "Sin responsable"] })),
    );
  }
}

function atencion(l: Lienzo, d: DatosDelReporte): void {
  l.seccion("Requiere atención", {
    ayuda: "Lo que ya se pasó o está por pasar, lo más urgente primero. Cada punto se resuelve en su módulo.",
  });
  if (d.atenciones.length === 0) {
    l.parrafo("No hay vencimientos, atrasos ni desvíos a la vista.", { color: COLOR.verde, negrita: true, tamano: 10 });
    return;
  }
  const criticas = d.atenciones.filter((a) => a.tono === "critico").length;
  l.cifras([
    { valor: String(d.atenciones.length), etiqueta: "Puntos en total" },
    { valor: String(criticas), etiqueta: "Ya se pasaron", tono: criticas > 0 ? "critico" : "neutro" },
    { valor: String(d.atenciones.length - criticas), etiqueta: "Por vencer o fuera de lo previsto", tono: "aviso" },
  ]);
  l.tabla(
    [
      { titulo: "Qué", ancho: 170 },
      { titulo: "Módulo", ancho: 90 },
      { titulo: "Detalle", ancho: 240 },
    ],
    d.atenciones.slice(0, 22).map((a) => ({
      celdas: [a.titulo, d.modulos.find((m) => m.clave === a.modulo)?.nombre ?? a.modulo, a.detalle],
      tono: a.tono,
    })),
  );
  if (d.atenciones.length > 22) {
    l.parrafo(`y ${d.atenciones.length - 22} más en los módulos.`, { color: COLOR.gris, tamano: 8.5 });
  }
}

function documentos(l: Lienzo, d: DatosDelReporte): void {
  l.seccion("Documentos generales", { ayuda: "Los requisitos de la carpeta de arranque en SharePoint y en qué etapa de revisión va cada uno." });
  const doc = d.documentos;
  if (!doc || doc.estado !== "ok") {
    l.parrafo(
      doc?.estado === "sin_conexion"
        ? "No se pudo leer SharePoint porque la cuenta de quien generó el reporte no está conectada. Conéctala desde Documentos generales y vuelve a generarlo."
        : "No se pudo leer SharePoint al generar el reporte.",
      { color: COLOR.gris },
    );
    return;
  }
  l.cifras([
    { valor: `${doc.total.porcentaje}%`, etiqueta: "Entregado", tono: doc.total.porcentaje >= 100 ? "ok" : "curso" },
    { valor: `${doc.total.subidos} de ${doc.total.total}`, etiqueta: "Requisitos" },
    { valor: String(doc.etapas.validado), etiqueta: "Validados", tono: "ok" },
    { valor: String(doc.etapas.pendiente), etiqueta: "Pendientes", tono: doc.etapas.pendiente > 0 ? "aviso" : "neutro" },
  ]);
  l.subtitulo("Por etapa de revisión");
  l.barraPartida([
    { etiqueta: "Pendiente", valor: doc.etapas.pendiente, color: COLOR.grisClaro },
    { etiqueta: "Borrador", valor: doc.etapas.borrador, color: rgb(129 / 255, 140 / 255, 248 / 255) },
    { etiqueta: "En revisión", valor: doc.etapas.en_revision, color: COLOR.ambar },
    { etiqueta: "Validado", valor: doc.etapas.validado, color: COLOR.verde },
  ]);
  l.subtitulo("Por grupo");
  l.barrasHorizontales(
    doc.grupos.map((g) => ({
      etiqueta: g.nombre,
      detalle: `${g.avance.subidos} de ${g.avance.total} requisitos`,
      porcentaje: g.avance.porcentaje,
      texto: `${g.avance.porcentaje}%`,
      tono: g.avance.porcentaje >= 100 ? "ok" : "curso",
    })),
  );
}

function acreditacion(l: Lienzo, r: ResumenDeAcreditacion): void {
  l.seccion("Acreditación Personas", { ayuda: "El recorrido de la gente que se contrata hasta tener su acreditación completa." });
  const d = r.dotacion;
  l.cifras([
    { valor: String(r.personas), etiqueta: "Registradas" },
    { valor: String(r.etapas.acreditada), etiqueta: "Acreditadas", tono: "ok" },
    { valor: d.meta === null ? String(d.contratadas) : `${d.contratadas}/${d.meta}`, etiqueta: "Con contrato / meta" },
    { valor: String(r.vencidos), etiqueta: "Docs vencidos", tono: r.vencidos > 0 ? "critico" : "neutro" },
    { valor: String(r.porVencer), etiqueta: "Por vencer", tono: r.porVencer > 0 ? "aviso" : "neutro" },
  ]);

  l.subtitulo("Recorrido de acreditación");
  const total = Math.max(r.personas, 1);
  l.barrasHorizontales([
    { etiqueta: "En la nómina", porcentaje: 100, texto: String(r.personas), tono: "marca" },
    { etiqueta: "Documentos al 100%", porcentaje: ((r.personas - r.etapas.documentacion) / total) * 100, texto: String(r.personas - r.etapas.documentacion), tono: "curso" },
    { etiqueta: "Acreditadas en Web Control", porcentaje: ((r.etapas.buk + r.etapas.acreditada) / total) * 100, texto: String(r.etapas.buk + r.etapas.acreditada), tono: "curso" },
    { etiqueta: "Creadas en BUK, completas", porcentaje: (r.etapas.acreditada / total) * 100, texto: String(r.etapas.acreditada), tono: "ok" },
  ]);

  if (d.porCargo.length > 0) {
    l.subtitulo("Dotación por cargo");
    l.barrasHorizontales(
      d.porCargo
        .slice()
        .sort((a, b) => b.requeridas - a.requeridas)
        .map((c) => ({
          etiqueta: c.nombre,
          detalle:
            (c.sinMeta ? "sin cantidad definida" : c.faltan > 0 ? `faltan ${c.faltan}` : c.sobran > 0 ? `${c.sobran} sobre la meta` : "meta cumplida") +
            (c.sinContrato > 0 ? ` · +${c.sinContrato} sin contrato` : ""),
          porcentaje: c.sinMeta || c.requeridas === 0 ? 0 : (c.contratadas / c.requeridas) * 100,
          texto: c.sinMeta ? String(c.contratadas) : `${c.contratadas}/${c.requeridas}`,
          tono: c.sinMeta || c.faltan > 0 ? "curso" : "ok",
        })),
    );
  }
  if (r.faltantes.length > 0) {
    l.subtitulo("Los documentos que más faltan");
    l.barrasHorizontales(
      r.faltantes.slice(0, 8).map((f) => ({
        etiqueta: f.nombre,
        porcentaje: f.exigido === 0 ? 0 : (f.faltan / f.exigido) * 100,
        texto: `${f.faltan} de ${f.exigido}`,
        tono: f.faltan === f.exigido ? "critico" : "aviso",
      })),
    );
  }

  // Cursos y exámenes: lo reservado, lo atrasado y cómo salió lo ya rendido.
  const c = r.capacitaciones;
  if (c.enCurso + c.realizadas > 0) {
    l.subtitulo("Cursos y exámenes");
    l.cifras([
      { valor: String(c.examenes), etiqueta: "Exámenes en curso" },
      { valor: String(c.cursos), etiqueta: "Cursos en curso" },
      { valor: String(c.atrasadas), etiqueta: "Atrasados", tono: c.atrasadas > 0 ? "critico" : "neutro" },
      { valor: String(c.estaSemana), etiqueta: "Esta semana", tono: c.estaSemana > 0 ? "aviso" : "neutro" },
      { valor: c.realizadas === 0 ? "-" : `${c.aprobadas}/${c.realizadas}`, etiqueta: "Aprobados", tono: c.reprobadas > 0 ? "aviso" : "ok" },
    ]);
  }
}

function vehiculos(l: Lienzo, r: ResumenDeVehiculos): void {
  l.seccion("Acreditación Vehículos", { ayuda: "La documentación de cada vehículo de la flota hasta su acreditación en Web Control." });
  const d = r.dotacion;
  l.cifras([
    { valor: String(r.vehiculos), etiqueta: "Activos" },
    { valor: String(r.etapas.acreditado), etiqueta: "Acreditados", tono: "ok" },
    { valor: d.meta === null ? "-" : `${d.contratadas}/${d.meta}`, etiqueta: "Flota requerida" },
    { valor: String(r.vencidos), etiqueta: "Docs vencidos", tono: r.vencidos > 0 ? "critico" : "neutro" },
    { valor: String(r.porVencer), etiqueta: "Por vencer", tono: r.porVencer > 0 ? "aviso" : "neutro" },
  ]);
  l.subtitulo("Recorrido de acreditación");
  const total = Math.max(r.vehiculos, 1);
  l.barrasHorizontales([
    { etiqueta: "En la flota", porcentaje: 100, texto: String(r.vehiculos), tono: "marca" },
    { etiqueta: "Documentos al 100%", porcentaje: ((r.vehiculos - r.etapas.documentacion) / total) * 100, texto: String(r.vehiculos - r.etapas.documentacion), tono: "curso" },
    { etiqueta: "Acreditados en Web Control", porcentaje: (r.etapas.acreditado / total) * 100, texto: String(r.etapas.acreditado), tono: "ok" },
  ]);
  if (r.porCategoria.length > 0) {
    l.subtitulo("Avance por tipo de vehículo");
    l.barrasHorizontales(
      r.porCategoria.map((c) => ({
        etiqueta: c.nombre,
        detalle: `${c.vehiculos} ${c.vehiculos === 1 ? "vehículo" : "vehículos"} · ${c.acreditados} acreditados`,
        porcentaje: c.porcentaje,
        texto: `${c.porcentaje}%`,
        tono: c.porcentaje >= 100 ? "ok" : "curso",
      })),
    );
  }
  if (r.faltantes.length > 0) {
    l.subtitulo("Los documentos que más faltan");
    l.barrasHorizontales(
      r.faltantes.slice(0, 8).map((f) => ({
        etiqueta: f.nombre,
        porcentaje: f.exigido === 0 ? 0 : (f.faltan / f.exigido) * 100,
        texto: `${f.faltan} de ${f.exigido}`,
        tono: f.faltan === f.exigido ? "critico" : "aviso",
      })),
    );
  }
}

const COLORES_DE_ESTADO = [COLOR.grisClaro, COLOR.cian, rgb(70 / 255, 140 / 255, 210 / 255), COLOR.azulSuave, COLOR.azul, COLOR.verde, rgb(156 / 255, 163 / 255, 175 / 255)];

function logistica(l: Lienzo, r: ResumenDeArranqueDelTablero): void {
  l.seccion("Logística", { ayuda: "Lo que hay que mover, alojar, alimentar y proveer para que el contrato arranque, y para cuándo." });
  const x = r.resumen;
  l.cifras([
    { valor: `${x.avance.porcentaje}%`, etiqueta: "Ejecutado", tono: x.avance.porcentaje >= 100 ? "ok" : "curso" },
    { valor: `${x.avance.subidos} de ${x.avance.total}`, etiqueta: "Requerimientos" },
    { valor: String(x.porIniciar), etiqueta: "Por solicitar" },
    { valor: String(x.alertas), etiqueta: "Atrasados", tono: x.alertas > 0 ? "critico" : "neutro" },
  ]);
  l.subtitulo("Por estado");
  l.barraPartida(r.porEstado.map((e, i) => ({ etiqueta: e.etiqueta, valor: e.cantidad, color: COLORES_DE_ESTADO[Math.min(i, COLORES_DE_ESTADO.length - 1)] })));
  if (r.porCategoria.length > 0) {
    l.subtitulo("Por categoría");
    const max = Math.max(...r.porCategoria.map((c) => c.partidas), 1);
    l.barrasHorizontales(r.porCategoria.map((c) => ({ etiqueta: c.nombre, porcentaje: (c.partidas / max) * 100, texto: String(c.partidas), tono: "curso" })));
  }
  if (r.proximas.length > 0) {
    l.subtitulo("Próximos requerimientos");
    l.tabla(
      [
        { titulo: "Requerimiento", ancho: 210 },
        { titulo: "Categoría", ancho: 120 },
        { titulo: "Fecha", ancho: 70 },
        { titulo: "Cuándo", ancho: 70, derecha: true },
      ],
      r.proximas.map((p) => ({
        celdas: [
          p.descripcion,
          p.categoria,
          p.fecha ? fechaCorta(p.fecha) : "Sin fecha",
          p.dias === null ? "-" : p.dias < 0 ? `hace ${-p.dias} d` : p.dias === 0 ? "hoy" : `en ${p.dias} d`,
        ],
        tono: p.dias !== null && p.dias < 0 ? "critico" : p.dias !== null && p.dias <= 7 ? "aviso" : "neutro",
      })),
    );
  }
}

function gastos(l: Lienzo, r: ResumenDeArranqueDelTablero): void {
  l.seccion("Gastos de arranque", { ayuda: "El presupuesto contra lo comprometido y lo pagado. Todos los montos son netos, sin IVA." });
  const p = r.presupuesto;
  if (!p) {
    const x = r.resumen;
    l.cifras([
      { valor: pesosCompactos(x.presupuestado), etiqueta: "Estimado" },
      { valor: pesosCompactos(x.real), etiqueta: "Registrado" },
      { valor: pesosCompactos(x.cerrado), etiqueta: "Pagado", tono: "ok" },
    ]);
    l.parrafo("Todavía no se define un presupuesto total para Gastos de arranque.", { color: COLOR.gris });
    return;
  }

  l.cifras([
    { valor: p.total === null ? "Sin definir" : pesosCompactos(p.total), etiqueta: "Presupuesto" },
    { valor: pesosCompactos(p.comprometido), etiqueta: "Comprometido" },
    { valor: pesosCompactos(p.pagado), etiqueta: "Pagado", tono: "ok" },
    { valor: p.disponible === null ? "-" : pesosCompactos(p.disponible), etiqueta: "Disponible", tono: p.disponible !== null && p.disponible < 0 ? "critico" : "neutro" },
    { valor: pesosCompactos(p.proyectado), etiqueta: "Proyectado", tono: p.enRiesgo ? "critico" : "neutro" },
  ]);
  l.barraPartida(
    [
      { etiqueta: "Pagado", valor: p.pagado, color: COLOR.verde },
      { etiqueta: "Comprometido sin pagar", valor: Math.max(0, p.comprometido - p.pagado), color: COLOR.azulSuave },
      { etiqueta: "Por comprometer", valor: p.porComprometer, color: COLOR.cian },
      { etiqueta: "Disponible", valor: p.total === null ? 0 : Math.max(0, p.total - p.proyectado), color: COLOR.grisClaro },
    ],
    { formato: pesosCompactos },
  );
  if (p.enRiesgo && p.disponibleProyectado !== null) {
    l.parrafo(`Con las mejores cotizaciones el gasto supera el presupuesto en ${formatearPesos(-p.disponibleProyectado)}.`, { color: COLOR.rojo, negrita: true, tamano: 9.5 });
    l.espacio(4);
  }

  const items = p.items.filter((i) => i.presupuesto !== null || i.lineas > 0).sort((a, b) => b.proyectado - a.proyectado);
  if (items.length > 0) {
    l.subtitulo("Por ítem: proyectado contra presupuesto");
    l.barrasHorizontales(
      items.map((i) => ({
        etiqueta: i.nombre,
        detalle: `${i.lineas} ${i.lineas === 1 ? "línea" : "líneas"}${i.sobre ? " · sobre presupuesto" : ""}`,
        // La barra es lo PROYECTADO contra el presupuesto: es lo que dice si el ítem se va a pasar.
        porcentaje: i.presupuesto && i.presupuesto > 0 ? Math.min(100, (i.proyectado / i.presupuesto) * 100) : 0,
        texto: `${pesosCompactos(i.comprometido)}${i.presupuesto !== null ? ` / ${pesosCompactos(i.presupuesto)}` : ""}`,
        tono: i.sobre ? "critico" : "curso",
      })),
      { anchoDeEtiqueta: 150 },
    );
  }

  l.subtitulo("Cotizaciones");
  const c = p.pendientes;
  l.cifras([
    { valor: String(c.esperandoRespuesta), etiqueta: "Esperando respuesta", tono: c.esperandoRespuesta > 0 ? "aviso" : "neutro" },
    { valor: String(c.respuestaAtrasada), etiqueta: "Sin respuesta a tiempo", tono: c.respuestaAtrasada > 0 ? "critico" : "neutro" },
    { valor: String(c.porVencer), etiqueta: "Precios por vencer", tono: c.porVencer > 0 ? "aviso" : "neutro" },
    { valor: pesosCompactos(p.ahorroLogrado), etiqueta: "Ahorro por comparar", tono: p.ahorroLogrado > 0 ? "ok" : "neutro" },
  ]);

  l.subtitulo("Líneas por estado");
  l.barraPartida(r.porEstado.map((e, i) => ({ etiqueta: e.etiqueta, valor: e.cantidad, color: COLORES_DE_ESTADO[Math.min(i, COLORES_DE_ESTADO.length - 1)] })));
}

/**
 * Arma el PDF del reporte del contrato.
 *
 * Recibe los datos ya leídos y calculados (los mismos que el tablero), así que se puede probar con
 * datos de ejemplo sin tocar la base ni SharePoint. Solo incluye los módulos que vienen con datos:
 * quien no tiene un módulo no lo ve en su reporte, igual que en el tablero.
 */
export async function generarReportePdf(d: DatosDelReporte): Promise<Uint8Array> {
  const l = await Lienzo.crear(`Reporte del contrato ${d.contrato.nombre}`, d.contrato.cliente ?? null, d.logo ?? null);

  portada(l, d);
  atencion(l, d);
  if (d.documentos) documentos(l, d);
  if (d.acreditacion) acreditacion(l, d.acreditacion);
  if (d.vehiculos) vehiculos(l, d.vehiculos);
  if (d.logistica) logistica(l, d.logistica);
  if (d.gastos) gastos(l, d.gastos);

  l.ponerPies(`Core Pertec · ${d.contrato.nombre} · generado el ${fechaCorta(d.hoy)} por ${d.generadoPor}`);
  return await l.guardar();
}
