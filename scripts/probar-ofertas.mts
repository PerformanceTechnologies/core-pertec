/**
 * Los controles de una oferta técnica, con los errores que de verdad traen los
 * borradores.
 *
 * Correr con:  npm run probar-ofertas
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  calcularTotales,
  celdaANumero,
  detectarInconsistencias,
  mismoNumeroDeOferta,
  revisarTablas,
} from "../lib/ofertas/verificar";
import {
  TIPOS_DE_DOCUMENTO,
  tieneSeccionesDeOferta,
  type Inconsistencia,
  type OfertaCanonica,
} from "../lib/ofertas/tipos";
import {
  PREFIJO_DE_TIPO,
  avisoDeCodigoAutomatico,
  completarIdentidad,
  fechaEnPalabras,
  numeroDeCodigo,
  siguienteCodigo,
} from "../lib/ofertas/identidad";
import { ESTILO_PERTEC, sanearEstilo } from "../lib/ofertas/estilo";
import { imagenSegura, logoSeguro } from "../lib/ofertas/logo";
import { avisoDeTamano, leerRespuesta } from "../lib/subidas";
import {
  armarOferta,
  conElRepartoDe,
  contenidoDuplicado,
  sinLaImagen,
  armarDocumentoLibre,
  conLaDisposicion,
  conLaImagenEn,
  conLaImagenMovida,
  type LecturaLetra,
  type LecturaNumeros,
} from "../lib/ofertas/normalizar";
import {
  AIRE_TOLERADO_MM,
  CARACTERES_POR_MM,
  ROTULOS,
  medidaFlotante,
  cuerpoDeTabla,
  ofertaAHtml,
  plantillasDeImpresion,
  referenciaDePie,
} from "../lib/ofertas/plantilla";
import { esFirma, leerDestino, textoDeFirma } from "../lib/ofertas/destino-imagen";
import { puedeVerOferta } from "../lib/ofertas/permisos";
import { disposicionDe } from "../lib/ofertas/tipos";
import {
  claveDeRevision,
  conLaMarca,
  conRevision,
  cuantasPendientes,
  revisadasVigentes,
} from "../lib/ofertas/revisiones";
import { FILTROS_VACIOS, filtrarOfertas, hayFiltros, type FiltrosDeOfertas } from "../lib/ofertas/filtros";
import type { OfertaResumen } from "../lib/ofertas/datos";
import {
  TITULO_NUEVO,
  TITULO_NUEVO_SECCION,
  aplicarEstructura,
  bloqueConContenido,
} from "../lib/ofertas/estructura";
import { asignarEnRuta, leerEnRuta, numeroDesdeTexto } from "../lib/ofertas/rutas";
import { firmaDe } from "../lib/ofertas/tipos";
import { proximoIndice } from "../lib/ofertas/imagenes";
import { correosValidos, nombreDeArchivoDeOferta } from "../lib/ofertas/emision";

/** La OS 010-2026 real, bien transcrita. */
function os10(): OfertaCanonica {
  return {
    titulo: "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
    identificacion: {
      numeroOferta: "OS 010-2026",
      fecha: "11 de agosto de 2026",
      validez: "31 de agosto de 2026",
      cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
      atencion: "Sr. Alan Muñoz G.",
      copia: "Sres. Rodrigo Moraga / Alejandro Tapia",
      referencia: "Servicio de reemplazo de correa transportadora: traslado de rollos a CT-6 y CT-7.",
      faena: "Central Eléctrica Angamos — AES Andes",
    },
    alcance: {
      introduccion: "La oferta consiste en el traslado de 06 rollos nuevos.",
      actividades: ["Traslado de 06 rollos desde bodega", "Maniobras de izaje"],
      trabajosPrevios: ["Traslado de equipos móviles", "Posicionamiento de grúa"],
      personalEspecialista: [],
    },
    metodologia: null,
    especificaciones: null,
    organizacion: {
      cuadroPersonal: [
        { cargo: "Planificador logístico", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Supervisor", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "APR", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Rigger", dotacion: 1, regimen: "Turno de día — 10 h" },
        { cargo: "Especialista vulcanizador", dotacion: 3, regimen: "Turno de día — 10 h" },
      ],
      responsabilidades: [{ cargo: "Supervisor", descripcion: "Dirige la maniobra." }],
      nota: "El servicio se ejecuta con una cuadrilla en 01 turno de trabajo.",
    },
    programa: {
      introduccion: "Duración total de 10 horas.",
      turnos: [{ turno: "T1", jornada: "Día 1 — día", horas: 10 }],
      nota: null,
    },
    precio: {
      lineas: [
        {
          cantidad: 1,
          cargo: "Traslado de rollos desde bodega a puntos de trabajo CT-6 y CT-7.",
          unidad: "Global",
          valorUnitario: 15_885_200,
          valorTotalImpreso: 15_885_200,
        },
      ],
      totalNetoImpreso: 15_885_200,
      nota: "Valores en pesos chilenos, netos.",
    },
    condicionesComerciales: ["La validez de esta oferta es de 21 días."],
    aportes: {
      pertec: ["Personal especializado para las maniobras"],
      cliente: ["Carretes de cinta nueva"],
    },
    cierre: {
      texto: "Quedamos a disposición.",
      firmantes: [
        {
          nombre: "Alfonso Hachim Fulgeri",
          cargo: "Gerente General",
          empresa: "Performance Technologies SpA",
        },
      ],
      cc: "CC: Gcia. Gral. / Archivo.",
      firmaImagen: null,
    },
    anexo: {
      respaldoInstitucional: ["PERTEC es una empresa nacional…"],
      mandantes: ["Minera Franke"],
      notaEquipo: null,
    },
    porConfirmar: [],
    imagenesPorSeccion: {},
    epigrafesDeImagenes: {},
    omitidas: [
      { seccion: "4 Especificaciones técnicas", motivo: "El servicio es un traslado, no un empalme." },
    ],
  };
}

// ── Los totales los calcula el servidor ─────────────────────────────────────
const buena = os10();
const totales = calcularTotales(buena);
assert.equal(totales.dotacionTotal, 7, "7 personas en el cuadro de personal");
assert.equal(totales.horasPrograma, 10);
assert.equal(totales.cantidadTurnos, 1);
assert.equal(totales.totalNetoCalculado, 15_885_200);

// Un borrador bien transcrito no genera ruido: si una oferta correcta levantara
// avisos, nadie leería la lista.
const sinProblemas = detectarInconsistencias(buena, totales, "Propuesta Técnica_OS10.docx");
assert.deepEqual(
  sinProblemas,
  [],
  `una oferta correcta no debe reportar nada:\n${JSON.stringify(sinProblemas, null, 1)}`,
);

// El nombre del archivo casi nunca trae el año: "OS10" es el mismo que "OS 010-2026".
assert.ok(mismoNumeroDeOferta("OS 010-2026", "OS10"));
assert.ok(mismoNumeroDeOferta("OS 010-2026", "OS 010 – 2026"));
assert.ok(!mismoNumeroDeOferta("OS 010-2026", "OS 009-2026"));

// ── El borrador copiado al que le cambiaron el número a medias ──────────────
const numeroMezclado = os10();
numeroMezclado.titulo = "OS 009-2026 · Reemplazo de correas CT-6 y CT-7";
const p1 = detectarInconsistencias(numeroMezclado, calcularTotales(numeroMezclado), "OS10.docx");
assert.ok(
  p1.some((p) => p.tipo === "numero_oferta"),
  "el número del título que no coincide con la tabla tiene que detectarse",
);

// ── La suma que no da ───────────────────────────────────────────────────────
const totalMalo = os10();
totalMalo.precio!.totalNetoImpreso = 15_000_000;
const p2 = detectarInconsistencias(totalMalo, calcularTotales(totalMalo), "os10.docx");
const suma = p2.find((p) => p.tipo === "suma_precios");
assert.ok(suma, "un TOTAL NETO que no coincide con la suma de las líneas tiene que detectarse");
assert.ok(suma!.detalle.includes("885.200"), "el aviso tiene que decir la diferencia");
assert.equal(suma!.origen, "aritmetica");

// ── La línea cuyo total impreso no es cantidad × unitario ───────────────────
const lineaMala = os10();
lineaMala.precio!.lineas[0].valorTotalImpreso = 12_000_000;
const p3 = detectarInconsistencias(lineaMala, calcularTotales(lineaMala), "os10.docx");
assert.ok(p3.some((p) => p.tipo === "linea_precio"));

// ── Una celda de fórmula sin recalcular llega en 0 ──────────────────────────
const enCero = os10();
enCero.precio!.lineas[0].valorUnitario = 0;
enCero.precio!.lineas[0].valorTotalImpreso = null;
enCero.precio!.totalNetoImpreso = null;
const p4 = detectarInconsistencias(enCero, calcularTotales(enCero), "os10.xlsx");
assert.ok(
  p4.some((p) => p.tipo === "linea_precio" && p.detalle.includes("fórmula")),
  "un valor unitario en 0 tiene que explicar de dónde suele venir",
);

// ── Los dos cuadros de dotación que no coinciden ────────────────────────────
const dotacionMezclada = os10();
dotacionMezclada.alcance!.personalEspecialista = [{ cargo: "Especialista vulcanizador", dotacion: 9 }];
const p5 = detectarInconsistencias(dotacionMezclada, calcularTotales(dotacionMezclada), "os10.docx");
assert.ok(
  p5.some((p) => p.tipo === "dotacion" && p.detalle.includes("9") && p.detalle.includes("7")),
  "los dos cuadros son el mismo dato contado dos veces y tienen que coincidir",
);

// ── Una sección heredada de otra oferta ─────────────────────────────────────
const heredada = os10();
heredada.organizacion!.responsabilidades.push({
  cargo: "Jefe de terreno",
  descripcion: "Coordina el frente de trabajo.",
});
const p6 = detectarInconsistencias(heredada, calcularTotales(heredada), "os10.docx");
assert.ok(
  p6.some((p) => p.tipo === "contenido_ajeno" && p.detalle.includes("Jefe de terreno")),
  "un cargo con responsabilidades que no está en el cuadro es rastro de copiar y pegar",
);

// ── Vaciar el cargo saca la tarjeta y no cuenta como inconsistencia ────────
const marcadaParaSacar = os10();
marcadaParaSacar.organizacion!.responsabilidades.push({ cargo: "  ", descripcion: "Sobra." });
assert.deepEqual(
  detectarInconsistencias(marcadaParaSacar, calcularTotales(marcadaParaSacar), "os10.docx"),
  [],
  "una responsabilidad con el cargo vacío está marcada para sacar, no es un problema",
);

// ── Un aporte del cliente que nombra a otra empresa ─────────────────────────
const otroCliente = os10();
otroCliente.aportes!.cliente.push("Acreditación según los estándares de Codelco Chuquicamata");
const p7 = detectarInconsistencias(otroCliente, calcularTotales(otroCliente), "os10.docx");
assert.ok(
  p7.some((p) => p.tipo === "contenido_ajeno" && p.detalle.toLowerCase().includes("codelco")),
  "un aporte que nombra a otro mandante tiene que reportarse",
);

// ── Lo que el modelo no pudo leer llega como aviso de lectura ───────────────
const conDudas = os10();
conDudas.porConfirmar = ["La tabla de identificación no trae la validez de la oferta"];
const p8 = detectarInconsistencias(conDudas, calcularTotales(conDudas), "os10.docx");
assert.ok(p8.some((p) => p.origen === "lectura" && p.detalle.includes("validez")));

// ── Corregir un dato limpia su propio aviso ─────────────────────────────────
const corregida = os10();
corregida.titulo = "OS 009-2026 · otra cosa";
assert.ok(detectarInconsistencias(corregida, calcularTotales(corregida), "os10.docx").length > 0);
corregida.titulo = "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7";
assert.deepEqual(
  detectarInconsistencias(corregida, calcularTotales(corregida), "os10.docx"),
  [],
  "al corregir el dato, el aviso tiene que desaparecer solo",
);

// ── El saneo del estilo de un maestro ───────────────────────────────────────
//
// Es el único punto del módulo donde la salida de un modelo llega al CSS de un
// documento que se manda a un cliente, así que se prueba a conciencia.

// Un estilo válido se acepta entero.
const bueno = sanearEstilo({
  colorTinta: "#12233A",
  colorAcento: "#1B6CA8",
  tamanoCuerpo: 10,
  altoHeader: 16,
  fuenteCuerpo: "Georgia, serif",
  rotuloLogoCliente: "[Logo mandante]",
});
assert.deepEqual(bueno.descartados, [], "un estilo válido no descarta nada");
assert.equal(bueno.estilo.colorTinta, "#12233a", "el hex se normaliza a minúscula");
assert.equal(bueno.estilo.tamanoCuerpo, 10);
assert.equal(bueno.estilo.fuenteCuerpo, "Georgia, serif");
// Lo que no vino queda con el valor de PERTEC.
assert.equal(bueno.estilo.colorSuave, ESTILO_PERTEC.colorSuave);

// Un color que no es hex se descarta y se dice.
const colorMalo = sanearEstilo({ colorAcento: "rojo" });
assert.equal(colorMalo.estilo.colorAcento, ESTILO_PERTEC.colorAcento);
assert.ok(
  colorMalo.descartados.some((d) => d.includes("colorAcento")),
  "un color inválido tiene que quedar nombrado, no volver al defecto en silencio",
);

// Un tamaño fuera de rango, también: un cuerpo de 400px no es un documento.
const tamanoMalo = sanearEstilo({ tamanoCuerpo: 400 });
assert.equal(tamanoMalo.estilo.tamanoCuerpo, ESTILO_PERTEC.tamanoCuerpo);
assert.ok(tamanoMalo.descartados.some((d) => d.includes("tamanoCuerpo")));

// Y lo que de verdad importa: nada puede colar CSS. Un valor con "}" cerraría la
// regla y dejaría escribir declaraciones arbitrarias en el documento.
for (const ataque of [
  "#fff; } body { display: none } .x {",
  "red; background: url(http://ajeno/x)",
  "expression(alert(1))",
]) {
  const r = sanearEstilo({ colorTinta: ataque });
  assert.equal(r.estilo.colorTinta, ESTILO_PERTEC.colorTinta, `no debe aceptar: ${ataque}`);
}
for (const ataque of ["Arial; } body { display:none } .x {", "Arial, url(http://ajeno/f.woff)"]) {
  const r = sanearEstilo({ fuenteCuerpo: ataque });
  assert.ok(
    !r.estilo.fuenteCuerpo.includes("}") && !r.estilo.fuenteCuerpo.includes("url("),
    `la fuente no debe arrastrar CSS: ${ataque} → ${r.estilo.fuenteCuerpo}`,
  );
}
// Una lista de fuentes siempre termina en una genérica, para que un maestro que
// nombre una fuente que el servidor no tiene igual imprima bien.
assert.ok(sanearEstilo({ fuenteCuerpo: "Futura" }).estilo.fuenteCuerpo.endsWith("sans-serif"));

// ── Un color válido que igual deja el documento ilegible ────────────────────
//
// El caso real: un maestro leído de un PDF volvió con colorFondoTotal en #1a1a1a,
// el MISMO valor que colorTinta. Los dos hexes son perfectos, así que ningún
// control por valor los rechazaba — y la fila de total del programa salió como una
// banda negra con el texto negro adentro. El mismo token dibuja las líneas del
// índice y de los hitos, así que además todo el documento quedó con reglas negras.
const sinContraste = sanearEstilo({
  colorTinta: "#1a1a1a",
  colorAcento: "#e05a2b",
  colorCabecera: "#1a1a1a",
  colorCabeceraTexto: "#ffffff",
  colorFondoSuave: "#f4f4f4",
  colorFondoTotal: "#1a1a1a",
});
assert.equal(
  sinContraste.estilo.colorFondoTotal,
  ESTILO_PERTEC.colorFondoTotal,
  "un fondo del color de la tinta vuelve al de PERTEC",
);
assert.equal(sinContraste.estilo.colorTinta, "#1a1a1a", "y la tinta, que estaba bien, se respeta");
assert.equal(sinContraste.estilo.colorAcento, "#e05a2b", "igual que el acento");
assert.equal(sinContraste.estilo.colorFondoSuave, "#f4f4f4", "y el fondo que sí contrastaba se mantiene");
assert.ok(
  sinContraste.descartados.some((d) => d.includes("colorFondoTotal") && /ilegible/.test(d)),
  "y se dice por qué, no en silencio",
);

// Cabecera oscura con texto blanco: legítimo, no se toca.
const cabeceraOscura = sanearEstilo({ colorCabecera: "#0b0b0b", colorCabeceraTexto: "#ffffff" });
assert.equal(cabeceraOscura.estilo.colorCabecera, "#0b0b0b");
assert.deepEqual(cabeceraOscura.descartados, [], "una paleta oscura bien armada pasa entera");

// Y una cabecera clara con texto claro: cede primero el fondo.
const cabeceraClara = sanearEstilo({ colorCabecera: "#fafafa", colorCabeceraTexto: "#ffffff" });
assert.equal(cabeceraClara.estilo.colorCabecera, ESTILO_PERTEC.colorCabecera);
assert.ok(cabeceraClara.descartados.some((d) => d.includes("colorCabecera")));

// El rótulo no puede traer marcado.
assert.equal(sanearEstilo({ rotuloLogoCliente: "<img src=x>" }).estilo.rotuloLogoCliente, "img src=x");

// ── Los logos: lo único que puede entrar es un PNG que armó el servidor ─────
//
// Es el mismo papel que cumple sanearEstilo con los colores, pero más estricto,
// porque el valor termina interpolado en un `src`. Base64 no tiene comillas, así
// que un valor que pase este control no puede cerrar el atributo.
/** Una identidad cargada, para armar la maqueta. */
const EMPRESA_DE_PRUEBA = {
  id: "prueba",
  nombre: "PERFORMANCE TECHNOLOGIES",
  razonSocial: "Performance Technologies SpA",
  rut: "77.777.777-7",
  direccion: "Av. Siempre Viva 123",
  ciudad: "Antofagasta",
  email: "contacto@pertec.cl",
  telefono: "+56 9 1234 5678",
  representanteLegal: "Alex Oliva",
  activo: true,
  logoRuta: null,
  logoNombre: null,
};

const PNG_VALIDO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
assert.equal(logoSeguro(PNG_VALIDO), PNG_VALIDO, "un PNG en base64 tiene que pasar");

for (const ataque of [
  'data:image/png;base64,AAAA" onerror="alert(1)',
  "data:image/png;base64,AAAA); background: url(http://ajeno/x",
  "javascript:alert(1)",
  "http://ajeno/logo.png",
  // Un SVG es marcado, no una imagen: acá nunca llega uno, porque sharp lo
  // rasteriza antes de guardarlo. Si llegara, no se dibuja.
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "data:image/png;base64,<script>alert(1)</script>",
  "",
]) {
  assert.equal(logoSeguro(ataque), null, `no debe aceptar como logo: ${ataque}`);
}
assert.equal(logoSeguro(null), null);
assert.equal(logoSeguro(undefined), null);

