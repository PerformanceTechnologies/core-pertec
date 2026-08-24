/**
 * Los controles de una oferta técnica, con los errores que de verdad traen los
 * borradores.
 *
 * Correr con:  npm run probar-ofertas
 */

import assert from "node:assert/strict";
import { calcularTotales, detectarInconsistencias, mismoNumeroDeOferta } from "../lib/ofertas/verificar";
import type { OfertaCanonica } from "../lib/ofertas/tipos";
import { ESTILO_PERTEC, sanearEstilo } from "../lib/ofertas/estilo";
import { imagenSegura, logoSeguro } from "../lib/ofertas/logo";
import { avisoDeTamano, leerRespuesta } from "../lib/subidas";
import {
  armarOferta,
  conElRepartoDe,
  sinLaImagen,
  type LecturaLetra,
  type LecturaNumeros,
} from "../lib/ofertas/normalizar";
import { cuerpoDeTabla, ofertaAHtml, plantillasDeImpresion, referenciaDePie } from "../lib/ofertas/plantilla";
import { asignarEnRuta, leerEnRuta, numeroDesdeTexto } from "../lib/ofertas/rutas";
import { firmaDe } from "../lib/ofertas/tipos";
import { proximoIndice } from "../lib/ofertas/imagenes";

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
assert.ok(conLogoRoto.includes(ESTILO_PERTEC.rotuloLogoCliente), "y el cliente, a su rótulo");

// Y lo mismo en la caja que Chromium repite en cada página, que es otro código.
const cajas = plantillasDeImpresion(os10(), EMPRESA_DE_PRUEBA, ESTILO_PERTEC, {
  casa: PNG_VALIDO,
  cliente: "javascript:alert(1)",
});
assert.ok(cajas.headerTemplate.includes(`src="${PNG_VALIDO}"`));
assert.ok(!cajas.headerTemplate.includes("javascript:"), "el del cliente no pasó y no se dibuja");
assert.ok(cajas.headerTemplate.includes(ESTILO_PERTEC.rotuloLogoCliente));

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
  3: { uri: JPEG_VALIDO, apaisada: true },
  4: { uri: PNG_VALIDO, apaisada: false },
  7: { uri: PNG_VALIDO, apaisada: false },
});
assert.equal(
  (htmlFotos.match(/<figure/g) ?? []).length,
  2,
  "la 99 no tiene imagen guardada: no se dibuja, y el documento sale igual",
);
assert.ok(htmlFotos.includes('<figure class="ancha">'), "la apaisada ocupa la fila completa");
assert.equal((htmlFotos.match(/class="rubrica"/g) ?? []).length, 1, "una firma, no una por firmante");

// La prueba que importa: la grilla del diagrama está DENTRO de la sección de
// metodología, antes de que empiece la siguiente sección.
// El título de la SECCIÓN, no su línea del índice de la portada: el índice lista
// todos los títulos y buscar el texto suelto caía ahí.
const metodologia = htmlFotos.indexOf("Metodología y secuencia de trabajo</h2>");
const siguiente = htmlFotos.indexOf("<h2", metodologia + 10);
const grillaAncha = htmlFotos.indexOf('<figure class="ancha">');
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
  { 3: { uri: JPEG_VALIDO, apaisada: false } },
);
assert.equal(sinEsaSeccion.especificaciones, null, "el borrador no trae especificaciones");
assert.equal(
  (htmlRescatada.match(/<figure/g) ?? []).length,
  1,
  "la imagen sale igual, en el anexo, en vez de perderse",
);

// Una imagen que no pasa el control no se dibuja, y no rompe el documento.
const htmlRoto = ofertaAHtml(conFotos, calcularTotales(conFotos), EMPRESA_DE_PRUEBA, undefined, undefined, {
  3: { uri: 'data:image/jpeg;base64,AA" onerror="alert(1)', apaisada: false },
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
  { 4: { uri: JPEG_VALIDO, apaisada: false }, 7: { uri: PNG_VALIDO, apaisada: false } },
);
assert.equal((htmlDosFirmas.match(/class="rubrica"/g) ?? []).length, 2, "cada firmante firma con la suya");
assert.ok(htmlDosFirmas.includes(`<img class="rubrica" src="${PNG_VALIDO}"`), "la del primero");
assert.ok(htmlDosFirmas.includes(`<img class="rubrica" src="${JPEG_VALIDO}"`), "y la del segundo");

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
  { 7: { uri: PNG_VALIDO, apaisada: false } },
);
assert.equal(
  (htmlUnaFirma.match(/class="hueco-rubrica"/g) ?? []).length,
  2,
  "el hueco se reserva para los dos",
);
assert.equal((htmlUnaFirma.match(/class="rubrica"/g) ?? []).length, 1, "pero la rúbrica es una sola");

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
for (const [, ruta, tipo, impreso] of htmlFotos.matchAll(CAMPO_IMPRESO)) {
  camposAtados += 1;
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

// Y el ida y vuelta completo: lo que se escribe por la ruta sale impreso en los DOS
// lugares donde el documento muestra ese dato, la portada y la tabla de la sección 1.
assert.ok(asignarEnRuta(editada, "identificacion.numeroOferta", "OS 011-2026"));
const htmlEditada = ofertaAHtml(editada, calcularTotales(editada), EMPRESA_DE_PRUEBA);
assert.equal(
  (htmlEditada.match(/data-campo="identificacion\.numeroOferta">OS 011-2026</g) ?? []).length,
  2,
  "el dato editado sale en la portada y en la identificación",
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
console.log("Todas las verificaciones pasaron.");
