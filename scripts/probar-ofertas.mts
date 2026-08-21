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
import { logoSeguro } from "../lib/ofertas/logo";
import { avisoDeTamano, leerRespuesta } from "../lib/subidas";
import { normalizarLectura } from "../lib/ofertas/normalizar";
import { ofertaAHtml, plantillasDeImpresion } from "../lib/ofertas/plantilla";

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
    },
    anexo: {
      respaldoInstitucional: ["PERTEC es una empresa nacional…"],
      mandantes: ["Minera Franke"],
      notaEquipo: null,
    },
    porConfirmar: [],
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
  3,
  "van tres: la celda izquierda, la del cliente y el de la portada",
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

// ── La normalización de la lectura de un borrador ───────────────────────────
//
// Por lo mismo, el modelo devuelve las diez secciones SIEMPRE, vacías cuando no
// aplican, y los totales no impresos en 0. normalizarLectura lo traduce a la forma
// que el resto del módulo espera: si no lo hiciera, la maqueta vería secciones
// presentes y los controles verían totales impresos que no existen.
const conVacias = normalizarLectura({
  ...os10(),
  metodologia: { antesDeLaDetencion: [], duranteLaDetencion: [] },
  especificaciones: [],
  aportes: { pertec: [], cliente: [] },
  cierre: { texto: "", firmantes: [], cc: "" },
});
assert.equal(conVacias.metodologia, null, "una sección vacía no aplica: vuelve a null");
assert.equal(conVacias.especificaciones, null);
assert.equal(conVacias.aportes, null);
assert.equal(conVacias.cierre, null);
assert.ok(conVacias.precio, "y la que sí tiene datos se mantiene");
assert.equal(conVacias.organizacion?.cuadroPersonal.length, 5);

// Un total en 0 es "no está impreso", no un total de cero pesos: tratarlo como
// impreso daría el aviso falso "el TOTAL NETO impreso es $0 y la suma da $15.885.200".
const conCeros = normalizarLectura({
  ...os10(),
  precio: {
    lineas: [{ cantidad: 1, cargo: "Global", unidad: "Global", valorUnitario: 500, valorTotalImpreso: 0 }],
    totalNetoImpreso: 0,
    nota: "",
  },
});
assert.equal(conCeros.precio?.totalNetoImpreso, null);
assert.equal(conCeros.precio?.lineas[0].valorTotalImpreso, null);
const avisosCeros = detectarInconsistencias(conCeros, calcularTotales(conCeros), "os10.docx");
assert.ok(
  !avisosCeros.some((a) => /impreso es \$ 0/.test(a.detalle)),
  "no se compara contra un total que no existe",
);
assert.ok(avisosCeros.some((a) => a.tipo === "falta_dato" && /TOTAL NETO/.test(a.detalle)));

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

console.log(`
Controles de una oferta técnica — OS 010-2026

  dotación total        ${totales.dotacionTotal} personas
  programa              ${totales.cantidadTurnos} turno · ${totales.horasPrograma} h
  total neto calculado  $${totales.totalNetoCalculado.toLocaleString("es-CL")}
  avisos en la correcta ${sinProblemas.length}

Y el saneo del estilo de un maestro: hex inválido, tamaño fuera de rango e
inyección de CSS por color, por fuente y por rótulo. Más los logos: solo pasa un
PNG en base64, y lo que no pasa deja el encabezado en texto.

El esquema de salida no admite campos nullables ni opcionales, así que "no está en
el documento" se dice con un valor vacío: probado que un token en blanco cae al de
PERTEC sin figurar como inválido, que una sección vacía vuelve a null, que un total
en 0 es "no impreso" y no un total de cero pesos, y que una clave ausente no
imprime "undefined" ni inventa avisos. Y las subidas: una
página de login, un 413 y un 504 salen con su causa nombrada, no con el error del
parser de JSON.

Detectados en los ocho borradores defectuosos: número mezclado, suma que no da,
línea mal multiplicada, celda sin recalcular, dotación doble, sección heredada,
aporte de otro mandante y dato sin confirmar.
`);
console.log("Todas las verificaciones pasaron.");