// Un logo válido reemplaza el texto del encabezado; uno inválido lo deja como
// estaba. Que el documento no se rompa por una imagen importa más que la imagen.
const conLogos = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA, ESTILO_PERTEC, {
  casa: PNG_VALIDO,
  cliente: PNG_VALIDO,
});
assert.equal(
  (conLogos.match(/<img src="data:image\/png;base64,/g) ?? []).length,
  2,
  // Dos y no tres: la portada NO repite el logo. El encabezado se repite en todas
  // las páginas, incluida ella, así que salía dos veces en la primera.
  "van dos: la celda izquierda y la del cliente",
);
assert.ok(!conLogos.includes(ESTILO_PERTEC.rotuloLogoCliente), "con logo, el rótulo no se imprime");

const conLogoRoto = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA, ESTILO_PERTEC, {
  casa: 'data:image/png;base64,AA" onerror="alert(1)',
  cliente: null,
});
assert.ok(!conLogoRoto.includes("onerror"), "un logo que no pasa el control no llega al documento");
assert.ok(
  conLogoRoto.includes(EMPRESA_DE_PRUEBA.nombre),
  "sin logo válido, la celda vuelve al nombre en texto",
);
// El rótulo del logo del cliente es el HUECO donde arrastrarlo, y solo se dibuja al
// editar: en el documento que se manda, "[Logo cliente]" en cada página se ve como un
// documento sin terminar — y hay clientes que no tienen logo que poner.
assert.ok(
  !conLogoRoto.includes(ESTILO_PERTEC.rotuloLogoCliente),
  "sin logo del cliente, el documento impreso no dice nada en esa celda",
);
// Al editar, la celda SIGUE ESTANDO —es el blanco donde se arrastra el logo— pero vacía:
// se anuncia sola al arrastrar encima, con su outline y su rótulo (ver edicion-dom). Un
// rótulo fijo entre corchetes en el documento se lee como algo sin terminar, y hay
// clientes que no tienen logo que poner.
const editandoSinLogo = ofertaAHtml(
  os10(),
  totales,
  EMPRESA_DE_PRUEBA,
  ESTILO_PERTEC,
  { casa: null, cliente: null },
  {},
  true,
);
assert.ok(
  editandoSinLogo.includes('class="cliente vacia" data-logo="cliente"'),
  "al editar queda el blanco donde soltar el logo",
);
assert.ok(
  !editandoSinLogo.includes(ESTILO_PERTEC.rotuloLogoCliente),
  "y sin el rótulo fijo: se anuncia al arrastrar, no antes",
);
// Y en el encabezado que Chromium repite en cada página del PDF, nunca.
const cajasSinLogo = plantillasDeImpresion(os10(), EMPRESA_DE_PRUEBA, ESTILO_PERTEC, {
  casa: null,
  cliente: null,
});
assert.ok(
  !cajasSinLogo.headerTemplate.includes(ESTILO_PERTEC.rotuloLogoCliente),
  "el encabezado impreso no lo lleva: saldría en todas las páginas",
);

// Y lo mismo en la caja que Chromium repite en cada página, que es otro código.
const cajas = plantillasDeImpresion(os10(), EMPRESA_DE_PRUEBA, ESTILO_PERTEC, {
  casa: PNG_VALIDO,
  cliente: "javascript:alert(1)",
});
assert.ok(cajas.headerTemplate.includes(`src="${PNG_VALIDO}"`));
assert.ok(!cajas.headerTemplate.includes("javascript:"), "el del cliente no pasó y no se dibuja");
// Y no se cae al rótulo: en el encabezado impreso, que se repite en cada página, la
// celda del logo del cliente va vacía cuando no hay logo (ver más abajo).
assert.ok(!cajas.headerTemplate.includes(ESTILO_PERTEC.rotuloLogoCliente));

// ── El blanco y el 0: cómo dice el modelo "no lo distinguí" ─────────────────
//
// El esquema de salida no puede tener campos nullables ni opcionales —la API
// rechaza el primero por tipos unión y el segundo por complejidad— así que el
// modelo manda todas las claves y usa un valor vacío. Eso tiene que significar
// "cae el valor de PERTEC", y NO tiene que aparecer como si el modelo se hubiera
// equivocado.
const enBlanco = sanearEstilo({
  colorTinta: "",
  fuenteCuerpo: "",
  tamanoCuerpo: 0,
  altoHeader: 0,
  rotuloLogoCliente: "",
  colorAcento: "#123456",
});
assert.equal(enBlanco.estilo.colorTinta, ESTILO_PERTEC.colorTinta);
assert.equal(enBlanco.estilo.fuenteCuerpo, ESTILO_PERTEC.fuenteCuerpo);
assert.equal(enBlanco.estilo.tamanoCuerpo, ESTILO_PERTEC.tamanoCuerpo);
assert.equal(enBlanco.estilo.altoHeader, ESTILO_PERTEC.altoHeader);
assert.equal(enBlanco.estilo.rotuloLogoCliente, ESTILO_PERTEC.rotuloLogoCliente);
assert.equal(enBlanco.estilo.colorAcento, "#123456", "y lo que sí vino se usa");
assert.deepEqual(
  enBlanco.descartados,
  [],
  "un valor vacío no es un valor inválido: no se reporta como descartado",
);

// ── Armar la oferta con las dos lecturas planas ─────────────────────────────
//
// El esquema de salida no puede ser grande —"The compiled grammar is too large"—
// así que la lectura se parte en dos, cada una con un esquema plano, y la
// estructura la arma el servidor. Estas pruebas son la garantía de esa costura,
// que es lo único de la lectura que se puede verificar sin llamar a la API.

/** La letra tal como la devolvería el modelo: todas las claves, vacías las que no van. */
function letraOS10(): LecturaLetra {
  return {
    titulo: "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
    numeroOferta: "OS 010-2026",
    fecha: "11 de agosto de 2026",
    validez: "31 de agosto de 2026",
    cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
    atencion: "Sr. Alan Muñoz G.",
    copia: "",
    referencia: "Servicio de reemplazo de correa transportadora.",
    faena: "Central Eléctrica Angamos — AES Andes",
    alcanceIntroduccion: "La oferta consiste en el traslado de 06 rollos nuevos.",
    alcanceActividades: ["Traslado de 06 rollos desde bodega", "Maniobras de izaje"],
    alcanceTrabajosPrevios: ["Posicionamiento de grúa"],
    // No aplica: queda vacía y nombrada en omitidas.
    metodologiaAntes: [],
    metodologiaDurante: [],
    especificaciones: [],
    condicionesComerciales: ["La validez de esta oferta es de 21 días."],
    aportesPertec: ["Equipos móviles"],
    aportesCliente: ["Accesos habilitados"],
    cierreTexto: "Quedamos atentos.",
    firmantes: [{ nombre: "Alex Oliva", cargo: "Gerente", empresa: "" }],
    cierreCc: "",
    anexoRespaldos: [],
    anexoMandantes: [],
    anexoNotaEquipo: "",
    ubicacionImagenes: [],
    firmaImagen: 0,
    porConfirmar: ["La tabla de identificación no trae copia."],
    omitidas: ["Metodología: el servicio no tiene detención de planta"],
  };
}

/** Los números: los tres cuadros sobre los que el servidor calcula. */
function numerosOS10(): LecturaNumeros {
  return {
    personalEspecialista: [],
    cuadroPersonal: [
      { cargo: "Planificador logístico", dotacion: 1, regimen: "Turno de día — 10 h" },
      { cargo: "Supervisor", dotacion: 1, regimen: "Turno de día — 10 h" },
      { cargo: "Especialista vulcanizador", dotacion: 3, regimen: "Turno de día — 10 h" },
    ],
    responsabilidades: [{ cargo: "Supervisor", descripcion: "1. Turno de día, 10 horas." }],
    organizacionNota: "El servicio se ejecuta con una cuadrilla en 01 turno.",
    programaIntroduccion: "",
    turnos: [{ turno: "T1", jornada: "Día 1 — día", horas: 10 }],
    programaNota: "",
    lineasPrecio: [
      {
        cantidad: 1,
        cargo: "Traslado de rollos desde bodega a CT-6 y CT-7",
        unidad: "Global",
        valorUnitario: 15_885_200,
        valorTotalImpreso: 15_885_200,
      },
    ],
    totalNetoImpreso: 15_885_200,
    precioNota: "Valores en pesos chilenos, netos.",
    porConfirmar: [],
  };
}

const armada = armarOferta(letraOS10(), numerosOS10());

// Lo que el servidor calcula tiene que salir igual que con la estructura escrita a
// mano: es la misma oferta por otro camino.
const totalesArmada = calcularTotales(armada);
assert.equal(totalesArmada.dotacionTotal, 5, "la dotación sale del cuadro, sumada por el servidor");
assert.equal(totalesArmada.horasPrograma, 10);
assert.equal(totalesArmada.totalNetoCalculado, 15_885_200);
assert.deepEqual(
  detectarInconsistencias(armada, totalesArmada, "OS 010-2026.pdf").filter((a) => a.origen === "aritmetica"),
  [],
  "una oferta bien transcrita no tiene que dar ningún aviso de aritmética",
);

// Las secciones vacías no aplican: vuelven a null, que es lo que la maqueta espera.
assert.equal(armada.metodologia, null, "una sección vacía no aplica");
assert.equal(armada.especificaciones, null);
assert.equal(armada.anexo, null);
assert.ok(armada.alcance && armada.precio && armada.organizacion, "y las que tienen datos quedan");

// El blanco vuelve a null, no a la palabra "" dando vueltas por el documento.
assert.equal(armada.identificacion.copia, null);
assert.equal(armada.cierre?.firmantes[0].empresa, null);

// El motivo de una sección omitida viene en una sola frase, para no agregar un
// objeto más al esquema: se parte acá.
assert.deepEqual(armada.omitidas, [
  { seccion: "Metodología", motivo: "el servicio no tiene detención de planta" },
]);

// Los porConfirmar de las dos lecturas se juntan sin repetidos.
const dosVeces = armarOferta(
  { ...letraOS10(), porConfirmar: ["Falta la fecha"] },
  { ...numerosOS10(), porConfirmar: ["Falta la fecha", "El precio no trae unidad"] },
);
assert.deepEqual(dosVeces.porConfirmar, ["Falta la fecha", "El precio no trae unidad"]);

// Un total en 0 es "no está impreso", no un total de cero pesos: tratarlo como
// impreso daría el aviso falso "el documento imprime $ 0 pero 1 × $ 15.885.200 da
// $ 15.885.200".
const conCeros = armarOferta(letraOS10(), {
  ...numerosOS10(),
  totalNetoImpreso: 0,
  lineasPrecio: [{ ...numerosOS10().lineasPrecio[0], valorTotalImpreso: 0 }],
});
assert.equal(conCeros.precio?.totalNetoImpreso, null);
assert.equal(conCeros.precio?.lineas[0].valorTotalImpreso, null);
const avisosCeros = detectarInconsistencias(conCeros, calcularTotales(conCeros), "os10.pdf");
assert.ok(
  !avisosCeros.some((a) => /imprime \$ 0/.test(a.detalle)),
  "no se compara contra un total que no existe",
);
assert.ok(
  avisosCeros.some((a) => a.tipo === "falta_dato" && /TOTAL NETO/.test(a.detalle)),
  "y sí se avisa que no hay total impreso contra el que verificar",
);

// Una tabla de precios SIN columna de cantidad, que es el caso más común y el que
// daba un total de cero pesos para una oferta de cien millones: el modelo ponía 0
// —correcto, no estaba impreso— y el servidor multiplicaba 0 × precio en cada
// línea. La cantidad de una línea sin columna de cantidad es 1.
const sinColumnaCantidad = armarOferta(letraOS10(), {
  ...numerosOS10(),
  totalNetoImpreso: 0,
  lineasPrecio: [
    {
      cantidad: 0,
      cargo: "Cambio y empalme CT-6",
      unidad: "Global",
      valorUnitario: 100_032_910,
      valorTotalImpreso: 0,
    },
    { cantidad: 0, cargo: "Enrollador", unidad: "Día", valorUnitario: 2_700_000, valorTotalImpreso: 0 },
    {
      cantidad: 0,
      cargo: "Grúa, rigger + elementos de izaje",
      unidad: "",
      valorUnitario: 0,
      valorTotalImpreso: 0,
    },
    { cantidad: 0, cargo: "Núcleos metálicos", unidad: "Uni", valorUnitario: 500_000, valorTotalImpreso: 0 },
  ],
});
assert.deepEqual(
  sinColumnaCantidad.precio?.lineas.map((l) => l.cantidad),
  [1, 1, 1, 1],
  "sin columna de cantidad, cada línea es una unidad de lo que dice",
);
assert.equal(
  calcularTotales(sinColumnaCantidad).totalNetoCalculado,
  103_232_910,
  "y el total es la suma de los precios, no cero",
);
assert.ok(
  sinColumnaCantidad.porConfirmar.some((p) => /no trae columna de cantidad/.test(p)),
  "lo que el servidor asumió se dice, porque es tan revisable como lo que faltó",
);

// Una cantidad que SÍ vino impresa se respeta tal cual.
const conCantidad = armarOferta(letraOS10(), {
  ...numerosOS10(),
  lineasPrecio: [
    {
      cantidad: 3,
      cargo: "Turno extra",
      unidad: "Día",
      valorUnitario: 1_000_000,
      valorTotalImpreso: 3_000_000,
    },
  ],
  totalNetoImpreso: 3_000_000,
});
assert.equal(conCantidad.precio?.lineas[0].cantidad, 3);
assert.equal(calcularTotales(conCantidad).totalNetoCalculado, 3_000_000);
assert.ok(
  !conCantidad.porConfirmar.some((p) => /columna de cantidad/.test(p)),
  "y entonces no se avisa nada",
);

// Un borrador sin tabla de precios: listas vacías, y la sección no existe.
const sinPrecio = armarOferta(letraOS10(), {
  ...numerosOS10(),
  lineasPrecio: [],
  totalNetoImpreso: 0,
  precioNota: "",
});
assert.equal(sinPrecio.precio, null, "sin líneas y sin nota, la sección de precio no aplica");
assert.equal(calcularTotales(sinPrecio).totalNetoCalculado, 0);

// Y la maqueta imprime lo armado sin rastros del formato plano.
const htmlArmada = ofertaAHtml(armada, totalesArmada, EMPRESA_DE_PRUEBA);
assert.ok(!htmlArmada.includes("undefined") && !htmlArmada.includes("[object"));
assert.ok(htmlArmada.includes("AXINNTUS"), "y sí lo que se transcribió");

// ── Una oferta a la que le FALTAN claves, no que las tenga en null ───────────
//
// El esquema del lector dejó de marcar los campos como nullable —la API rechaza
// un esquema con más de 16 parámetros de tipo unión— así que ahora el modelo
// OMITE lo que el documento no trae. Todo el resto del módulo tiene que tratar
// una clave ausente igual que la trataba en null: si no, el cambio de esquema se
// paga en avisos inventados y en la palabra "undefined" impresa en un documento
// que se manda a un cliente.
const incompleta = os10();
// Como lo devolvería el modelo hoy: sin la clave, no con la clave en null.
delete (incompleta.identificacion as unknown as Record<string, unknown>).validez;
delete (incompleta.identificacion as unknown as Record<string, unknown>).copia;
delete (incompleta.precio!.lineas[0] as unknown as Record<string, unknown>).valorTotalImpreso;
delete (incompleta.precio as unknown as Record<string, unknown>).totalNetoImpreso;
delete (incompleta as unknown as Record<string, unknown>).metodologia;
delete (incompleta as unknown as Record<string, unknown>).anexo;

const totalesIncompleta = calcularTotales(incompleta);
assert.equal(
  totalesIncompleta.totalNetoCalculado,
  15_885_200,
  "las sumas no dependen de lo que el documento imprima",
);

const avisosIncompleta = detectarInconsistencias(incompleta, totalesIncompleta, "os10.docx");
assert.ok(
  !avisosIncompleta.some((a) => /NaN/.test(a.detalle)),
  "una línea sin total impreso no se compara contra nada: no hay resta con undefined",
);
assert.ok(
  !avisosIncompleta.some((a) => a.tipo === "linea_precio" && /el documento imprime/.test(a.detalle)),
  "y no se inventa un aviso de multiplicación para una línea que no trae total",
);
assert.ok(
  avisosIncompleta.some((a) => a.tipo === "falta_dato" && /TOTAL NETO/.test(a.detalle)),
  "lo que sí corresponde es avisar que no hay total impreso contra el que verificar",
);

const htmlIncompleta = ofertaAHtml(incompleta, totalesIncompleta, EMPRESA_DE_PRUEBA);
assert.ok(!htmlIncompleta.includes("undefined"), 'una clave ausente no se imprime como "undefined"');
assert.ok(!htmlIncompleta.includes(">Validez</th>"), "la fila de un dato que no está no se dibuja");
assert.ok(htmlIncompleta.includes("AXINNTUS"), "y lo que sí está se imprime igual");

// ── La maqueta impresa: lo que se vio imprimiendo, no leyendo ───────────────
//
// El pie lleva número y cliente, no el título: la propuesta hecha a mano pone
// "OS 009 – 2026 · CT-6 · Axinntus Serv. Ind." y con el título completo el pie
// ocupaba línea y media y aplastaba la dirección y la paginación.
assert.equal(
  referenciaDePie("OS 009-2026", "AXINNTUS SERVICIOS INDUSTRIALES", "OFERTA TÉCNICA ECONÓMICA…"),
  "OS 009-2026 · AXINNTUS SERVICIOS INDUSTRIALES",
);
assert.equal(referenciaDePie("OS 010-2026", null, "Servicio de traslado"), "OS 010-2026");
// Sin número ni cliente queda el título, que es mejor que un pie vacío.
assert.equal(referenciaDePie(null, null, "Servicio de traslado"), "Servicio de traslado");

// La identidad a medio cargar no imprime rótulos huérfanos. Salió impreso: una
// oferta emitida mostraba la palabra "RUT" sola, sin número.
const aMedioCargar = { ...EMPRESA_DE_PRUEBA, razonSocial: "", rut: "" };
const htmlSinIdentidad = ofertaAHtml(os10(), totales, aMedioCargar);
assert.ok(!/RUT\s*</.test(htmlSinIdentidad), 'no puede quedar un "RUT" sin número');
assert.ok(
  !htmlSinIdentidad.includes('class="empresa"></div>'),
  "ni una razón social en blanco ocupando su línea",
);
const cajasSinIdentidad = plantillasDeImpresion(os10(), aMedioCargar);
assert.ok(!/RUT\s*</.test(cajasSinIdentidad.headerTemplate), "ni en la caja que repite Chromium");

// Y la tipografía no puede llevar comillas dobles: estas cajas van con estilos en
// línea, así que una comilla cierra el atributo style y se pierde todo lo que
// sigue. Pasó: el encabezado salía en otra fuente, en otro color y sin su margen
// lateral, más ancho que el texto de la página.
const cajasDeMaqueta = plantillasDeImpresion(os10(), EMPRESA_DE_PRUEBA);
for (const caja of [cajasDeMaqueta.headerTemplate, cajasDeMaqueta.footerTemplate]) {
  const enLinea = caja.match(/style="[^"]*"/g) ?? [];
  assert.ok(enLinea.length > 0, "las cajas van con estilos en línea");
  assert.ok(
    !/font-family:[^;"]*"/.test(caja),
    "ninguna comilla doble puede quedar dentro de un atributo style",
  );
  assert.ok(
    caja.includes("padding:0 16mm") || caja.includes("padding:0 " + ESTILO_PERTEC.margenLateral + "mm"),
  );
}
assert.ok(
  !ESTILO_PERTEC.fuenteCuerpo.includes('"'),
  "la tipografía por defecto se cita con comillas simples",
);
assert.ok(!sanearEstilo({ fuenteCuerpo: "Helvetica Neue" }).estilo.fuenteCuerpo.includes('"'));

// ── Una tabla no se parte dejando el total solo ─────────────────────────────
//
// Salió impreso: la tabla de precios terminó con sus cinco líneas al pie de una
// página y la fila de TOTAL NETO sola en la siguiente, bajo una cabecera repetida
// que no encabezaba nada. Un <table> acepta varios <tbody> y el navegador respeta
// break-inside en un tbody, así que el cuerpo se parte en tramos: la cola SIEMPRE
// viaja con su fila de total.
const fila = (n: number) => `<tr><td>${n}</td></tr>`;
const total = '<tr class="total"><td>Total</td></tr>';

// Corta: entera, en un solo tramo que no se parte.
const corta = cuerpoDeTabla([1, 2, 3].map(fila), total);
assert.equal((corta.match(/<tbody/g) ?? []).length, 1, "una tabla corta va entera");
assert.ok(corta.includes('class="junta"'), "y en un tramo que no se parte");
assert.ok(corta.indexOf(total) > corta.indexOf(fila(3)), "el total va al final");

// Larga: tres tramos, y el total viaja pegado a las últimas filas.
const larga = cuerpoDeTabla(
  Array.from({ length: 12 }, (_, i) => fila(i + 1)),
  total,
);
assert.equal((larga.match(/<tbody/g) ?? []).length, 3, "cabeza, medio y cola");
const cola = larga.slice(larga.lastIndexOf("<tbody"));
assert.ok(cola.includes('class="junta"'), "la cola no se parte");
assert.ok(
  cola.includes(fila(11)) && cola.includes(fila(12)) && cola.includes(total),
  "y lleva las dos últimas filas junto al total",
);
assert.ok(!cola.includes(fila(10)), "el resto fluye libre");

// Sin filas: el total no puede quedar huérfano de tabla.
assert.ok(cuerpoDeTabla([], total).includes(total));
assert.equal(cuerpoDeTabla([]), "<tbody></tbody>");

// Y en el documento entero: la tabla de precios de la OS 010 y su total quedan en
// el mismo tramo.
const htmlTabla = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA);
assert.ok(
  htmlTabla.lastIndexOf("<tbody", htmlTabla.indexOf("Total neto")) ===
    htmlTabla.lastIndexOf('<tbody class="junta"', htmlTabla.indexOf("Total neto")),
  "el total está dentro de un tramo que no se parte",
);
// ── Una fila agregada y no completada no se imprime ─────────────────────────
//
// Desde que el editor permite agregar filas, "la agregué y no la completé" es un
// caso normal. Una fila en blanco en el cuadro de personal o en la tabla de precios
// de un documento que se manda a un cliente es peor que no tenerla.
const conFilasVacias = os10();
conFilasVacias.organizacion!.cuadroPersonal.push({ cargo: "", dotacion: 1, regimen: null });
conFilasVacias.precio!.lineas.push({
  cantidad: 1,
  cargo: "",
  unidad: "",
  valorUnitario: 0,
  valorTotalImpreso: null,
});
conFilasVacias.programa!.turnos.push({ turno: "", jornada: "", horas: 0 });

const htmlVacias = ofertaAHtml(conFilasVacias, calcularTotales(conFilasVacias), EMPRESA_DE_PRUEBA);
// Las filas con cargo se imprimen; la vacía no deja una celda de cargo en blanco.
assert.ok(htmlVacias.includes("Planificador logístico"), "las filas con cargo se imprimen");
assert.ok(htmlVacias.includes("Supervisor"));
assert.ok(
  !/data-campo="organizacion\.cuadroPersonal\.\d+\.cargo"><\/td>/.test(htmlVacias),
  "y una fila sin cargo no se dibuja",
);
// Y las que sobreviven conservan su índice REAL. Con la vacía ARRIBA, la primera
// fila impresa es la 1 de la oferta, no la 0: si la ruta usara el índice de la
// lista ya filtrada, editar esa fila en el documento escribiría en otra, en
// silencio, que es lo peor que puede hacer un editor.
const vaciaArriba = os10();
vaciaArriba.organizacion!.cuadroPersonal.unshift({ cargo: "", dotacion: 1, regimen: null });
vaciaArriba.precio!.lineas.unshift({
  cantidad: 0,
  cargo: "",
  unidad: "",
  valorUnitario: 0,
  valorTotalImpreso: null,
});
const htmlVaciaArriba = ofertaAHtml(vaciaArriba, calcularTotales(vaciaArriba), EMPRESA_DE_PRUEBA);
assert.ok(
  htmlVaciaArriba.includes('data-campo="organizacion.cuadroPersonal.1.cargo">Planificador logístico'),
  "la ruta de una fila apunta a su posición en la oferta, no en la tabla impresa",
);
assert.ok(
  htmlVaciaArriba.includes('data-campo="precio.lineas.1.cargo"'),
  "y lo mismo en las líneas de precio",
);
// El número de ítem que se lee en el papel, en cambio, sí es correlativo.
assert.ok(htmlVaciaArriba.includes("<tr><td>1.</td>"), "el ítem impreso arranca en 1 igual");

// Una línea de precio con descripción pero sin monto SÍ se imprime: el control de
// "valor unitario en 0" la marca para que alguien la revise.
const conLineaSinMonto = os10();
conLineaSinMonto.precio!.lineas.push({
  cantidad: 1,
  cargo: "Grúa, rigger + elementos de izaje",
  unidad: "",
  valorUnitario: 0,
  valorTotalImpreso: null,
});
const htmlSinMonto = ofertaAHtml(conLineaSinMonto, calcularTotales(conLineaSinMonto), EMPRESA_DE_PRUEBA);
assert.ok(
  htmlSinMonto.includes("Grúa, rigger + elementos de izaje"),
  "una línea sin monto pero con descripción se imprime igual",
);
assert.ok(
  detectarInconsistencias(conLineaSinMonto, calcularTotales(conLineaSinMonto), "os10.docx").some(
    (a) => a.tipo === "linea_precio" && /valor unitario en 0/.test(a.detalle),
  ),
  "y queda marcada para revisar",
);

// ── Las imágenes que traía el borrador ──────────────────────────────────────
//
// Un .docx lleva adentro el membrete, los diagramas y las fotos de faena. El
// modelo dice cuál es cuál por el marcador [IMAGEN n] que ve en su lugar, y el
// contenido canónico guarda solo NÚMEROS: las rutas las sabe el servidor. Acá se
// comprueba la costura de esos números.
const JPEG_VALIDO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAA==";
assert.equal(imagenSegura(JPEG_VALIDO), JPEG_VALIDO, "una foto va como JPEG");
assert.equal(imagenSegura(PNG_VALIDO), PNG_VALIDO, "y un diagrama con transparencia como PNG");
for (const ataque of [
  'data:image/jpeg;base64,AAAA" onerror="alert(1)',
  "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
  "http://ajeno/foto.jpg",
  "",
]) {
  assert.equal(imagenSegura(ataque), null, `no debe aceptar como imagen: ${ataque}`);
}

// El reparto por sección se limpia: repetidos, ceros, fracciones y secciones que
// no existen. Una imagen dos veces en la misma sección sería la misma imagen dos
// veces en el documento.
const conImagenes = armarOferta(
  {
    ...letraOS10(),
    ubicacionImagenes: [
      { imagen: 3, seccion: "metodologia" },
      { imagen: 4, seccion: "anexo" },
      { imagen: 4, seccion: "anexo" },
      { imagen: 0, seccion: "anexo" },
      { imagen: -2, seccion: "anexo" },
      { imagen: 5.5, seccion: "anexo" },
      { imagen: 7, seccion: "portada" },
      { imagen: 8, seccion: "anexo" },
    ],
    firmaImagen: 9,
  },
  numerosOS10(),
);
assert.deepEqual(conImagenes.imagenesPorSeccion.metodologia, [3], "cada una en su sección");
assert.deepEqual(conImagenes.imagenesPorSeccion.anexo, [4, 8], "sin repetidos, sin cero, sin fracciones");
assert.equal(
  (conImagenes.imagenesPorSeccion as Record<string, number[]>).portada,
  undefined,
  "una sección que no existe se descarta",
);
assert.equal(conImagenes.cierre?.firmaImagen, 9);

// Y el 0 del esquema significa "no hay firma", no la imagen número cero.
const sinFirma = armarOferta({ ...letraOS10(), firmaImagen: 0 }, numerosOS10());
assert.equal(sinFirma.cierre?.firmaImagen, null);

// Al dibujar, lo que de verdad se pidió: cada imagen sale DONDE ESTABA. El
// diagrama de la metodología tiene que quedar dentro de esa sección, no al final.
const conFotos = armarOferta(
  {
    ...letraOS10(),
    // Con metodología de verdad: sin ella la sección no existe y la imagen caería
    // al anexo, que es el respaldo probado más abajo.
    metodologiaAntes: ["Instalar atril en la cola de la correa."],
    metodologiaDurante: ["Corte de cinta usada."],
    ubicacionImagenes: [
      { imagen: 3, seccion: "metodologia" },
      { imagen: 4, seccion: "anexo" },
      { imagen: 99, seccion: "anexo" },
    ],
    firmaImagen: 7,
  },
  numerosOS10(),
);
const htmlFotos = ofertaAHtml(conFotos, calcularTotales(conFotos), EMPRESA_DE_PRUEBA, undefined, undefined, {
  3: { uri: JPEG_VALIDO, proporcion: 2 },
  4: { uri: PNG_VALIDO, proporcion: 1.2 },
  7: { uri: PNG_VALIDO, proporcion: 1.2 },
});
assert.equal(
  (htmlFotos.match(/<figure/g) ?? []).length,
  2,
  "la 99 no tiene imagen guardada: no se dibuja, y el documento sale igual",
);
assert.ok(/<figure data-imagen="3" class="ancha">/.test(htmlFotos), "la apaisada ocupa la fila completa");
assert.equal((htmlFotos.match(/class="rubrica"/g) ?? []).length, 1, "una firma, no una por firmante");

// La prueba que importa: la grilla del diagrama está DENTRO de la sección de
// metodología, antes de que empiece la siguiente sección.
// El título de la SECCIÓN, no su línea del índice de la portada: el índice lista
// todos los títulos y buscar el texto suelto caía ahí.
const metodologia = htmlFotos.indexOf("Metodología y secuencia de trabajo</span></h2>");
const siguiente = htmlFotos.indexOf("<h2", metodologia + 10);
const grillaAncha = htmlFotos.search(/<figure data-imagen="\d+" class="ancha">/);
assert.ok(
  metodologia > 0 && grillaAncha > metodologia && grillaAncha < siguiente,
  "el diagrama sale en la metodología, no al final del documento",
);

// Y el respaldo: una imagen asignada a una sección que este documento NO tiene no
// puede desaparecer. Elegir una imagen y que no salga en ninguna parte es lo peor
// que puede hacer esa pantalla, así que cae al anexo.
const sinEsaSeccion = armarOferta(
  { ...letraOS10(), ubicacionImagenes: [{ imagen: 3, seccion: "especificaciones" }], firmaImagen: 0 },
  { ...numerosOS10() },
);
const htmlRescatada = ofertaAHtml(
  sinEsaSeccion,
  calcularTotales(sinEsaSeccion),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  { 3: { uri: JPEG_VALIDO, proporcion: 1.2 } },
);
assert.equal(sinEsaSeccion.especificaciones, null, "el borrador no trae especificaciones");
assert.equal(
  (htmlRescatada.match(/<figure/g) ?? []).length,
  1,
  "la imagen sale igual, en el anexo, en vez de perderse",
);

// Una imagen que no pasa el control no se dibuja, y no rompe el documento.
const htmlRoto = ofertaAHtml(conFotos, calcularTotales(conFotos), EMPRESA_DE_PRUEBA, undefined, undefined, {
  3: { uri: 'data:image/jpeg;base64,AA" onerror="alert(1)', proporcion: 1.2 },
});
assert.ok(!htmlRoto.includes("onerror"), "ninguna imagen puede colar un atributo");
assert.ok(!htmlRoto.includes("<figure"), "y si ninguna pasa, la grilla no se dibuja");

// ── Lo que ve alguien cuando una subida falla ───────────────────────────────
//
// El caso real: subir un maestro en PDF mostró "JSON.parse: unexpected character
// at line 1 column 1 of the JSON data". Eso no es un error del archivo, es el
// código haciendo respuesta.json() sobre algo que no era JSON. Cada una de estas
// respuestas tiene que salir con una causa nombrada.
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

assert.deepEqual(await leerRespuesta<{ id: string }>(json({ id: "abc" })), { id: "abc" });

await assert.rejects(
  () => leerRespuesta(json({ error: "El maestro tiene que ser un PDF." }, 400)),
  /El maestro tiene que ser un PDF/,
  "un error que el servidor explicó se muestra tal cual",
);

// El guard de una página redirige al login: llega HTML con 200 y ningún JSON.
await assert.rejects(
  () => leerRespuesta(new Response("<!doctype html><html><body>Ingresar</body></html>")),
  /sesión/i,
  "una página donde debía haber JSON se explica como sesión vencida",
);

// La plataforma corta el cuerpo antes de que el código lo vea.
await assert.rejects(
  () => leerRespuesta(new Response("Request Entity Too Large", { status: 413 })),
  /tope|grande/i,
);
await assert.rejects(() => leerRespuesta(new Response("", { status: 504 })), /tardó/i);
await assert.rejects(() => leerRespuesta(new Response("", { status: 401 })), /sesión/i);

// Y lo que no se puede clasificar dice el status y lo que vino, para poder
// reportarlo: un mensaje inútil pero honesto es mejor que uno del parser.
await assert.rejects(() => leerRespuesta(new Response("kaboom", { status: 500 })), /HTTP 500[\s\S]*kaboom/);

// El tope se revisa antes de mandar el archivo, no después.
assert.equal(avisoDeTamano(new File([new Uint8Array(1024)], "chico.pdf")), null);
const grande = avisoDeTamano(new File([new Uint8Array(5 * 1024 * 1024)], "grande.pdf"));
assert.ok(grande?.includes("grande.pdf") && grande.includes("5,0 MB"), grande ?? "sin aviso");

// ── Una rúbrica por firmante ────────────────────────────────────────────────
//
// Una propuesta puede ir firmada por dos personas y cada una firma con la suya.
// El modelo, en cambio, informa UNA sola —un borrador trae una firma escaneada—
// así que las dos formas tienen que convivir: lo que leyó el modelo vale como la
// del primero mientras nadie elija otra cosa.
const legado = os10();
assert.equal(firmaDe(legado.cierre!, 0), null, "sin firma leída, el primero no firma con imagen");
legado.cierre!.firmaImagen = 7;
assert.equal(firmaDe(legado.cierre!, 0), 7, "la firma del borrador es la del primer firmante");
assert.equal(firmaDe(legado.cierre!, 1), null, "y solo la del primero");

// En cuanto alguien elige en pantalla, manda lo elegido — incluso para decir que
// esa persona NO firma con imagen. Por eso "ausente" y "null" no son lo mismo: si
// null cayera al valor del borrador, quitar una rúbrica no tendría efecto.
const elegido = os10();
elegido.cierre!.firmaImagen = 7;
elegido.cierre!.firmantes[0].firmaImagen = null;
assert.equal(firmaDe(elegido.cierre!, 0), null, "una elección en null no vuelve a la del borrador");

// Dos firmantes, dos rúbricas distintas, y el hueco reservado para los dos.
const aCuatroManos = os10();
aCuatroManos.cierre!.firmantes = [
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null, firmaImagen: 7 },
  { nombre: "Rodrigo Moraga", cargo: "Jefe de Operaciones", empresa: null, firmaImagen: 4 },
];
const htmlDosFirmas = ofertaAHtml(
  aCuatroManos,
  calcularTotales(aCuatroManos),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  { 4: { uri: JPEG_VALIDO, proporcion: 1.2 }, 7: { uri: PNG_VALIDO, proporcion: 1.2 } },
);
assert.equal((htmlDosFirmas.match(/class="rubrica"/g) ?? []).length, 2, "cada firmante firma con la suya");
assert.ok(htmlDosFirmas.includes(`data-imagen="7" src="${PNG_VALIDO}"`), "la del primero");
assert.ok(htmlDosFirmas.includes(`data-imagen="4" src="${JPEG_VALIDO}"`), "y la del segundo");

// El bloque de cada firmante lleva su `data-firma`: es el blanco al que se arrastra
// la rúbrica sobre el documento. Va en el bloque y no en el hueco de la rúbrica
// porque el hueco no existe hasta que hay alguna firma, y el caso que importa es
// justamente poner la primera. Lo que pasa al soltar se prueba en el navegador
// (npm run probar-edicion); acá se comprueba que el blanco exista.
assert.ok(
  htmlDosFirmas.includes('data-firma="0"') && htmlDosFirmas.includes('data-firma="1"'),
  "cada firmante tiene su bloque marcado para recibir la rúbrica arrastrada",
);
// Y la rúbrica dibujada lleva SU número, envuelta en su caja: es lo que le da la ×
// para sacarla. Sin esto se podía poner una firma arrastrándola y no había forma de
// sacarla desde el documento.
assert.ok(
  htmlDosFirmas.includes('<span class="rubrica-caja"><img class="rubrica" data-imagen="7"'),
  "la rúbrica del primero se puede identificar y sacar",
);
assert.ok(
  htmlDosFirmas.includes('data-imagen="4"') && htmlDosFirmas.includes('class="rubrica-caja"'),
  "y la del segundo también",
);

const htmlSinNingunaFirma = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA);
assert.ok(
  htmlSinNingunaFirma.includes('data-firma="0"'),
  "y el blanco existe también cuando todavía no hay ninguna rúbrica, que es cuando hace falta",
);

// Con uno solo firmando, el hueco se reserva igual para los dos: si no, la línea
// del que firma queda más abajo que la del que no y el bloque sale desalineado.
const soloUnaFirma = os10();
soloUnaFirma.cierre!.firmantes = [
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null, firmaImagen: 7 },
  { nombre: "Rodrigo Moraga", cargo: "Jefe de Operaciones", empresa: null, firmaImagen: null },
];
const htmlUnaFirma = ofertaAHtml(
  soloUnaFirma,
  calcularTotales(soloUnaFirma),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  { 7: { uri: PNG_VALIDO, proporcion: 1.2 } },
);
assert.equal(
  (htmlUnaFirma.match(/class="hueco-rubrica"/g) ?? []).length,
  2,
  "el hueco se reserva para los dos",
);
assert.equal((htmlUnaFirma.match(/class="rubrica"/g) ?? []).length, 1, "pero la rúbrica es una sola");

// Y una guarda chica sobre el fuente, del mismo tipo que las de abajo: la acción de
// duplicar tiene que sacar el usuario del guard —que devuelve el usuario completo— y
// no de la sesión. Pasarle el correo hacía fallar el insert, porque creado_por es un
// uuid, y en pantalla eso se veía como "A server error occurred" sin más pistas.
const acciones = readFileSync(new URL("../app/(protegido)/ofertas/acciones.ts", import.meta.url), "utf8");
const duplicar = acciones.slice(acciones.indexOf("export async function duplicarOfertaAction"));
const cuerpoDeDuplicar = duplicar.slice(0, duplicar.indexOf("\n}"));
assert.ok(
  /duplicarOferta\(id,\s*usuario\.id\)/.test(cuerpoDeDuplicar),
  "duplicar tiene que pasar el ID del usuario: creado_por es uuid, no el correo",
);

// ── Duplicar: qué se copia y qué NO ─────────────────────────────────────────
//
// Duplicar existe porque los controles de este módulo se escribieron para detectar
// copias hechas a mano. Lo que hay que probar no es que copie —eso es un spread—
// sino las tres cosas que se le SACAN, porque cada una arrastrada convierte el
// duplicado en un documento mal hecho que nadie revisa.
const original = os10();
original.identificacion.validez = "31 de agosto de 2026";
original.imagenesPorSeccion = { anexo: [4, 5] };
original.cierre!.firmantes = [
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null, firmaImagen: 7 },
];

const copia = contenidoDuplicado(original, new Date(2026, 8, 3));

assert.equal(
  copia.identificacion.numeroOferta,
  null,
  "el número se borra: dos ofertas con el mismo es lo peor",
);
assert.equal(
  copia.identificacion.fecha,
  "3 de septiembre de 2026",
  "la fecha pasa a hoy, en el formato del documento",
);
assert.equal(copia.identificacion.validez, null, "la validez se borra: dependía de la fecha anterior");

// Y lo que sí se copia, entero: si el duplicado no trajera el contenido no serviría.
assert.equal(copia.titulo, original.titulo);
assert.equal(copia.identificacion.cliente, original.identificacion.cliente);
assert.equal(copia.precio?.totalNetoImpreso, original.precio?.totalNetoImpreso);
assert.deepEqual(copia.imagenesPorSeccion, { anexo: [4, 5] }, "las fotos siguen ubicadas donde estaban");
assert.equal(firmaDe(copia.cierre!, 0), 7, "y la rúbrica sigue siendo la de su firmante");
// Sin tocar la original: se duplica, no se muda.
assert.equal(original.identificacion.numeroOferta, "OS 010-2026");
assert.equal(original.identificacion.validez, "31 de agosto de 2026");

// El duplicado nace con el aviso de que falta el número, que es correcto: es lo
// primero que hay que escribir antes de emitirlo.
const avisosDelDuplicado = detectarInconsistencias(copia, calcularTotales(copia), "");
assert.ok(
  avisosDelDuplicado.some((a) => a.tipo === "falta_dato"),
  "un duplicado sin número tiene que pedirlo de entrada",
);

// La fecha se escribe a mano y no con toLocaleDateString: es un TEXTO del contenido,
// y el formato tiene que ser el mismo en cualquier servidor.
assert.equal(fechaEnPalabras(new Date(2026, 0, 1)), "1 de enero de 2026");
assert.equal(fechaEnPalabras(new Date(2026, 11, 31)), "31 de diciembre de 2026");

// ── Toda ruta que imprima tiene que llevar su Chromium al bundle ────────────
//
// Otra comprobación sobre el fuente, y por el mismo motivo que la de abajo: este
// defecto no se ve en ninguna parte hasta que ya está en producción. Vercel arma
// cada ruta con los archivos que su análisis estático detecta, y playwright-core
// carga browsers.json de forma dinámica, así que no lo detecta. La ruta compila,
// despliega, y falla al primer uso con "Cannot find module
// .../playwright-core/browsers.json" — que pasó, con la ruta de emitir.
//
// Se recorre app/api buscando quién imprime y se exige que cada uno tenga su
// entrada en outputFileTracingIncludes. La clave escapa los segmentos dinámicos
// (\\[id\\]) porque son globs de picomatch: sin escapar, "[id]" es una clase de
// caracteres y la ruta nunca coincide —eso también está documentado en el config—.
const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
// La detección es TRANSITIVA y mira todo app/, no solo las rutas de API. La primera
// versión buscaba "lanzarNavegador" dentro de cada route.ts, y con eso se le escapó el
// caso real: una Server Action en app/(protegido)/finanzas/sii/acciones.ts que importa
// lib/sii-rcv, que a su vez abre el navegador. Compiló, desplegó, y al apretar el botón
// devolvió el error genérico de Server Components —sin decir qué módulo faltaba—.
const libDeNavegador = new Set<string>();
const archivosLib = readdirSync(new URL("../lib", import.meta.url), {
  recursive: true,
  withFileTypes: true,
})
  .filter((e) => e.isFile() && e.name.endsWith(".ts"))
  .map((e) => `${e.parentPath}/${e.name}`);

// Punto de partida: los que lo llaman directo. Después se propaga a quien los importa,
// hasta que no cambie nada — una dependencia de tres saltos necesita el Chromium igual
// que una de uno.
for (const archivo of archivosLib) {
  if (/lanzarNavegador|ofertaAPdf/.test(readFileSync(archivo, "utf8"))) libDeNavegador.add(archivo);
}
const nombreDeModulo = (archivo: string): string =>
  archivo.slice(archivo.lastIndexOf("/lib/") + "/lib/".length).replace(/\.ts$/, "");

/**
 * El fuente sin los imports de SOLO TIPO.
 *
 * Un `import type` se borra al compilar: no arrastra el módulo al bundle y por lo tanto
 * no necesita el Chromium. Sin sacarlos, esta prueba acusó a /finanzas/facturas-ih —una
 * pantalla que solo lee de la base y que importa un tipo de la cadena del scraper— y
 * habría hecho agregar una entrada de tracing que no hace falta.
 */
const sinImportsDeTipo = (fuente: string): string =>
  fuente.replace(/import\s+type\s+[\s\S]*?from\s+"[^"]+";/g, "");

for (let vuelta = 0; vuelta < 10; vuelta += 1) {
  const antes = libDeNavegador.size;
  for (const archivo of archivosLib) {
    if (libDeNavegador.has(archivo)) continue;
    const fuente = sinImportsDeTipo(readFileSync(archivo, "utf8"));
    for (const conNavegador of libDeNavegador) {
      const modulo = nombreDeModulo(conNavegador);
      const hoja = modulo.slice(modulo.lastIndexOf("/") + 1);
      if (fuente.includes(`@/lib/${modulo}"`) || fuente.includes(`./${hoja}"`)) {
        libDeNavegador.add(archivo);
        break;
      }
    }
  }
  if (libDeNavegador.size === antes) break;
}

assert.ok(libDeNavegador.size >= 3, `se esperaban varios módulos con navegador, hay ${libDeNavegador.size}`);

/** El pathname de un archivo de app/, sin los grupos de rutas. */
const pathnameDe = (carpeta: string): string => {
  const desde = carpeta.indexOf("/app/");
  const crudo = desde === -1 ? "" : carpeta.slice(desde + "/app".length);
  const limpio = crudo
    .split("/")
    .filter((seg) => seg !== "" && !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/");
  return `/${limpio}`;
};

const queImprimen = readdirSync(new URL("../app", import.meta.url), {
  recursive: true,
  withFileTypes: true,
})
  .filter((e) => e.isFile() && /^(route\.ts|page\.tsx|acciones\.ts)$/.test(e.name))
  .filter((e) => {
    const fuente = sinImportsDeTipo(readFileSync(`${e.parentPath}/${e.name}`, "utf8"));
    if (/lanzarNavegador|ofertaAPdf/.test(fuente)) return true;
    return [...libDeNavegador].some((archivo) => fuente.includes(`@/lib/${nombreDeModulo(archivo)}"`));
  })
  .map((e) => pathnameDe(e.parentPath));

assert.ok(queImprimen.length >= 3, `se esperaban varias rutas que impriman, hay ${queImprimen.length}`);
for (const ruta of new Set(queImprimen)) {
  const clave = ruta.replace(/\[([^\]]+)\]/g, "\\\\[$1\\\\]");
  assert.ok(
    config.includes(`"${clave}"`),
    `${ruta} abre un navegador (directo o por lo que importa) y no tiene entrada en ` +
      "outputFileTracingIncludes: va a desplegar bien y fallar al primer uso con " +
      '"Cannot find module .../browsers.json" — que en producción se ve como el error ' +
      "genérico de Server Components, sin decir qué falta",
  );
}

// ── Un documento que no es una oferta ───────────────────────────────────────
//
// El módulo nació asumiendo que todo borrador era una oferta técnica, y con una ficha
// técnica el resultado era un documento mutilado —sin precio ni dotación, porque no los
// tiene— más dos avisos falsos. Ahora el tipo se lee primero y decide con qué esquema.
const lecturaLibre = {
  titulo: "Ficha técnica · Equipo vulcanizador PT-1600",
  subtitulo: "Prensa de vulcanización en caliente",
  cliente: "",
  fecha: "12 de agosto de 2026",
  codigo: "FT-014",
  bloques: [
    { tipo: "parrafos", texto: "", parrafos: ["Equipo para empalmes en caliente."], columnas: [], filas: [], imagen: 0, epigrafe: "" },
    { tipo: "titulo", texto: "Características generales", parrafos: [], columnas: [], filas: [], imagen: 0, epigrafe: "" },
    {
      tipo: "tabla",
      texto: "",
      parrafos: [],
      columnas: ["Parámetro", "Valor"],
      filas: [["Ancho útil", "1.600 mm"], ["Presión", "8 bar"]],
      imagen: 0,
      epigrafe: "",
    },
    { tipo: "imagen", texto: "", parrafos: [], columnas: [], filas: [], imagen: 2, epigrafe: "Vista lateral" },
    { tipo: "subtitulo", texto: "Condiciones de operación", parrafos: [], columnas: [], filas: [], imagen: 0, epigrafe: "" },
    { tipo: "parrafos", texto: "", parrafos: ["Temperatura de trabajo 150 °C.", "Alimentación 380 V."], columnas: [], filas: [], imagen: 0, epigrafe: "" },
  ],
  porConfirmar: [],
};

const ficha = armarDocumentoLibre(lecturaLibre, "ficha_tecnica");
assert.equal(ficha.titulo, "Ficha técnica · Equipo vulcanizador PT-1600");
assert.equal(ficha.identificacion.numeroOferta, "FT-014", "el código del documento ocupa el lugar del número");
// Ni una sección de oferta: lo que no tiene, no se inventa.
for (const seccion of ["alcance", "metodologia", "organizacion", "programa", "precio", "cierre"] as const) {
  assert.equal(ficha[seccion], null, `un documento libre no trae ${seccion}`);
}
assert.deepEqual(
  ficha.bloques?.map((b) => [b.nivel, b.titulo, b.parrafos.length, b.tabla ? b.tabla.filas.length : 0]),
  [
    // Lo que venía ANTES del primer título no se descarta, pero tampoco abre una sección:
    // cuelga de la identificación, sin título, así el índice arranca en el primer título
    // de verdad en vez de con un renglón en blanco.
    ["subtitulo", "", 1, 0],
    ["titulo", "Características generales", 0, 2],
    ["subtitulo", "Condiciones de operación", 2, 0],
  ],
  "los párrafos y la tabla cuelgan del título que los precede, en orden",
);
assert.deepEqual(ficha.imagenesPorSeccion, { alcance: [2] }, "la imagen queda ubicada donde estaba");
assert.deepEqual(ficha.epigrafesDeImagenes, { 2: "Vista lateral" });

// La imagen queda DONDE ESTABA, dentro de su bloque, y no en una grilla al final: es la
// diferencia entre reproducir un documento y hacer un collage.
assert.deepEqual(
  ficha.bloques?.map((b) => b.imagenes ?? []),
  [[], [2], []],
  "la imagen cuelga del bloque que la precedía",
);

// Y se dibuja: los títulos DEL DOCUMENTO numerados y en el índice, con la piel de la casa.
const htmlFicha = ofertaAHtml(ficha, calcularTotales(ficha), EMPRESA_DE_PRUEBA);
assert.ok(htmlFicha.includes("Características generales"), "el título del documento sale impreso");
assert.ok(
  htmlFicha.includes('<li><span class="n">1</span><span>Características generales</span></li>'),
  "y es la sección 1: el primer título del documento, no el segundo detrás de una sección " +
    "que el maestro agregaba",
);
assert.ok(htmlFicha.includes("1.600 mm"), "la tabla libre se dibuja con sus celdas");

// NINGUNA sección que su autor no escribió. La tabla de identificación es del maestro y la
// portada ya trae número, fecha, cliente y quién preparó el documento: como sección
// numerada lo repetía y le metía al documento una estructura que no tenía.
assert.ok(
  !htmlFicha.includes("Identificación del documento"),
  "no se agrega la sección de identificación del maestro",
);
assert.ok(!htmlFicha.includes("Oferta técnica y económica"), "ni el rótulo de portada de la oferta");
// Pero lo que venía ANTES del primer título —el párrafo de apertura— se imprime igual, sin
// número y sin título. Es del documento; perderlo sería mutilarlo.
assert.ok(
  htmlFicha.includes("Equipo para empalmes en caliente"),
  "el contenido que va antes del primer título se imprime",
);
assert.ok(
  !/<h2><span class="n"><\/span>/.test(htmlFicha),
  "y sin un encabezado vacío, que deja una raya y un hueco en el papel",
);
assert.ok(!htmlFicha.includes("ANEXO"), "y sin imágenes huérfanas no aparece un anexo que nadie escribió");

// LO QUE MOTIVÓ TODO: los dos controles sin guarda —el número de oferta y la dotación en
// 0— no se levantan en un documento que no trae esas secciones. La guarda es lo que el
// documento TIENE, no su tipo: desde que la lectura respeta la estructura del original,
// una oferta nueva también llega con las secciones canónicas en null.
const avisosFicha = detectarInconsistencias(ficha, calcularTotales(ficha), "FT-014.docx");
assert.deepEqual(avisosFicha, [], "una ficha técnica no tiene número de oferta ni dotación que reclamar");
const sinCodigo = armarDocumentoLibre({ ...lecturaLibre, codigo: "" }, "ficha_tecnica");
assert.deepEqual(
  detectarInconsistencias(sinCodigo, calcularTotales(sinCodigo), "FT.docx"),
  [],
  "y sin código tampoco: no hay número de oferta que reclamarle a un documento sin esa sección",
);
// Y la guarda sigue abriendo para lo YA GUARDADO, que sí tiene esas secciones: una oferta
// vieja con el número mezclado se verifica igual que siempre (ver más arriba).
assert.ok(
  tieneSeccionesDeOferta(os10()) && !tieneSeccionesDeOferta(ficha),
  "lo que distingue a una y a otra es tener las secciones, no el tipo",
);

// Una tabla con filas más cortas que la cabecera se completa, no se corre.
const desparejo = armarDocumentoLibre(
  {
    ...lecturaLibre,
    bloques: [
      {
        tipo: "tabla",
        texto: "",
        parrafos: [],
        columnas: ["A", "B", "C"],
        filas: [["1", "2"], ["1", "2", "3", "4"]],
        imagen: 0,
        epigrafe: "",
      },
    ],
  },
  "otro",
);
assert.deepEqual(
  desparejo.bloques?.[0].tabla,
  { columnas: ["A", "B", "C", ""], filas: [["1", "2", "", ""], ["1", "2", "3", "4"]] },
  "toda fila tiene una celda por columna, y el ancho lo pone la fila más larga: recortarla " +
    "perdería un dato del documento, y un encabezado en blanco se ve y se corrige",
);

// ── Acomodar las imágenes ───────────────────────────────────────────────────
const conTresFotos = os10();
conTresFotos.imagenesPorSeccion = { anexo: [3, 4, 5] };

const movida = conLaImagenMovida(conTresFotos, 5, -1);
assert.deepEqual(movida.imagenesPorSeccion?.anexo, [3, 5, 4], "sube un lugar dentro de su sección");
assert.deepEqual(
  conLaImagenMovida(conTresFotos, 3, -1).imagenesPorSeccion?.anexo,
  [3, 4, 5],
  "la primera no sube más: en el borde no hace nada en vez de dar la vuelta",
);
assert.deepEqual(conLaImagenMovida(conTresFotos, 5, 1).imagenesPorSeccion?.anexo, [3, 4, 5]);
assert.deepEqual(conTresFotos.imagenesPorSeccion?.anexo, [3, 4, 5], "sin tocar el original");

const flotante = conLaDisposicion(conTresFotos, 4, "derecha");
assert.deepEqual(flotante.disposicionDeImagenes, { 4: "derecha" });
assert.deepEqual(
  conLaDisposicion(flotante, 4, "grilla").disposicionDeImagenes,
  {},
  "volver a la grilla borra la clave: es el valor por omisión y el dato solo guarda lo cambiado",
);
assert.equal(disposicionDe(flotante.disposicionDeImagenes, 4), "derecha");
assert.equal(disposicionDe(flotante.disposicionDeImagenes, 99), "grilla", "sin elección, la grilla");
assert.equal(
  disposicionDe({ 7: "cualquier cosa" } as never, 7),
  "grilla",
  "y un valor que no existe cae a la grilla en vez de romper el documento",
);

// La imagen al costado se dibuja ANTES del texto de la sección: un float solo lo rodea
// el texto que viene después en el marcado.
const alCostado = os10();
alCostado.imagenesPorSeccion = { alcance: [1] };
alCostado.disposicionDeImagenes = { 1: "derecha" };
const htmlCostado = ofertaAHtml(alCostado, calcularTotales(alCostado), EMPRESA_DE_PRUEBA, undefined, undefined, {
  1: { uri: PNG_VALIDO, proporcion: 1.2 },
});
const seccionAlcance = htmlCostado.slice(htmlCostado.indexOf('data-en="alcance"'));
const cuerpoAlcance = seccionAlcance.slice(0, seccionAlcance.indexOf("</section>"));
assert.ok(
  cuerpoAlcance.includes('class="flotante derecha"'),
  "la imagen sale flotando y no en la grilla",
);
assert.ok(
  cuerpoAlcance.indexOf("figure") < cuerpoAlcance.indexOf("traslado de 06 rollos"),
  "y ANTES del párrafo que la rodea: al final flotaría sobre la sección siguiente",
);

// Y la salvaguarda: sin texto al lado, una flotante volvería a dejar media página en
// blanco con la foto colgando, así que cae a la grilla.
// El caso real: un anexo que son solo fotos, sin una línea de texto.
const sinTexto = os10();
sinTexto.anexo = null;
sinTexto.imagenesPorSeccion = { anexo: [1] };
sinTexto.disposicionDeImagenes = { 1: "izquierda" };
const htmlSinTexto = ofertaAHtml(sinTexto, calcularTotales(sinTexto), EMPRESA_DE_PRUEBA, undefined, undefined, {
  1: { uri: PNG_VALIDO, proporcion: 1.2 },
});
// Se busca la CLASE de la figura y no la palabra: "flotante" también aparece en el CSS
// del documento, que va en todos.
assert.ok(
  !htmlSinTexto.includes('class="flotante'),
  "sin texto que la rodee, la flotante vuelve a la grilla",
);
assert.ok(/<div class="fotos( uniforme)?">/.test(htmlSinTexto), "y sale en la grilla");

// El reparto de imágenes lo manda la base, y eso ahora incluye la disposición: sin esto,
// guardar un párrafo devolvía todas las fotos a la grilla.
const editorSinDisposicion = os10();
const baseConDisposicion = os10();
baseConDisposicion.imagenesPorSeccion = { anexo: [4] };
baseConDisposicion.disposicionDeImagenes = { 4: "ancha" };
const guardadoConDisposicion = conElRepartoDe(editorSinDisposicion, baseConDisposicion);
assert.deepEqual(
  guardadoConDisposicion.disposicionDeImagenes,
  { 4: "ancha" },
  "la disposición sobrevive al guardado del texto",
);

// Y una imagen que se saca del documento se lleva su disposición.
const conDisposicionYFoto = os10();
conDisposicionYFoto.imagenesPorSeccion = { anexo: [4] };
conDisposicionYFoto.disposicionDeImagenes = { 4: "derecha" };
assert.deepEqual(sinLaImagen(conDisposicionYFoto, 4).disposicionDeImagenes, {});

// ── Cada uno ve sus ofertas ─────────────────────────────────────────────────
//
// Una oferta tiene precios, márgenes y dotación de un cliente concreto. La regla es
// de una línea y se equivoca en silencio: si falla de más, alguien deja de ver su
// propio trabajo; si falla de menos, ve el del cliente de otro.
const ANA = "11111111-1111-1111-1111-111111111111";
const BETO = "22222222-2222-2222-2222-222222222222";
const comoUsuario = (id: string, rol: "admin" | "usuario") =>
  ({ id, correo: `${id}@pertec.cl`, nombre: null, rol, activo: true, apps: [], rolesExtra: {} }) as
    unknown as Parameters<typeof puedeVerOferta>[1];

assert.equal(puedeVerOferta({ creadoPor: ANA }, comoUsuario(ANA, "usuario")), true);
assert.equal(puedeVerOferta({ creadoPor: BETO }, comoUsuario(ANA, "usuario")), false);
assert.equal(puedeVerOferta({ creadoPor: BETO }, comoUsuario(ANA, "admin")), true, "el admin ve todas");
// Sin dueño la ve solo el admin: mostrársela a todos filtraría datos de un cliente,
// y esconderla de todos la perdería en silencio. Y un id vacío no puede calzar con
// un creado_por en null, que filtraría el portafolio entero de una sola vez.
assert.equal(puedeVerOferta({ creadoPor: null }, comoUsuario(ANA, "usuario")), false);
assert.equal(puedeVerOferta({ creadoPor: null }, comoUsuario("", "usuario")), false);
assert.equal(puedeVerOferta({ creadoPor: null }, comoUsuario(ANA, "admin")), true);

// Y la regla aplicada en cada punto por donde se entra a UNA oferta. Es la parte
// frágil: no la regla, acordarse de usarla en la próxima ruta.
const rutasDeOferta = readdirSync(new URL("../app/api/ofertas", import.meta.url), {
  recursive: true,
  withFileTypes: true,
})
  .filter((e) => e.isFile() && e.name === "route.ts")
  .map((e) => `${e.parentPath}/${e.name}`);
assert.ok(rutasDeOferta.length >= 7, `se encontraron ${rutasDeOferta.length} rutas de ofertas`);

for (const archivo of rutasDeOferta) {
  const fuente = readFileSync(archivo, "utf8");
  // Las que trabajan sobre una oferta que YA existe: las de "[id]" y la de logos,
  // que recibe la oferta en "clave". Las otras no tienen dueño que verificar:
  // "analizar" es la que crea la oferta —y ahí anota el dueño— y "maestros" es del
  // formato, que es de la casa y no de una oferta.
  const trabajaSobreUna = archivo.includes("/[id]/") || archivo.endsWith("/logos/route.ts");
  if (!trabajaSobreUna) continue;
  assert.ok(
    fuente.includes("accesoAOfertaApi"),
    `${archivo.slice(archivo.indexOf("/app/api"))} trabaja sobre una oferta por su id: tiene que pasar ` +
      "por accesoAOfertaApi, que además del acceso a la app verifica de quién es",
  );
}

// Lo mismo del lado de las Server Actions.
for (const accion of [
  "eliminarOfertaAction",
  "duplicarOfertaAction",
  "asignarMaestroAction",
  "elegirImagenesAction",
]) {
  const cuerpo = acciones.slice(acciones.indexOf(`export async function ${accion}`));
  assert.ok(
    cuerpo.slice(0, cuerpo.indexOf("\n}")).includes("exigirOferta("),
    `${accion} recibe el id de una oferta: tiene que pasar por exigirOferta, no solo por exigirAccesoOfertas`,
  );
}

// ── Marcar un aviso como revisado ───────────────────────────────────────────
//
// Varios avisos se revisan y quedan igual a propósito —el borrador dice "$ 0.-"
// porque ese ítem de verdad va en cero— y sin poder marcarlos, la lista pedía revisar
// nueve cosas para siempre, que es la forma más rápida de que nadie la mire.
//
// Lo delicado es que las inconsistencias NO se guardan: se recalculan en cada
// guardado y en cada tecla del editor. Por eso la marca es una clave que incluye el
// detalle, y no una posición.
const avisoSuma: Inconsistencia = {
  tipo: "suma_precios",
  detalle: "El TOTAL NETO impreso dice $ 100 y la suma da $ 120.",
  origen: "aritmetica",
};
const avisoCero: Inconsistencia = {
  tipo: "linea_precio",
  detalle: "Línea 3 quedó con valor unitario en 0.",
  origen: "aritmetica",
};
const avisos = [avisoSuma, avisoCero];

const marcado = conLaMarca([], claveDeRevision(avisoCero), true);
assert.equal(cuantasPendientes(avisos, marcado), 1, "queda uno pendiente");
assert.deepEqual(
  conRevision(avisos, marcado).map((a) => [a.tipo, a.revisada]),
  [
    ["suma_precios", false],
    ["linea_precio", true],
  ],
  "los pendientes van primero y los revisados quedan al final, no escondidos",
);

// Marcar dos veces el mismo no lo duplica, y desmarcar no se lleva al otro.
const marcadoDeNuevo = conLaMarca(marcado, claveDeRevision(avisoCero), true);
assert.deepEqual(marcadoDeNuevo, marcado, "marcar de nuevo no duplica la clave");
const conLosDos = conLaMarca(marcado, claveDeRevision(avisoSuma), true);
assert.equal(cuantasPendientes(avisos, conLosDos), 0);
assert.equal(
  cuantasPendientes(avisos, conLaMarca(conLosDos, claveDeRevision(avisoSuma), false)),
  1,
  "desmarcar uno no toca el otro",
);

// LA PRUEBA QUE IMPORTA: si el dato cambia, el detalle cambia, la clave deja de
// calzar y el aviso vuelve a aparecer SIN revisar. Lo que se revisó fue el problema
// anterior, no este.
const avisoSumaOtroMonto: Inconsistencia = { ...avisoSuma, detalle: "El TOTAL NETO impreso dice $ 100 y la suma da $ 999." };
assert.equal(
  cuantasPendientes([avisoSumaOtroMonto], conLosDos),
  1,
  "un aviso con otro monto es otro aviso: vuelve a pedir revisión",
);

// Y las marcas de avisos que ya no existen se limpian al guardar, para que la lista
// no crezca para siempre. Con la consecuencia buscada: si el problema vuelve a
// aparecer igual, vuelve sin revisar.
assert.deepEqual(revisadasVigentes(conLosDos, [avisoCero]), [claveDeRevision(avisoCero)]);
assert.deepEqual(revisadasVigentes(conLosDos, []), [], "sin avisos no queda ninguna marca");
assert.equal(
  cuantasPendientes(avisos, revisadasVigentes(conLosDos, [avisoCero])),
  1,
  "el que se arregló y volvió, vuelve sin revisar",
);

// La clave distingue el tipo: dos controles distintos con el mismo texto no se
// marcan juntos.
assert.notEqual(
  claveDeRevision({ ...avisoCero, tipo: "falta_dato" }),
  claveDeRevision(avisoCero),
  "la clave incluye el tipo",
);
// Y no se rompe con espacios de más al principio o al final del detalle.
assert.equal(
  claveDeRevision({ ...avisoCero, detalle: `  ${avisoCero.detalle}  ` }),
  claveDeRevision(avisoCero),
);

// ── Buscar y filtrar el listado ─────────────────────────────────────────────
const comoOferta = (parte: Partial<OfertaResumen>): OfertaResumen =>
  ({
    id: parte.nombre ?? "x",
    nombre: "OS 010-2026 · TRASLADO DE ROLLOS",
    numeroOferta: "OS 010-2026",
    cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
    faena: "Angamos",
    empresa: "PERFORMANCE TECHNOLOGIES",
    estado: "borrador",
    cantidadInconsistencias: 0,
    // Por defecto, todo lo que se levantó está pendiente: es el caso normal.
    pendientes: parte.cantidadInconsistencias ?? 0,
    revisadas: [],
    maestroId: null,
    logoClienteRuta: null,
    logoClienteNombre: null,
    imagenes: [],
    emision: null,
    creadoPor: ANA,
    actualizadoEn: "2026-08-20T12:00:00.000Z",
    ...parte,
  }) as OfertaResumen;

const listado = [
  comoOferta({ nombre: "OS 010-2026 · TRASLADO DE ROLLOS", creadoPor: ANA }),
  comoOferta({
    nombre: "OS 011-2026 · CAMBIO DE CORREA CT-7",
    cliente: "CODELCO",
    faena: "Radomiro",
    estado: "emitida",
    cantidadInconsistencias: 3,
    creadoPor: BETO,
    actualizadoEn: "2026-08-27T09:00:00.000Z",
  }),
  comoOferta({
    nombre: "OS 012-2026 · EMPALMES",
    empresa: "PERFORMANCE SERVICES",
    cantidadInconsistencias: 1,
    actualizadoEn: "2026-07-01T09:00:00.000Z",
  }),
];
const cuales = (f: Partial<FiltrosDeOfertas>, autores: Record<string, string> = {}) =>
  filtrarOfertas(listado, { ...FILTROS_VACIOS, ...f }, autores).map((o) => o.numeroOferta ?? o.nombre);

assert.equal(cuales({}).length, 3, "sin filtros pasan todas");
// El texto busca por lo que uno recuerda de una oferta, no solo por su nombre.
assert.deepEqual(cuales({ texto: "codelco" }), ["OS 010-2026"], "por cliente");
assert.deepEqual(cuales({ texto: "radomiro" }), ["OS 010-2026"], "por faena");
assert.deepEqual(cuales({ texto: "empalmes" }), ["OS 010-2026"], "por el nombre del servicio");
assert.deepEqual(cuales({ texto: "  CODELCO  " }), ["OS 010-2026"], "sin distinguir mayúsculas ni espacios");
assert.deepEqual(cuales({ texto: "nada de esto" }), [], "y no inventa coincidencias");

assert.equal(cuales({ estado: "emitida" }).length, 1);
assert.equal(cuales({ estado: "borrador" }).length, 2);
assert.equal(cuales({ empresa: "PERFORMANCE SERVICES" }).length, 1);
assert.equal(cuales({ soloPorRevisar: true }).length, 2, "solo las que tienen algo que mirar");
// Y una con todo revisado deja de tener "algo por revisar", que es de lo que se trata.
assert.equal(
  filtrarOfertas(
    [comoOferta({ cantidadInconsistencias: 4, pendientes: 0 })],
    { ...FILTROS_VACIOS, soloPorRevisar: true },
  ).length,
  0,
  "con todo revisado, no queda nada por revisar",
);

// Las fechas se comparan como texto "aaaa-mm-dd", que es lo que entrega el input de
// fecha: así no hay husos horarios en el medio moviendo un día.
assert.equal(cuales({ desde: "2026-08-01" }).length, 2);
assert.equal(cuales({ hasta: "2026-08-20" }).length, 2);
assert.equal(cuales({ desde: "2026-08-20", hasta: "2026-08-20" }).length, 1, "el día exacto entra");

// Los filtros se acumulan, no se reemplazan.
assert.equal(cuales({ estado: "borrador", soloPorRevisar: true }).length, 1);

// Buscar por autor solo sirve cuando el listado trae ofertas de más de una persona,
// que es el caso del admin: es cómo se queda con las de una sola sin otro control.
assert.deepEqual(cuales({ texto: "beto" }, { [BETO]: "Beto Pérez" }), ["OS 010-2026"]);
assert.deepEqual(cuales({ texto: "beto" }), [], "sin los nombres cargados no hay por dónde buscarlo");

assert.equal(hayFiltros(FILTROS_VACIOS), false);
assert.equal(hayFiltros({ ...FILTROS_VACIOS, texto: " " }), false, "un espacio no es un filtro puesto");
assert.equal(hayFiltros({ ...FILTROS_VACIOS, soloPorRevisar: true }), true);

// ── Y el diálogo de emisión tiene que estar donde se pueda ver ──────────────
//
// Esta comprobación mira el código fuente, que no es lo habitual, y existe por una
// razón concreta: el diálogo quedó una vez DENTRO del fragmento de la pestaña
// Formulario. Con el Documento a la vista —que es lo normal— apretar Emitir cambiaba
// el estado y no dibujaba nada: un botón muerto. Ni TypeScript ni el build lo ven,
// porque el JSX es válido en los dos lugares, y las pruebas de navegador tampoco,
// porque no renderizan React. Así que se comprueba lo único comprobable: que el
// diálogo esté ARRIBA del interruptor de pestañas, o sea fuera de las dos.
const editor = readFileSync(new URL("../components/ofertas/EditorOferta.tsx", import.meta.url), "utf8");
const dondeElModal = editor.indexOf("<ModalEmitir");
const dondeLasPestanas = editor.indexOf('vista === "documento" ?');
assert.ok(dondeElModal > 0, "el editor tiene que abrir el diálogo de emisión");
assert.ok(dondeLasPestanas > 0, "y tener el interruptor de pestañas");
assert.ok(
  dondeElModal < dondeLasPestanas,
  "el diálogo de emisión quedó dentro de una pestaña: con la otra a la vista, Emitir no hace nada",
);

// ── La emisión: el nombre del archivo y a quién se le manda ─────────────────
//
// Lo demás del paso —imprimir, subir a SharePoint, mandar por Graph— no se puede
// probar sin credenciales. Lo que sí tiene reglas propias es esto, y las dos fallan
// de formas que nadie relacionaría con la emisión: un nombre con un carácter que
// SharePoint rechaza vuelve como un 400 sin explicación, y un correo mal tipeado se
// manda a una dirección inventada.

assert.equal(
  nombreDeArchivoDeOferta("OS 010-2026", "AXINNTUS SERVICIOS INDUSTRIALES"),
  "OS 010-2026 — AXINNTUS SERVICIOS INDUSTRIALES.pdf",
  "el archivo se llama como lo buscaría una persona en una carpeta compartida",
);
// Los caracteres que SharePoint no acepta en un nombre se limpian ACÁ, no en el
// borde de Graph: "Correa 12\" / 24\"" es un nombre de cliente perfectamente normal.
assert.equal(
  nombreDeArchivoDeOferta("OS 11", 'Minera "El Litio" / Planta 2'),
  "OS 11 — Minera El Litio Planta 2.pdf",
  "un nombre con comillas o barras no puede llegar a SharePoint",
);
assert.equal(nombreDeArchivoDeOferta(null, null), "Oferta técnica.pdf", "sin datos, un nombre igual");
assert.equal(
  nombreDeArchivoDeOferta("OS 12.", null),
  "OS 12.pdf",
  "un punto al final lo recorta Windows solo",
);
assert.ok(
  nombreDeArchivoDeOferta("OS 13", "x".repeat(400)).length <= 125,
  "un nombre larguísimo se corta antes de que lo corte el servidor",
);

// Los destinatarios salen de un campo escrito a mano: la gente pega comas, punto y
// coma y saltos de línea en la misma línea.
assert.deepEqual(correosValidos("uno@pertec.cl, dos@axinntus.cl;  tres@aes.com"), [
  "uno@pertec.cl",
  "dos@axinntus.cl",
  "tres@aes.com",
]);
// Copiar un contacto de Outlook pega el nombre y el correo entre signos: se manda al
// correo, no al texto entero. Sin esto llegaba "<alan@axinntus.cl>" con los signos
// adentro —pasaba el control de forma— y Graph rechazaba el envío completo.
assert.deepEqual(correosValidos("Alan Muñoz <alan@axinntus.cl>"), ["alan@axinntus.cl"]);
assert.deepEqual(correosValidos("sin-arroba, otro@sin-punto"), [], "lo que no es un correo se descarta");
assert.deepEqual(
  correosValidos("Uno@Pertec.cl, uno@pertec.cl"),
  ["uno@pertec.cl"],
  "el mismo correo dos veces se manda una vez",
);
assert.deepEqual(correosValidos(""), [], "un campo vacío es no enviar, no enviar a nadie");

// ── Agregar y quitar imágenes ───────────────────────────────────────────────
//
// El índice de una imagen es su identidad: es lo que guardan `imagenesPorSeccion`
// y `firmaImagen`. Por eso la numeración CONTINÚA y no rellena huecos — si una
// subida nueva reusara el número de una borrada, aparecería en la sección de la
// otra, que es un error que nadie relacionaría con haber subido una foto.
assert.equal(proximoIndice([]), 1, "el 0 significa 'ninguna es la firma': se arranca en 1");
assert.equal(proximoIndice([{ indice: 3, ruta: "a", nombre: "a", ancho: 10, alto: 10 }]), 4);
assert.equal(
  proximoIndice([
    { indice: 7, ruta: "a", nombre: "a", ancho: 10, alto: 10, origen: "borrador" },
    { indice: 2, ruta: "b", nombre: "b", ancho: 10, alto: 10, origen: "subida" },
  ]),
  8,
  "continúa desde el mayor, no desde la cantidad",
);

// Y al quitarla, la imagen se va de TODOS lados. Una que ya no existe pero sigue
// nombrada es un número que no dibuja nada; y como firma deja el bloque de cierre
// con el hueco de la rúbrica reservado y vacío, peor que no tener firma.
const conImagenesPuestas = os10();
conImagenesPuestas.imagenesPorSeccion = { metodologia: [3], anexo: [4, 5] };
conImagenesPuestas.epigrafesDeImagenes = { 4: "Faena Angamos", 5: "Izaje" };
conImagenesPuestas.cierre!.firmaImagen = 4;

conImagenesPuestas.cierre!.firmantes = [
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null, firmaImagen: 4 },
  { nombre: "Rodrigo Moraga", cargo: "Jefe de Operaciones", empresa: null, firmaImagen: 5 },
];

const sinLa4 = sinLaImagen(conImagenesPuestas, 4);
assert.deepEqual(sinLa4.imagenesPorSeccion, { metodologia: [3], anexo: [5] });
assert.deepEqual(sinLa4.epigrafesDeImagenes, { 5: "Izaje" }, "su epígrafe se va con ella");
assert.equal(firmaDe(sinLa4.cierre!, 0), null, "y deja de ser la rúbrica de quien firmaba con ella");
assert.equal(firmaDe(sinLa4.cierre!, 1), 5, "sin tocar la del otro firmante");
assert.equal(conImagenesPuestas.imagenesPorSeccion?.anexo?.length, 2, "sin tocar el original");

// ── Poner una imagen donde va: sección o rúbrica ────────────────────────────
//
// Es lo que hace el arrastre sobre el documento. La firma se arrastra igual que
// cualquier foto —hasta la línea de firma de la persona— así que un destino puede
// ser una sección o un firmante, y una imagen vive en UNO: si apareciera en dos, el
// documento la dibujaría dos veces.
const firmaDelDos = conLaImagenEn(conImagenesPuestas, 3, { tipo: "firma", firmante: 1 });
assert.equal(firmaDe(firmaDelDos.cierre!, 1), 3, "la imagen queda como rúbrica de ese firmante");
assert.deepEqual(
  firmaDelDos.imagenesPorSeccion,
  { anexo: [4, 5] },
  "y sale de la sección donde estaba: no puede estar en las dos",
);
assert.equal(firmaDe(firmaDelDos.cierre!, 0), 4, "sin tocar la del otro firmante");

// La rúbrica que tenía ese firmante no se borra de la oferta: queda sin ubicar, en el
// cajón, lista para ponerse en otra parte. Reemplazar no es eliminar.
assert.ok(
  !Object.values(firmaDelDos.imagenesPorSeccion ?? {})
    .flat()
    .includes(3),
  "la reemplazada no se queda además en una sección",
);

// El camino inverso, que es el que rompía: llevar la firma a una sección tiene que
// sacarla del cierre. Y no alcanza con dejar el campo sin poner, porque ausente
// significa "nunca se eligió" y cae a la firma del borrador (ver firmaDe).
const firmaAlAnexo = conLaImagenEn(conImagenesPuestas, 4, { tipo: "seccion", seccion: "anexo" });
assert.equal(firmaDe(firmaAlAnexo.cierre!, 0), null, "deja de ser la rúbrica de quien firmaba con ella");
assert.deepEqual(firmaAlAnexo.imagenesPorSeccion, { metodologia: [3], anexo: [5, 4] });
assert.equal(
  firmaAlAnexo.cierre!.firmaImagen,
  null,
  "y deja de ser la firma del borrador: si no, un firmante agregado después en la primera posición la heredaría estando ya en una sección",
);

// Con destino null se saca de todo, que es lo que hace la × de cada foto.
const aNingunaParte = conLaImagenEn(conImagenesPuestas, 5, null);
assert.deepEqual(aNingunaParte.imagenesPorSeccion, { metodologia: [3], anexo: [4] });
assert.equal(firmaDe(aNingunaParte.cierre!, 1), null, "y también deja de ser rúbrica");
assert.equal(conImagenesPuestas.imagenesPorSeccion?.anexo?.length, 2, "sin tocar el original");

// ── El texto con el que viaja un destino ────────────────────────────────────
//
// El mismo string lo escribe el desplegable del panel, lo pone el DOM al arrastrar y
// lo lee la ruta que guarda. Las tres respuestas de leerDestino son distintas y la
// diferencia importa: vacío es "no usar" —una elección válida— y desconocido es un
// error que hay que rechazar. Tratarlos igual haría que un destino mal escrito saque
// la foto del documento en silencio.
assert.deepEqual(leerDestino("anexo", 2), { tipo: "seccion", seccion: "anexo" });
assert.deepEqual(leerDestino(textoDeFirma(1), 2), { tipo: "firma", firmante: 1 });
assert.equal(leerDestino("", 2), null, "vacío es 'no usar'");
assert.equal(leerDestino(null, 2), null);
assert.equal(leerDestino("portada", 2), undefined, "una sección que no lleva imágenes no es destino");
assert.equal(leerDestino("firma-2", 2), undefined, "ni un firmante que esta oferta no tiene");
assert.equal(leerDestino("firma-x", 2), undefined);
assert.equal(leerDestino("firma--1", 2), undefined);
assert.equal(leerDestino(textoDeFirma(0), 0), undefined, "ni una firma en una oferta sin firmantes");
assert.ok(esFirma(textoDeFirma(3)) && !esFirma("anexo"), "y se distingue una firma de una sección");

// La sección que se queda sin ninguna desaparece del reparto, en vez de quedar como
// una lista vacía que el documento tendría que saber ignorar.
const sinLa3 = sinLaImagen(conImagenesPuestas, 3);
assert.deepEqual(sinLa3.imagenesPorSeccion, { anexo: [4, 5] }, "una sección vacía no queda colgando");
assert.equal(firmaDe(sinLa3.cierre!, 0), 4, "y la rúbrica de otra imagen no se toca");

// Cada pantalla guarda lo suyo. El editor manda el contenido entero, pero el reparto
// de imágenes lo decide el panel de imágenes: sin esto, aplicar las fotos y después
// corregir un párrafo las hacía desaparecer del documento, porque la copia del editor
// se había cargado antes.
const editorViejo = os10();
editorViejo.titulo = "Título corregido";
editorViejo.imagenesPorSeccion = {};
editorViejo.cierre!.firmaImagen = null;

const enLaBase = os10();
enLaBase.imagenesPorSeccion = { anexo: [4, 5] };
enLaBase.cierre!.firmaImagen = 7;

const guardado = conElRepartoDe(editorViejo, enLaBase);
assert.equal(guardado.titulo, "Título corregido", "lo que el editor edita se guarda");
assert.deepEqual(guardado.imagenesPorSeccion, { anexo: [4, 5] }, "y el reparto de imágenes no se pisa");
assert.equal(firmaDe(guardado.cierre!, 0), 7, "ni la rúbrica elegida");

// Y la parte delicada: la rúbrica se reencuentra con su firmante POR EL NOMBRE.
// El editor puede haber movido los firmantes desde que se cargó esa copia, y por
// posición la firma de una persona terminaría debajo del nombre de otra — que es
// exactamente lo que un documento firmado no puede hacer.
const reordenado = os10();
reordenado.cierre!.firmantes = [
  { nombre: "Rodrigo Moraga", cargo: "Jefe de Operaciones", empresa: null },
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null },
];
const enLaBaseDosFirmas = os10();
enLaBaseDosFirmas.cierre!.firmantes = [
  { nombre: "Alfonso Hachim Fulgeri", cargo: "Gerente General", empresa: null, firmaImagen: 7 },
  { nombre: "Rodrigo Moraga", cargo: "Jefe de Operaciones", empresa: null, firmaImagen: 4 },
];
const trasReordenar = conElRepartoDe(reordenado, enLaBaseDosFirmas);
assert.equal(firmaDe(trasReordenar.cierre!, 0), 4, "la rúbrica sigue a Rodrigo, que ahora va primero");
assert.equal(firmaDe(trasReordenar.cierre!, 1), 7, "y la de Alfonso lo sigue a él");

// Si el nombre ya no está, la rúbrica se pierde: era de alguien que ya no firma, y
// heredarla al que ocupó su lugar sería peor que no tenerla.
const otroFirmante = os10();
otroFirmante.cierre!.firmantes = [{ nombre: "Persona Nueva", cargo: "Gerente", empresa: null }];
assert.equal(firmaDe(conElRepartoDe(otroFirmante, enLaBaseDosFirmas).cierre!, 0), null);

// ── Subtítulos agregados a mano ─────────────────────────────────────────────
//
// El maestro define qué lleva una oferta, y de eso salen la numeración, el índice,
// las sumas y los controles. Un bloque es la salida explícita para lo que el maestro
// no previó: va DENTRO de una sección, se numera con los demás subtítulos y no
// participa de ningún cálculo.
const conBloques = os10();
aplicarEstructura(conBloques, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
aplicarEstructura(conBloques, { tipo: "agregarBloque", en: "precio", nivel: "subtitulo" });
aplicarEstructura(conBloques, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
assert.deepEqual(
  conBloques.bloques?.map((b) => b.en),
  ["alcance", "alcance", "precio"],
  "cada uno va al final de LOS DE SU SECCIÓN: el orden del arreglo es el orden impreso, y mezclados saldrían intercalados",
);
assert.equal(conBloques.bloques![0].titulo, TITULO_NUEVO, "nace con un título que se ve que falta escribir");
assert.deepEqual(conBloques.bloques![0].parrafos, [""], "y con un párrafo listo para escribir");

// La tabla libre: las columnas y las celdas las pone quien escribe. La única regla
// es que toda fila tenga una celda por columna — una fila corta deja celdas que no
// se pueden editar, porque su ruta no existe.
aplicarEstructura(conBloques, { tipo: "agregarTabla", bloque: 0 });
aplicarEstructura(conBloques, { tipo: "agregarColumna", bloque: 0 });
aplicarEstructura(conBloques, { tipo: "agregarFila", bloque: 0 });
const tabla = () => conBloques.bloques![0].tabla!;
assert.equal(tabla().columnas.length, 3);
assert.deepEqual(
  tabla().filas.map((f) => f.length),
  [3, 3],
  "toda fila tiene una celda por columna",
);

tabla().filas[0] = ["a", "b", "c"];
aplicarEstructura(conBloques, { tipo: "quitarColumna", bloque: 0, columna: 1 });
assert.deepEqual(tabla().columnas.length, 2);
assert.deepEqual(tabla().filas[0], ["a", "c"], "sacar una columna se lleva SU celda de cada fila, no la última");

aplicarEstructura(conBloques, { tipo: "quitarFila", bloque: 0, fila: 1 });
assert.equal(tabla().filas.length, 1);

// La última columna no se saca: una tabla sin columnas es un rectángulo vacío que ya
// no se puede volver a llenar, porque no queda dónde apretar. Para eso está sacar la
// tabla entera.
aplicarEstructura(conBloques, { tipo: "quitarColumna", bloque: 0, columna: 0 });
aplicarEstructura(conBloques, { tipo: "quitarColumna", bloque: 0, columna: 0 });
assert.equal(tabla().columnas.length, 1, "la última columna se queda");
aplicarEstructura(conBloques, { tipo: "quitarTabla", bloque: 0 });
assert.equal(conBloques.bloques![0].tabla, null);

// Un índice que no existe no hace nada y no lanza: el documento en pantalla puede
// haber quedado un paso atrás del dato, y ahí no hacer nada es mejor que romper.
aplicarEstructura(conBloques, { tipo: "agregarFila", bloque: 99 });
aplicarEstructura(conBloques, { tipo: "quitarParrafo", bloque: 0, parrafo: 99 });
aplicarEstructura(conBloques, { tipo: "quitarBloque", bloque: 2 });
assert.equal(conBloques.bloques!.length, 2);

// Un bloque recién agregado NO se imprime: sería un subtítulo numerado y en blanco
// en el documento que va al cliente. En el editor sí se ve, porque si no, apretar
// "+ Subtítulo" no mostraría nada.
const reciente = os10();
aplicarEstructura(reciente, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
assert.ok(!bloqueConContenido(reciente.bloques![0]), "vacío no cuenta como contenido");
const htmlSinEditar = ofertaAHtml(reciente, calcularTotales(reciente), EMPRESA_DE_PRUEBA);
assert.ok(!htmlSinEditar.includes("data-bloque"), "el PDF no lo dibuja");
const htmlEditando = ofertaAHtml(
  reciente,
  calcularTotales(reciente),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  {},
  true,
);
assert.ok(htmlEditando.includes('data-bloque="0"'), "el editor sí, para poder escribirlo");

// Con algo escrito se imprime, en SU sección, y numerado con los subtítulos de esa
// sección: es lo que lo hace parte del documento y no un injerto al final.
const escrito = os10();
aplicarEstructura(escrito, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
escrito.bloques![0].titulo = "Accesos a la faena";
escrito.bloques![0].parrafos = ["El ingreso se coordina con 48 horas de antelación."];
aplicarEstructura(escrito, { tipo: "agregarTabla", bloque: 0 });
escrito.bloques![0].tabla!.columnas = ["Puerta", "Horario"];
escrito.bloques![0].tabla!.filas = [["Norte", "07:00 a 19:00"]];
const htmlBloque = ofertaAHtml(escrito, calcularTotales(escrito), EMPRESA_DE_PRUEBA);
const abreAlcance = htmlBloque.indexOf('data-en="alcance"');
const abreSiguiente = htmlBloque.indexOf("<section", abreAlcance + 10);
const dondeCae = htmlBloque.indexOf("Accesos a la faena");
assert.ok(
  dondeCae > abreAlcance && dondeCae < abreSiguiente,
  "el subtítulo sale dentro de su sección, no al final del documento",
);
// 2.1 actividades, 2.2 trabajos previos, 2.3 el agregado a mano.
assert.ok(
  /<h3><span class="sub">2\.3<\/span> <span data-campo="bloques\.0\.titulo">Accesos a la faena/.test(
    htmlBloque,
  ),
  "se numera con los subtítulos del maestro, sin que nadie cuente a mano",
);
assert.ok(
  htmlBloque.includes('data-campo="bloques.0.tabla.filas.0.1">07:00 a 19:00'),
  "y cada celda de la tabla libre lleva su ruta, así que se edita sobre el documento",
);

// Un bloque de una sección que esta oferta no tiene no se dibuja: no hay dónde
// ponerlo, y meterlo en otra sección sería inventar. El dato NO se pierde —si la
// sección vuelve, el subtítulo vuelve con ella— y en la práctica el caso solo
// aparece si alguien vacía la sección después: los botones de "+ Subtítulo" existen
// únicamente en las secciones que el documento está dibujando.
const enSeccionAusente = os10();
enSeccionAusente.metodologia = null;
aplicarEstructura(enSeccionAusente, { tipo: "agregarBloque", en: "metodologia", nivel: "subtitulo" });
enSeccionAusente.bloques![0].titulo = "Nada que ver";
const htmlAusente = ofertaAHtml(
  enSeccionAusente,
  calcularTotales(enSeccionAusente),
  EMPRESA_DE_PRUEBA,
);
assert.ok(!htmlAusente.includes("Nada que ver"), "sin la sección, el bloque no se dibuja en otra parte");
assert.equal(enSeccionAusente.bloques!.length, 1, "pero el dato sigue ahí");

enSeccionAusente.metodologia = { antesDeLaDetencion: ["Coordinación"], duranteLaDetencion: [] };
assert.ok(
  ofertaAHtml(enSeccionAusente, calcularTotales(enSeccionAusente), EMPRESA_DE_PRUEBA).includes(
    "Nada que ver",
  ),
  "y vuelve a salir en cuanto la sección existe",
);

// ── Títulos: una sección propia, agregada a mano ────────────────────────────
//
// Un subtítulo ordena algo DENTRO de una sección; un título es una sección más, y
// eso significa tres cosas que no se piden aparte: su número, su renglón en el
// índice y su lugar en el orden del documento. Las tres las cuenta la plantilla.
const conTitulo = os10();
aplicarEstructura(conTitulo, { tipo: "agregarBloque", en: "alcance", nivel: "titulo" });
conTitulo.bloques![0].titulo = "Plan de izaje";
conTitulo.bloques![0].parrafos = ["El izaje se ejecuta con grúa de 220 t."];
const htmlTitulo = ofertaAHtml(conTitulo, calcularTotales(conTitulo), EMPRESA_DE_PRUEBA);

// os10: 1 identificación, 2 alcance, y la agregada queda 3 — justo después de la
// sección a la que se engancha, no al final del documento.
assert.ok(
  htmlTitulo.includes('<h2><span class="n">3</span> <span data-campo="bloques.0.titulo">Plan de izaje'),
  "sale como sección propia, numerada después de su ancla",
);
assert.ok(
  htmlTitulo.includes('<li><span class="n">3</span><span>Plan de izaje</span></li>'),
  "y entra al índice de la portada con ese mismo número",
);
// Y lo que venía después se corre solo: la que era 3 ahora es 4.
assert.ok(
  htmlTitulo.includes('<span class="n">4</span> <span data-campo="rotulos.s-organizacion"'),
  "las siguientes se renumeran solas, que es de lo que se trata",
);
assert.ok(
  !htmlTitulo.includes('data-en="alcance"><h2><span class="n">3</span>'),
  "no queda adentro del alcance: es una sección aparte",
);

// Una sección agregada a mano no acepta fotos —el reparto de imágenes va por
// sección del maestro— así que no se marca como blanco de arrastre. Sí lleva su
// índice de bloque, que es lo que le pone los controles de párrafo y tabla.
assert.ok(htmlTitulo.includes('<section data-bloque="0">'), "lleva su índice y no data-seccion");

// Si la sección a la que se enganchó queda vacía, la agregada a mano SIGUE saliendo:
// es una sección propia y su ancla era solo posición. Lo contrario haría desaparecer
// en silencio un "PLAN DE IZAJE" entero por vaciar el alcance.
const anclaVacia = os10();
aplicarEstructura(anclaVacia, { tipo: "agregarBloque", en: "alcance", nivel: "titulo" });
anclaVacia.bloques![0].titulo = "Plan de izaje";
anclaVacia.alcance = { introduccion: null, actividades: [], trabajosPrevios: [], personalEspecialista: [] };
const htmlAnclaVacia = ofertaAHtml(anclaVacia, calcularTotales(anclaVacia), EMPRESA_DE_PRUEBA);
assert.ok(htmlAnclaVacia.includes("Plan de izaje"), "sobrevive a que su ancla quede vacía");
assert.ok(!htmlAnclaVacia.includes('data-en="alcance"'), "y el alcance vacío no se dibuja, como siempre");

// Las enganchadas al anexo van ANTES del anexo: el anexo cierra el documento, y una
// sección numerada después de "A" no se lee.
const antesDelAnexo = os10();
antesDelAnexo.anexo = { respaldoInstitucional: ["PERTEC."], mandantes: [], notaEquipo: null };
aplicarEstructura(antesDelAnexo, { tipo: "agregarBloque", en: "anexo", nivel: "titulo" });
antesDelAnexo.bloques![0].titulo = "Garantías";
const htmlAntes = ofertaAHtml(antesDelAnexo, calcularTotales(antesDelAnexo), EMPRESA_DE_PRUEBA);
assert.ok(
  htmlAntes.indexOf("Garantías</span></h2>") < htmlAntes.indexOf('data-en="anexo"'),
  "el anexo sigue cerrando el documento",
);

// Y un título recién agregado tampoco se imprime hasta que tenga algo: sería una
// sección numerada, en el índice, llamada "Nueva sección".
const tituloVacio = os10();
aplicarEstructura(tituloVacio, { tipo: "agregarBloque", en: "alcance", nivel: "titulo" });
assert.equal(tituloVacio.bloques![0].titulo, TITULO_NUEVO_SECCION, "nace con su propio nombre");
assert.ok(
  !ofertaAHtml(tituloVacio, calcularTotales(tituloVacio), EMPRESA_DE_PRUEBA).includes(
    TITULO_NUEVO_SECCION,
  ),
  "el PDF no lo dibuja",
);
assert.ok(
  ofertaAHtml(tituloVacio, calcularTotales(tituloVacio), EMPRESA_DE_PRUEBA, undefined, undefined, {}, true)
    .includes(TITULO_NUEVO_SECCION),
  "el editor sí",
);

// Y el control: un subtítulo agregado a mano que quedó con el nombre con el que
// nació PERO tiene contenido escrito sí sale en el PDF, y sale diciendo "Nuevo
// subtítulo" al cliente. Ese avisa; el vacío no, porque no se imprime.
const reciénAgregado = os10();
aplicarEstructura(reciénAgregado, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
assert.ok(
  !detectarInconsistencias(reciénAgregado, calcularTotales(reciénAgregado), "OS 010.pdf").some((p) =>
    p.detalle.includes(TITULO_NUEVO),
  ),
  "uno vacío no se imprime, así que no hay nada que avisar",
);
reciénAgregado.bloques![0].parrafos = ["Algo escrito."];
assert.ok(
  detectarInconsistencias(reciénAgregado, calcularTotales(reciénAgregado), "OS 010.pdf").some(
    (p) => p.tipo === "falta_dato" && p.detalle.includes(TITULO_NUEVO),
  ),
  "con contenido y sin titular, va a Por revisar",
);

// ── El puente entre el papel y el dato ──────────────────────────────────────
//
// Editar sobre el documento se apoya en una sola cosa: que cada texto impreso
// lleve la ruta del dato que lo produjo. Una ruta que apunta a un campo que no
// existe —o peor, al de OTRA fila— hace que la edición escriba en silencio en el
// lugar equivocado, que es la peor falla posible acá. Por eso se comprueban todas
// las del documento, no una muestra.
const CAMPO_IMPRESO = /data-campo="([^"]+)"(?: data-tipo="(numero)")?>([^<]*)</g;
const desescapar = (texto: string) =>
  texto
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

let camposAtados = 0;
const rotulosImpresos = new Set<string>();
for (const [, ruta, tipo, impreso] of htmlFotos.matchAll(CAMPO_IMPRESO)) {
  camposAtados += 1;

  // Los rótulos son la excepción y por una razón: son un diccionario donde la clave
  // ausente significa "usa el del maestro", así que NO tienen que llevar a un dato.
  // Lo que sí se comprueba es que la clave exista en el catálogo —una mal escrita
  // sería un título que no se puede editar y nadie sabría por qué— y que lo impreso
  // sea el rótulo que corresponde.
  if (ruta.startsWith("rotulos.")) {
    const clave = ruta.slice("rotulos.".length);
    assert.ok(clave in ROTULOS, `el rótulo "${clave}" no está en el catálogo ROTULOS`);
    assert.equal(desescapar(impreso), ROTULOS[clave], `el rótulo impreso en ${clave}`);
    rotulosImpresos.add(clave);
    continue;
  }

  const valor = leerEnRuta(conFotos, ruta);
  assert.notEqual(valor, undefined, `la ruta "${ruta}" no lleva a ningún dato de la oferta`);
  // Un campo en null se imprime con el texto que pone la plantilla por defecto
  // —la nota del precio— y ahí no hay nada que comparar.
  if (valor === null) continue;
  if (tipo === "numero") {
    assert.equal(numeroDesdeTexto(desescapar(impreso)), valor, `el número impreso en ${ruta}`);
  } else {
    assert.equal(desescapar(impreso), String(valor), `el texto impreso en ${ruta}`);
  }
}
// El número exacto no importa; que sean muchos, sí: si un cambio dejara la mitad
// del documento sin atar, la prueba de arriba pasaría igual.
assert.ok(camposAtados > 40, `el documento se edita por sus campos (encontrados: ${camposAtados})`);

// Y al revés: cada rótulo del catálogo tiene que SALIR en un documento que use
// todas las secciones. Uno que quedó en el catálogo y ya nadie dibuja es un rótulo
// que la pantalla ofrece cambiar y no cambia nada.
const conTodo = os10();
conTodo.metodologia = { antesDeLaDetencion: ["Reunión de coordinación"], duranteLaDetencion: ["Empalme"] };
conTodo.especificaciones = [{ parametro: "Ancho de cinta", especificacion: "1.800 mm" }];
conTodo.alcance!.personalEspecialista = [{ cargo: "Vulcanizador", dotacion: 2 }];
conTodo.anexo = {
  respaldoInstitucional: ["PERTEC es una empresa nacional."],
  mandantes: ["Minera Franke"],
  notaEquipo: "Equipo de alto desempeño.",
};
// Con una foto en el anexo, que es lo que hace aparecer "Fotografías de referencia".
conTodo.imagenesPorSeccion = { anexo: [1] };
const htmlTodo = ofertaAHtml(conTodo, calcularTotales(conTodo), EMPRESA_DE_PRUEBA, undefined, undefined, {
  1: { uri: PNG_VALIDO, proporcion: 1.2 },
});
const dibujados = new Set(
  [...htmlTodo.matchAll(/data-campo="rotulos\.([^"]+)"/g)].map(([, clave]) => clave),
);
// Las dos celdas de logo del encabezado se nombran en el marcado: es lo que permite
// arrastrarles una imagen encima. Lo que pasa al soltar se prueba en el navegador
// (npm run probar-edicion); acá se comprueba que el blanco exista cuando el logo NO
// está puesto, que es justo cuando hace falta — y eso es EN EL EDITOR: en el documento
// impreso, la celda del cliente sin logo no se dibuja.
const htmlConTodoEditando = ofertaAHtml(
  conTodo,
  calcularTotales(conTodo),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  { 1: { uri: PNG_VALIDO, proporcion: 1.2 } },
  true,
);
assert.ok(
  htmlConTodoEditando.includes('data-logo="casa"') &&
    htmlConTodoEditando.includes('data-logo="cliente"'),
  "al editar, el encabezado marca sus dos huecos de logo",
);
assert.ok(
  htmlTodo.includes('data-logo="casa"') && !htmlTodo.includes('data-logo="cliente"'),
  "impreso y sin logo del cliente, esa celda no existe: vacía con su borde se lee como " +
    "algo que falta",
);
const sinLogos = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA, undefined, undefined, {}, true);
assert.ok(
  sinLogos.includes('data-logo="cliente"') && sinLogos.includes('data-logo="casa"'),
  "y los marca aunque todavía no haya ningún logo cargado, que es cuando hace falta",
);

const faltantes = Object.keys(ROTULOS).filter((clave) => !dibujados.has(clave));
assert.deepEqual(faltantes, [], `rótulos del catálogo que el documento no dibuja: ${faltantes.join(", ")}`);

// El tipo lo manda el dato, no lo que se tipeó: un campo numérico sigue siendo
// número —si no, calcularTotales sumaría textos— y uno que era null vuelve a null
// al dejarlo en blanco, que es como la plantilla sabe que no tiene que imprimirlo.
const editada = os10();
assert.ok(asignarEnRuta(editada, "precio.lineas.0.valorUnitario", "$ 20.000.-", "numero"));
assert.strictEqual(editada.precio!.lineas[0].valorUnitario, 20_000);
assert.equal(calcularTotales(editada).totalNetoCalculado, 20_000, "y el total lo vuelve a calcular");
assert.ok(asignarEnRuta(editada, "programa.turnos.0.horas", "12"));
assert.strictEqual(editada.programa!.turnos[0].horas, 12, "el tipo sale del dato, sin declararlo");
assert.ok(asignarEnRuta(editada, "programa.nota", "   "));
assert.strictEqual(editada.programa!.nota, null, "vaciar un campo opcional lo devuelve a null");
assert.ok(asignarEnRuta(editada, "identificacion.atencion", "Sr.\u00a0Alan Mu\u00f1oz"));
assert.equal(editada.identificacion.atencion, "Sr. Alan Muñoz", "el espacio duro del navegador no se guarda");

// Una ruta que no existe no crea nada, y ninguna toca el prototipo: la ruta viene
// del DOM, y aunque hoy la escriba el servidor, el que la lee no tiene por qué
// confiar en ella.
assert.ok(!asignarEnRuta(editada, "precio.lineas.9.cargo", "x"), "una fila que no existe no se inventa");
assert.ok(!asignarEnRuta(editada, "__proto__.colado", "x"));
assert.ok(!asignarEnRuta(editada, "identificacion.constructor.prototype.colado", "x"));
assert.equal(({} as Record<string, unknown>).colado, undefined, "nada se coló al prototipo");

// Y el ida y vuelta completo: lo que se escribe por la ruta sale impreso en TODOS los
// lugares donde el documento muestra ese dato —el encabezado, la portada y la tabla de la
// sección 1— y en los tres se puede escribir.
assert.ok(asignarEnRuta(editada, "identificacion.numeroOferta", "OS 011-2026"));
const htmlEditada = ofertaAHtml(editada, calcularTotales(editada), EMPRESA_DE_PRUEBA);
assert.equal(
  (htmlEditada.match(/data-campo="identificacion\.numeroOferta">OS 011-2026</g) ?? []).length,
  3,
  "el dato editado sale en el encabezado, en la portada y en la identificación",
);

// Y un dato que el borrador NO trajo se tiene que poder agregar. Una fila sin valor no se
// imprime —sería una etiqueta con nada al lado— pero si tampoco se dibuja al editar, el
// dato no tiene dónde escribirse: la fecha que el modelo no alcanzó a leer no se podía
// completar, y desde afuera se ve como que el documento no permite cambiar la fecha.
const sinFecha = os10();
sinFecha.identificacion = { ...sinFecha.identificacion, fecha: "" };
const impresoSinFecha = ofertaAHtml(sinFecha, calcularTotales(sinFecha), EMPRESA_DE_PRUEBA);
const editandoSinFecha = ofertaAHtml(
  sinFecha,
  calcularTotales(sinFecha),
  EMPRESA_DE_PRUEBA,
  undefined,
  undefined,
  {},
  true,
);
assert.ok(
  editandoSinFecha.includes('<td data-campo="identificacion.fecha"></td>'),
  "al editar, la fila de la fecha vacía se dibuja para poder completarla",
);
assert.ok(
  !impresoSinFecha.includes('data-campo="identificacion.fecha"></td>'),
  "y en el PDF no: una etiqueta con nada al lado no se imprime",
);
// En el encabezado —que es donde se mira la fecha— también se escribe. Impreso lleva un
// guion, porque la etiqueta "Fecha" sola se lee como un error de armado; al editar va
// vacío, para escribir encima sin tener que borrar el guion primero.
assert.ok(
  impresoSinFecha.includes('Fecha <b data-campo="identificacion.fecha">—</b>'),
  "impreso, un dato que falta sale con guion",
);
assert.ok(
  editandoSinFecha.includes('Fecha <b data-campo="identificacion.fecha"></b>'),
  "y al editar va vacío, con el 'Escribir aquí' del editor",
);

console.log(`
Controles de una oferta técnica — OS 010-2026

  dotación total        ${totales.dotacionTotal} personas
  programa              ${totales.cantidadTurnos} turno · ${totales.horasPrograma} h
  total neto calculado  $${totales.totalNetoCalculado.toLocaleString("es-CL")}
  avisos en la correcta ${sinProblemas.length}

Y el saneo del estilo de un maestro: hex inválido, tamaño fuera de rango,
inyección de CSS por color, por fuente y por rótulo, y un par fondo/texto sin
contraste — dos hexes perfectos que dejaban la fila de total como una banda negra
con el texto negro adentro. Más los logos: solo pasa un
PNG en base64, y lo que no pasa deja el encabezado en texto. Las imágenes del
borrador salen DONDE ESTABAN: cada una lleva su sección, el diagrama queda dentro de
la metodología y las fotos en el anexo. Se limpian repetidos, ceros, fracciones y
secciones inexistentes; una apaisada ocupa la fila completa; un número sin imagen
guardada no se dibuja; y una asignada a una sección que el documento no tiene cae al
anexo en vez de perderse.

El esquema de salida tiene que ser chico y plano —la API rechaza gramáticas
grandes— así que la lectura va en dos partes, la letra y los números, y la
estructura la arma el servidor. Probada esa costura: la misma OS 010-2026 armada
desde las dos lecturas planas da los mismos totales y ningún aviso, una sección
vacía vuelve a null, el blanco vuelve a null, los porConfirmar de las dos partes se
juntan sin repetidos, y un total en 0 es "no impreso" y no un total de cero pesos. Y las subidas: una
página de login, un 413 y un 504 salen con su causa nombrada, no con el error del
parser de JSON.

Las firmas: una por firmante, porque una propuesta puede ir firmada por dos
personas. Lo que leyó el modelo —que informa una sola— vale como la del primero
mientras nadie elija; en cuanto alguien elige, manda lo elegido, incluso para
decir que esa persona no firma con imagen. Al reordenar firmantes cada rúbrica
sigue a SU persona, por el nombre y no por la posición, y si ese nombre ya no
está se pierde en vez de heredarse.

Duplicar: se copia todo el contenido y se le sacan las tres cosas que hacen peligroso
un duplicado —el número, que en blanco se pide de entrada; la fecha, que pasa a hoy en
el formato del documento; y la validez, que dependía de la fecha vieja—. Las fotos
siguen ubicadas y cada rúbrica sigue siendo la de su firmante, y la original no se
toca.

Dos comprobaciones sobre el código, que no es lo habitual y acá se justifica: que el
diálogo de emisión no quede dentro de una pestaña —ahí el botón no hace nada y ni el
compilador ni el build lo ven— y que toda ruta que imprima con Chromium tenga su
entrada de archivos en next.config.ts, porque si falta despliega bien y falla al
primer uso. Las dos fallas ya ocurrieron.

Emitir: el nombre del archivo que queda en la carpeta compartida se limpia de los
caracteres que SharePoint rechaza —y del punto final que Windows recorta solo— antes
de que Graph devuelva un 400 sin explicación; y los destinatarios salen de un campo
escrito a mano, así que se aceptan comas, punto y coma y saltos, se extrae el correo
de un contacto pegado de Outlook, se descarta lo que no es correo y no se manda dos
veces al mismo.

Editar sobre el documento: cada texto impreso lleva la ruta del dato que lo
produjo, y se comprueban TODAS —que existan, que apunten a la fila correcta aunque
haya vacías arriba, y que el texto impreso sea el dato—. El tipo lo manda el dato:
un número sigue siendo número y un campo vaciado vuelve a null. Una ruta inventada
no crea nada y ninguna toca el prototipo. Lo que pasa DENTRO del navegador
—contenteditable, el Enter, pegar desde Word, los totales recalculándose— va en
"npm run probar-edicion", que abre un Chromium de verdad.

Detectados en los ocho borradores defectuosos: número mezclado, suma que no da,
línea mal multiplicada, celda sin recalcular, dotación doble, sección heredada,
aporte de otro mandante y dato sin confirmar.
`);
// ── La estructura la pone el documento, no el maestro ──────────────────────
//
// Había dos caminos de lectura: una oferta se leía con el esquema de las diez secciones
// del maestro de PERTEC —el modelo tenía que acomodar el borrador ahí, renombrar sus
// secciones con los rótulos del maestro y descartar en `omitidas` lo que no calzara— y
// todo lo demás se transcribía tal cual. Dos borradores distintos salían iguales, y un
// documento sin la forma esperada perdía partes. Ahora hay UNA lectura, y el maestro pone
// solo la piel: tipografías, colores, encabezado, pie, numeración e índice.
const fuenteLeer = readFileSync(new URL("../lib/ofertas/leer.ts", import.meta.url), "utf8");
for (const molde of ["ESQUEMA_LETRA", "ESQUEMA_NUMEROS", "INSTRUCCIONES_LETRA", "INSTRUCCIONES_NUMEROS"]) {
  assert.ok(
    !fuenteLeer.includes(molde),
    `${molde} es el molde del maestro y no debería quedar: mientras exista, alguien lo ` +
      "vuelve a enchufar y las ofertas salen otra vez con la estructura de PERTEC",
  );
}
assert.ok(
  !/if \(!esOfertaTecnica\(lectura\.tipo\)\)/.test(fuenteLeer),
  "y no hay una rama que trate distinto a una oferta: se lee igual que cualquier documento",
);
// Dos llamadas al modelo por documento: la que dice qué es y la que lo transcribe. La
// tercera aparición es la declaración de leerParte.
assert.equal(
  (fuenteLeer.match(/await leerParte</g) ?? []).length,
  2,
  "quedan dos llamadas al modelo: la que dice qué es el documento y la que lo transcribe",
);

// La consigna al modelo, que es la mitad del cambio: solo fiel y prolijo.
const instrucciones = fuenteLeer.slice(
  fuenteLeer.indexOf("const INSTRUCCIONES_LIBRE"),
  fuenteLeer.indexOf("/**", fuenteLeer.indexOf("const INSTRUCCIONES_LIBRE")),
);
assert.ok(
  /NO HAY UNA ESTRUCTURA QUE LLENAR/.test(instrucciones) && /NO REORGANICES/.test(instrucciones),
  "se le dice que no hay estructura que llenar y que no reorganice",
);
assert.ok(
  /PROLIJ/.test(instrucciones),
  "y que la otra mitad del trabajo es que quede prolijo, que es lo único que se le pide",
);
assert.ok(
  /NO SUMES NI RECALCULES NADA/.test(instrucciones),
  "y que no calcula: eso lo hace el servidor",
);

// El formulario de las diez secciones y los controles de oferta miran lo que el documento
// TIENE, no su tipo. Con el tipo, una oferta leída así abriría con dos avisos falsos y un
// formulario vacío al lado del papel.
const fuenteEditor = readFileSync(
  new URL("../components/ofertas/EditorOferta.tsx", import.meta.url),
  "utf8",
);
const fuenteVerificar = readFileSync(new URL("../lib/ofertas/verificar.ts", import.meta.url), "utf8");
for (const [donde, fuente] of [
  ["el editor", fuenteEditor],
  ["los controles", fuenteVerificar],
] as const) {
  assert.ok(
    /tieneSeccionesDeOferta\(oferta\)/.test(fuente),
    `${donde} decide por las secciones que trae el documento, no por el tipo`,
  );
  assert.ok(
    !/esOfertaTecnica\(tipo\)/.test(fuente),
    `${donde} ya no mira el tipo para eso`,
  );
}

// ── La red que reemplaza a los cuadros calculados ──────────────────────────
//
// Los tres cuadros que el servidor sumaba —dotación, turnos, líneas de precio— existían
// solo dentro del molde, con columnas de nombre y tipo conocidos. Una tabla transcrita es
// texto. Lo que sí se puede revisar: que la fila de total cuadre con la suma de su
// columna. Cubre el error que importa —un total mal transcrito en un documento que va a
// un cliente— sin tocar nada de lo que se imprime.
assert.equal(celdaANumero("$42.358.564"), 42_358_564, "formato chileno: el punto es de miles");
assert.equal(celdaANumero("42.358.564"), 42_358_564);
assert.equal(celdaANumero("1.500"), 1500, "mil quinientos, no uno con cinco");
assert.equal(celdaANumero("1,5"), 1.5, "y la coma sí es decimal");
assert.equal(celdaANumero("1.234.567,89"), 1_234_567.89);
assert.equal(celdaANumero("  6.763.132  "), 6_763_132);
assert.equal(celdaANumero("15%"), 15);
// Number() a secas es la trampa: Number("42.358.564") es NaN —y ahí se vería el error—
// pero Number("42.358") da 42,358 y el control fallaría en silencio.
assert.notEqual(celdaANumero("42.358"), 42.358);
for (const nada of ["", "Global", "N/A", "—", "10-15", "Día", "3 turnos"]) {
  assert.equal(celdaANumero(nada), null, `"${nada}" no es una cifra que se pueda sumar`);
}

/** Un documento libre con una sola tabla, para revisar la aritmética. */
const conTabla = (columnas: string[], filas: string[][]): OfertaCanonica => ({
  ...armarDocumentoLibre(
    {
      titulo: "Cotización de repuestos",
      subtitulo: "",
      cliente: "",
      fecha: "",
      codigo: "",
      bloques: [
        // Con su título arriba, que es como llega una tabla de verdad: en el camino libre
        // el título es su propio bloque, no un campo de la tabla.
        {
          tipo: "titulo",
          texto: "Detalle de precios",
          parrafos: [],
          columnas: [],
          filas: [],
          imagen: 0,
          epigrafe: "",
        },
        { tipo: "tabla", texto: "", parrafos: [], columnas, filas, imagen: 0, epigrafe: "" },
      ],
      porConfirmar: [],
    },
    "otro",
  ),
});

const totalMalTranscrito = conTabla(
  ["Ítem", "Monto"],
  [
    ["Rollo de correa", "15.885.200"],
    ["Maniobras de izaje", "3.236.776"],
    ["TOTAL NETO", "19.121.900"],
  ],
);
const avisosTabla = revisarTablas(totalMalTranscrito);
assert.equal(avisosTabla.length, 1, "el total no cuadra y se avisa");
assert.ok(avisosTabla[0].detalle.includes("19.121.976"), "se dice cuánto suma de verdad");
assert.ok(avisosTabla[0].detalle.includes("19.121.900"), "y cuánto dice la fila de total");
assert.ok(avisosTabla[0].detalle.includes("Detalle de precios"), "y en qué tabla");
assert.equal(avisosTabla[0].origen, "aritmetica");
// El aviso NO cambia el documento: se transcribe lo que dice el papel.
assert.equal(
  totalMalTranscrito.bloques?.[0].tabla?.filas[2][1],
  "19.121.900",
  "lo que se imprime queda como lo dice el documento: el aviso es para que una persona lo corrija",
);

assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Ítem", "Monto"],
      [
        ["Rollo de correa", "15.885.200"],
        ["Maniobras de izaje", "3.236.776"],
        ["TOTAL NETO", "19.121.976"],
      ],
    ),
  ),
  [],
  "y si cuadra no dice nada",
);

// Una tabla sin título se identifica por sus columnas: "la tabla de identificacion" —la
// sección de la que cuelga— no le dice a nadie cuál es, y las columnas sí se ven en el
// papel.
const sinTitulo = armarDocumentoLibre(
  {
    titulo: "Cotización",
    subtitulo: "",
    cliente: "",
    fecha: "",
    codigo: "",
    bloques: [
      {
        tipo: "tabla",
        texto: "",
        parrafos: [],
        columnas: ["Ítem", "Monto"],
        filas: [
          ["Rollo", "10.000"],
          ["Correa", "5.000"],
          ["TOTAL", "16.000"],
        ],
        imagen: 0,
        epigrafe: "",
      },
    ],
    porConfirmar: [],
  },
  "otro",
);
const avisoSinTitulo = revisarTablas(sinTitulo);
assert.equal(avisoSinTitulo.length, 1);
assert.ok(
  avisoSinTitulo[0].detalle.includes('la tabla de "Ítem / Monto"'),
  `sin título se nombra por sus columnas (dijo: ${avisoSinTitulo[0].detalle})`,
);

// Los casos en que NO hay que opinar: sin fila de total, con una sola fila de datos, con
// la columna mezclada, o con huecos. Un control que se equivoca ensucia la lista.
assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Cargo", "Dotación", "Régimen"],
      [
        ["Supervisor", "1", "Turno de día"],
        ["Vulcanizador", "3", "Turno de día"],
        ["Ayudante", "2", "Turno de noche"],
      ],
    ),
  ),
  [],
  "sin fila de total no hay nada que verificar",
);
assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Ítem", "Monto"],
      [
        ["Servicio global", "15.885.200"],
        ["TOTAL", "15.885.200"],
      ],
    ),
  ),
  [],
  "con una sola fila de datos no hay suma que verificar",
);
assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Ítem", "Cantidad", "Unidad"],
      [
        ["Rollo", "6", "Global"],
        ["Correa", "2", "Metro"],
        ["TOTAL", "8", "—"],
      ],
    ),
  ),
  [],
  "una columna de texto no se suma, aunque la fila de total tenga algo escrito",
);
assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Ítem", "Monto"],
      [
        ["Rollo", "15.885.200"],
        ["Instalación", ""],
        ["Correa", "3.236.776"],
        ["TOTAL", "19.121.976"],
      ],
    ),
  ),
  [],
  "y una columna con huecos tampoco: no es una columna de importes",
);
// "Subtotal" no es el total: sumar hasta ahí daría un aviso falso en cualquier tabla que
// los use.
assert.deepEqual(
  revisarTablas(
    conTabla(
      ["Ítem", "Monto"],
      [
        ["Rollo", "10.000"],
        ["Correa", "5.000"],
        ["Subtotal", "15.000"],
      ],
    ),
  ),
  [],
  "una fila de subtotal no se toma como la de total",
);

// Y los avisos de tabla salen por el camino de siempre, así que aparecen en "Por revisar"
// junto a los demás.
assert.ok(
  detectarInconsistencias(totalMalTranscrito, calcularTotales(totalMalTranscrito), "cot.docx").some(
    (a) => a.detalle.includes("19.121.976"),
  ),
  "el control de tablas corre dentro de detectarInconsistencias",
);

// ── Cómo se acomodan las fotos, sin que nadie lo elija ────────────────────
//
// Antes toda imagen caía en una grilla al final de su bloque, con 60 mm de alto fijo:
// pegada debajo del texto y, si era vertical, con una banda gris a cada lado. Las tres
// disposiciones existían solo para elegirlas a mano, una por una.
//
// Ahora la disposición se calcula: ancha la que es ancha, al costado la única imagen de
// un bloque con texto que la acompañe, y en grilla el resto. La geometría de la flotante
// sale de una MEDICIÓN del cuerpo de la plantilla (CARACTERES_POR_MM), no de un número
// elegido a ojo — se renderizó el documento en una columna de 119 mm y se midieron
// párrafos de largo conocido.

/** Un documento con un bloque de texto y las imágenes que se le pasen. */
const unBloqueCon = (parrafo: string, ...cuales: number[]): OfertaCanonica =>
  armarDocumentoLibre(
    {
      titulo: "Procedimiento",
      subtitulo: "",
      cliente: "",
      fecha: "",
      codigo: "",
      bloques: [
        { tipo: "titulo", texto: "Montaje", parrafos: [], columnas: [], filas: [], imagen: 0, epigrafe: "" },
        { tipo: "parrafos", texto: "", parrafos: [parrafo], columnas: [], filas: [], imagen: 0, epigrafe: "" },
        ...cuales.map((n) => ({
          tipo: "imagen",
          texto: "",
          parrafos: [],
          columnas: [],
          filas: [],
          imagen: n,
          epigrafe: "",
        })),
      ],
      porConfirmar: [],
    },
    "procedimiento",
  );

const CUADRADA = { uri: PNG_VALIDO, proporcion: 1.05 };
const VERTICAL = { uri: PNG_VALIDO, proporcion: 300 / 520 };
const PANORAMICA = { uri: JPEG_VALIDO, proporcion: 3 };
/** Suficiente para acompañar a una figura: ~830 caracteres son unos 38 mm de alto. */
const PARRAFO_LARGO = "El empalme en caliente exige controlar la temperatura, la presión y el tiempo de curado. ".repeat(10);
const PARRAFO_CORTO = "El empalme se controla cada quince minutos.";

const dibujo = (oferta: OfertaCanonica, imgs: Record<number, { uri: string; proporcion: number }>) =>
  ofertaAHtml(oferta, calcularTotales(oferta), EMPRESA_DE_PRUEBA, undefined, undefined, imgs);

// Una panorámica va al ancho completo: a un tercio de página no se lee.
assert.ok(
  /<figure data-imagen="1" class="ancha"/.test(dibujo(unBloqueCon(PARRAFO_LARGO, 1), { 1: PANORAMICA })),
  "la apaisada ocupa el ancho completo aunque haya texto de sobra",
);

// La única imagen de un bloque con texto suficiente va AL COSTADO, con el ancho
// calculado — no un porcentaje fijo — para que mida lo mismo de alto que el texto.
const htmlAlCostado = dibujo(unBloqueCon(PARRAFO_LARGO, 1), { 1: CUADRADA });
assert.ok(
  /<figure data-imagen="1" class="flotante (derecha|izquierda)" style="width:[\d.]+mm"/.test(htmlAlCostado),
  `una sola imagen con texto suficiente va al costado (salió: ${
    htmlAlCostado.match(/<figure data-imagen="1"[^>]*>/)?.[0]
  })`,
);
// Y ANTES del párrafo: al final flotaría sobre la sección siguiente en vez de que el
// texto la rodee.
const bloque1 = htmlAlCostado.slice(htmlAlCostado.indexOf('data-bloque="0"'));
assert.ok(
  bloque1.indexOf("<figure") < bloque1.indexOf("<p data-libre"),
  "la flotante se emite antes del texto que la rodea",
);

// Con poco texto NO va al costado: la figura quedaría colgada con un hueco al lado. Cae
// a la grilla, y sola en la grilla ocupa el ancho completo en vez de media página.
const conPocoTexto = dibujo(unBloqueCon(PARRAFO_CORTO, 1), { 1: CUADRADA });
assert.ok(
  !/class="flotante/.test(conPocoTexto.slice(conPocoTexto.indexOf('data-bloque="0"'))),
  "con poco texto no flota: el hueco al costado se vería peor que la foto abajo",
);

// Dos imágenes juntas van en grilla, una al lado de la otra: es una serie —un antes y un
// después—, y flotar la primera dejaría a la segunda sola.
const dos = dibujo(unBloqueCon(PARRAFO_LARGO, 1, 2), { 1: CUADRADA, 2: CUADRADA });
assert.ok(!/class="flotante/.test(dos.slice(dos.indexOf('data-bloque="0"'))), "dos no flotan");
assert.equal(
  (dos.match(/<div class="fotos">/g) ?? []).length,
  1,
  "y van en la misma grilla, no en dos",
);

// Una vertical se marca "alta": su caja se limita por ALTO y no por ancho. Al ancho de
// media página, una foto de 1:1.7 mide 150 mm de alto.
assert.ok(
  /<figure data-imagen="1" class="alta"/.test(dibujo(unBloqueCon(PARRAFO_CORTO, 1), { 1: VERTICAL })),
  "una vertical se marca para limitarla por alto",
);
// Y la caja lleva la FORMA de la imagen, así no hay bandas grises ni salto al cargar.
assert.ok(
  /aspect-ratio:1\.0500/.test(dibujo(unBloqueCon(PARRAFO_CORTO, 1), { 1: CUADRADA })),
  "cada imagen declara su proporción",
);

// Lo elegido a mano SIEMPRE gana: quien acomoda las fotos está mirando el resultado.
const aMano = unBloqueCon(PARRAFO_CORTO, 1);
aMano.disposicionDeImagenes = { 1: "izquierda" };
assert.ok(
  /class="flotante izquierda/.test(dibujo(aMano, { 1: CUADRADA })),
  "una disposición elegida a mano gana sobre la automática",
);
const anchaAMano = unBloqueCon(PARRAFO_LARGO, 1);
anchaAMano.disposicionDeImagenes = { 1: "ancha" };
assert.ok(
  /<figure data-imagen="1" class="ancha"/.test(dibujo(anchaAMano, { 1: CUADRADA })),
  "y también para forzar el ancho completo",
);

// La geometría de la flotante: alto ≈ el del texto, más el aire tolerado. Es el invariante
// que hace que no quede un hueco al costado de la foto.
for (const [proporcion, largo] of [
  [1.05, 830],
  [300 / 520, 1200],
  [1.4, 600],
] as const) {
  const m = medidaFlotante(proporcion, largo);
  assert.ok(
    m.alto <= m.altoDelTexto + AIRE_TOLERADO_MM + 0.01,
    `una flotante de ${proporcion.toFixed(2)} con ${largo} caracteres mide ${m.alto.toFixed(1)} mm ` +
      `de alto y el texto ${m.altoDelTexto.toFixed(1)}: sobra más que el aire tolerado`,
  );
  assert.ok(m.ancho >= 30 && m.ancho <= 62, `y su ancho (${m.ancho.toFixed(1)} mm) queda en los topes`);
}
// La medición: 22 caracteres por milímetro de alto, en una columna de 119 mm.
assert.equal(CARACTERES_POR_MM, 22);
assert.equal(medidaFlotante(1, 22 * 30).altoDelTexto, 30, "660 caracteres son 30 mm de texto");

// El anexo de fotos del maestro conserva la grilla de celdas uniformes: ahí son varias
// fotos parecidas al final del documento, no la ilustración de un párrafo.
const conAnexo = os10();
conAnexo.imagenesPorSeccion = { anexo: [1, 2] };
assert.ok(
  /<div class="fotos uniforme">/.test(
    dibujo(conAnexo, { 1: CUADRADA, 2: CUADRADA }),
  ),
  "el anexo mantiene las celdas del mismo alto",
);

// ── Tres páginas: portada, índice y contenido ─────────────────────────────
//
// Iban los tres en la misma hoja —rótulo, título, datos, índice, y el primer título de
// contenido debajo— y el documento no tenía primera página: se leía como una hoja de
// resumen. Ahora la portada ocupa su hoja, el índice la siguiente y el contenido arranca
// en la de después.
const paginado = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA);
assert.ok(
  /<section class="indice-pagina">/.test(paginado),
  "el índice tiene su propia página",
);
// Y NO está adentro de la portada: si lo estuviera, el salto de página de la portada lo
// arrastraría con ella y volverían a compartir hoja.
const portada = paginado.slice(
  paginado.indexOf('<section class="portada">'),
  paginado.indexOf("</section>", paginado.indexOf('<section class="portada">')),
);
assert.ok(!portada.includes("indice"), "el índice quedó fuera de la portada");
for (const clase of ["portada", "indice-pagina"]) {
  assert.ok(
    new RegExp(`\\.${clase} \\{[^}]*page-break-after: always`).test(paginado),
    `.${clase} corta la página después`,
  );
}
// La portada ocupa su hoja de verdad y los datos se apoyan abajo: sin eso quedaba todo
// apretado contra el borde de arriba con media página en blanco debajo.
assert.ok(
  /\.portada \{[^}]*min-height: \d+mm/.test(paginado) &&
    /\.portada \.datos \{ margin-top: auto/.test(paginado),
  "la portada ocupa la hoja y apoya sus datos abajo",
);
// En una OFERTA los rótulos del maestro son los correctos y no se pisan. Antes esto no
// hacía falta porque una oferta no pasaba por armarDocumentoLibre —tenía su propio camino
// de lectura— y al unificarlo empezó a salir con "Código" en la portada en vez de
// "Oferta N°".
const ofertaLibre = armarDocumentoLibre(
  { titulo: "Servicio", subtitulo: "", cliente: "", fecha: "", codigo: "OS 010-2026", bloques: [], porConfirmar: [] },
  "oferta",
);
assert.deepEqual(ofertaLibre.rotulos, {}, "una oferta no pisa ningún rótulo del maestro");
const htmlOfertaLibre = ofertaAHtml(
  ofertaLibre,
  calcularTotales(ofertaLibre),
  EMPRESA_DE_PRUEBA,
);
assert.ok(htmlOfertaLibre.includes(ROTULOS["id-numero"]), "la portada dice Oferta N°, no Código");
assert.ok(
  htmlOfertaLibre.includes(ROTULOS["portada-rotulo"]),
  "y el rótulo de portada es el del maestro",
);
// Una ficha técnica sí los pisa: ahí "Oferta N°" es simplemente falso.
const fichaLibre = armarDocumentoLibre(
  { titulo: "Prensa", subtitulo: "", cliente: "", fecha: "", codigo: "FT-014", bloques: [], porConfirmar: [] },
  "ficha_tecnica",
);
assert.equal(fichaLibre.rotulos?.["id-numero"], "Código");

// El subtítulo del documento sale en la PORTADA. Se guardaba solo en `referencia`, que en
// un documento transcribido no se imprime en ninguna parte: se leía, se guardaba y no
// salía nunca.
const conSubtitulo = armarDocumentoLibre(
  {
    titulo: "Prensa PT-1600",
    subtitulo: "Equipo para empalmes en caliente",
    cliente: "",
    fecha: "",
    codigo: "FT-014",
    bloques: [],
    porConfirmar: [],
  },
  "ficha_tecnica",
);
assert.equal(conSubtitulo.identificacion.faena, "Equipo para empalmes en caliente");
assert.ok(
  ofertaAHtml(conSubtitulo, calcularTotales(conSubtitulo), EMPRESA_DE_PRUEBA).includes(
    '<p class="faena" data-campo="identificacion.faena">Equipo para empalmes en caliente</p>',
  ),
  "y se imprime debajo del título, donde va la faena de una oferta",
);

// El CLIENTE tiene su propio bloque en la portada, en grande: es lo segundo que se busca
// —después de qué documento es— y como una fila más de la tabla de abajo quedaba en letra
// chica entre el código y la fecha.
const conCliente = ofertaAHtml(os10(), totales, EMPRESA_DE_PRUEBA);
assert.ok(
  /<div class="para">[\s\S]{0,200}class="nombre-cliente" data-campo="identificacion\.cliente"/.test(
    conCliente,
  ),
  "el cliente va en su bloque de la portada",
);
assert.equal(
  (conCliente.match(/data-campo="identificacion\.cliente"/g) ?? []).length,
  2,
  "y no se repite en la tabla del pie: sale en la portada y en la sección de identificación",
);

// El título del índice es un rótulo editable, como los demás: en una ficha técnica puede
// decir "Contenido".
assert.ok(
  paginado.includes('data-campo="rotulos.indice-titulo"'),
  "el título del índice se puede cambiar sobre el documento",
);

// ── El código y la fecha, completados solos ───────────────────────────────
//
// El modelo transcribe lo que está escrito, así que un borrador armado copiando otro
// llega sin número y sin fecha: en el documento eso se ve como una portada a medio
// llenar, y había que escribirlos a mano en cada uno.
//
// La numeración se cuenta sobre los códigos YA usados y no con un contador aparte: un
// contador se desincroniza el día que alguien borra un documento o carga uno viejo, y
// acá lo que importa es no repetir un número que ya existe.

const EL_3_DE_SEPTIEMBRE = new Date("2026-09-03T14:00:00Z");

assert.equal(fechaEnPalabras(EL_3_DE_SEPTIEMBRE), "3 de septiembre de 2026");
// En palabras y no "03-09-2026": es lo que dicen las ofertas hechas a mano, y esta línea
// se imprime en la portada al lado del título.
assert.equal(fechaEnPalabras(new Date("2026-01-31T12:00:00Z")), "31 de enero de 2026");
// Y en la hora de Chile: a las 21:30 de acá son las 00:30 UTC del día siguiente, y un
// documento creado esa noche no puede salir con la fecha de mañana.
assert.equal(
  fechaEnPalabras(new Date("2026-09-04T01:30:00Z")),
  "3 de septiembre de 2026",
  "la fecha es la de Chile, no la del reloj del servidor",
);

// La convención real, tal como está guardada: "OS 009 – 2026" —guion largo y espacios,
// como se escribe a mano—.
assert.equal(numeroDeCodigo("OS 009 – 2026", "OS", 2026), 9);
assert.equal(numeroDeCodigo("OS 9-2026", "OS", 2026), 9, "y con guion corto y sin espacios");
assert.equal(numeroDeCodigo("os 010 — 2026", "OS", 2026), 10, "en minúscula y con raya larga");
assert.equal(numeroDeCodigo("OS 009 – 2025", "OS", 2026), null, "otro año no cuenta");
assert.equal(numeroDeCodigo("FT 001 – 2026", "OS", 2026), null, "otro prefijo tampoco");
// Los códigos que NO siguen la convención no participan: en la base hay un
// "FT-PTC-IC-01" y un "001", y de esos no se puede deducir cuál es el siguiente.
for (const raro of ["FT-PTC-IC-01", "001", "", "OS", "OS 2026"]) {
  assert.equal(numeroDeCodigo(raro, "FT", 2026), null, `"${raro}" no da un número`);
}

assert.equal(
  siguienteCodigo("oferta", 2026, ["OS 009 – 2026", "OS 007 – 2026"]),
  "OS 010 – 2026",
  "sigue al más alto, no al último cargado",
);
assert.equal(
  siguienteCodigo("oferta", 2026, ["OS 009 – 2025"]),
  "OS 001 – 2026",
  "y la numeración arranca de nuevo cada año",
);
assert.equal(siguienteCodigo("ficha_tecnica", 2026, []), "FT 001 – 2026");
assert.equal(siguienteCodigo("procedimiento", 2026, [null, "FT-PTC-IC-01"]), "PR 001 – 2026");
// Un prefijo por tipo, y ninguno repetido: dos tipos con el mismo prefijo compartirían
// la numeración y "OS 010" no diría qué documento es.
assert.equal(
  new Set(Object.values(PREFIJO_DE_TIPO)).size,
  TIPOS_DE_DOCUMENTO.length,
  "cada tipo tiene su prefijo y no se repiten",
);

// LO QUE EL BORRADOR TRAE NUNCA SE PISA: un documento que declara su código lo conserva,
// aunque no siga ninguna convención, porque ese es el código con el que se lo busca.
const traido = completarIdentidad(
  { numeroOferta: "FT-PTC-IC-01", fecha: "12 de agosto de 2026" },
  "ficha_tecnica",
  ["FT 001 – 2026"],
  EL_3_DE_SEPTIEMBRE,
);
assert.equal(traido.identificacion.numeroOferta, "FT-PTC-IC-01");
assert.equal(traido.identificacion.fecha, "12 de agosto de 2026");
assert.deepEqual(traido.completado, {}, "y no se anuncia nada, porque no se completó nada");

// Vacío o en blanco cuentan como que no vino: el modelo devuelve texto en blanco, no
// null, para lo que el documento no trae.
for (const nada of [null, "", "   "]) {
  const puesto = completarIdentidad(
    { numeroOferta: nada, fecha: nada },
    "oferta",
    ["OS 009 – 2026"],
    EL_3_DE_SEPTIEMBRE,
  );
  assert.equal(puesto.identificacion.numeroOferta, "OS 010 – 2026");
  assert.equal(puesto.identificacion.fecha, "3 de septiembre de 2026");
  assert.deepEqual(puesto.completado, {
    codigo: "OS 010 – 2026",
    fecha: "3 de septiembre de 2026",
  });
}

// El número de una OFERTA es un identificador de negocio —lo asigna Comercial y se lo
// dice al cliente— así que uno puesto por el sistema se avisa para que se confirme.
const avisoOferta = avisoDeCodigoAutomatico("oferta", { codigo: "OS 010 – 2026" });
assert.ok(avisoOferta?.includes("OS 010 – 2026"));
assert.ok(avisoOferta?.includes("Confirmalo antes de emitir"));
// En una ficha el código es interno: no se avisa. Y la fecha de hoy nunca se avisa,
// porque es la fecha de hoy — una lista de "Por revisar" que se llena de obviedades es
// una lista que nadie mira.
assert.equal(avisoDeCodigoAutomatico("ficha_tecnica", { codigo: "FT 001 – 2026" }), null);
assert.equal(avisoDeCodigoAutomatico("oferta", { fecha: "3 de septiembre de 2026" }), null);

// Y esto corre al CREAR el documento, que es donde están los códigos ya usados.
const fuenteDatos = readFileSync(new URL("../lib/ofertas/datos.ts", import.meta.url), "utf8");
const cuerpoCrear = fuenteDatos.slice(fuenteDatos.indexOf("export async function crearOferta"));
assert.ok(
  /completarIdentidad\(/.test(cuerpoCrear) && /\.select\("numero_oferta"\)/.test(cuerpoCrear),
  "crearOferta completa la identidad con los códigos que ya existen para ese tipo",
);
assert.ok(
  /\.eq\("tipo", tipo\)/.test(cuerpoCrear),
  "y cuenta solo los de SU tipo: cada prefijo lleva su propia serie",
);
assert.ok(
  /numero_oferta: documento\.identificacion\.numeroOferta/.test(cuerpoCrear) &&
    /contenido: documento/.test(cuerpoCrear),
  "y lo guardado es el documento COMPLETADO, no el que llegó",
);

console.log("Todas las verificaciones pasaron.");
