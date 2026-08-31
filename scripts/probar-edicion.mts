/**
 * ¿Se puede de verdad editar el documento adentro del iframe?
 *
 * El editor se apoya en supuestos que no se comprueban leyendo código: que con
 * `sandbox="allow-same-origin"` (y sin `allow-scripts`) la página puede manejar el
 * DOM del iframe, qué llega en `textContent`, qué hace el Enter y qué pega el
 * portapapeles. Esto ejercita el módulo REAL —lib/ofertas/edicion-dom.ts, empacado
 * con esbuild— en el Chromium de verdad.
 */
import { createServer } from "node:http";
import assert from "node:assert/strict";

import { chromium } from "playwright";
import * as esbuild from "esbuild";
import { ofertaAHtml } from "../lib/ofertas/plantilla";
import { calcularTotales } from "../lib/ofertas/verificar";
import type { OfertaCanonica } from "../lib/ofertas/tipos";
import type { prepararDocumento } from "../lib/ofertas/edicion-dom";

/** Lo que la prueba deja en el `window` de la página para poder mirarlo después. */
interface VentanaDePrueba {
  /** La copia que edita el módulo, igual que el `modelo` del componente. */
  modelo: OfertaCanonica;
  /** Lo que el módulo avisó hacia afuera, que es lo que la página guardaría. */
  avisos: { ruta: string; texto: string; tipo?: string }[];
  /** Lo que el módulo reportó al soltar o al sacar una foto. */
  sueltas: {
    indice?: number;
    destino?: string | null;
    archivos?: string[];
    quitada?: number;
    mover?: number;
    disposicion?: string;
    deLaFirma?: boolean;
    operacion?: unknown;
    logo?: string;
  }[];
  /** Las cajas de cada elemento del documento, para comparar antes y después. */
  medidas: { el: Element; caja: { x: number; y: number; w: number; h: number } }[];
  medir: () => { corridos: string[]; total: number };
  /**
   * Vuelve a tomar la maqueta como referencia.
   *
   * Hace falta porque `medir` compara SIEMPRE contra la referencia, y las pruebas
   * de escritura que corren en el medio cambian el ancho de los textos que
   * editan —eso es lo que tienen que hacer—. Sin volver a medir, una comprobación
   * de geometría posterior acusaría esos cambios legítimos.
   */
  rebase: () => void;
  alto: number;
  Edicion: { prepararDocumento: typeof prepararDocumento };
}

const oferta: OfertaCanonica = {
  titulo: "Servicio de traslado de rollos nuevos de correa a CT-6 y CT-7",
  identificacion: {
    numeroOferta: "OS 010-2026",
    fecha: "11 de agosto de 2026",
    validez: "31 de agosto de 2026",
    cliente: "AXINNTUS SERVICIOS INDUSTRIALES",
    atencion: "Sr. Alan Muñoz G.",
    copia: null,
    referencia: "Traslado de rollos a CT-6 y CT-7.",
    faena: "Central Eléctrica Angamos",
  },
  alcance: {
    introduccion: "La oferta consiste en el traslado de 06 rollos nuevos.",
    actividades: ["Traslado de 06 rollos desde bodega", "Maniobras de izaje"],
    trabajosPrevios: [],
    personalEspecialista: [],
  },
  metodologia: null,
  especificaciones: null,
  organizacion: {
    cuadroPersonal: [
      { cargo: "Supervisor", dotacion: 1, regimen: "Turno de día — 10 h" },
      { cargo: "Rigger", dotacion: 2, regimen: "Turno de día — 10 h" },
    ],
    responsabilidades: [{ cargo: "Supervisor", descripcion: "Dirige la maniobra." }],
    nota: "El servicio se ejecuta con una cuadrilla en 01 turno.",
  },
  programa: {
    introduccion: "Duración total de 10 horas.",
    turnos: [
      { turno: "T1", jornada: "Día 1 — día", horas: 10 },
      { turno: "T2", jornada: "Día 2 — día", horas: 6 },
    ],
    nota: null,
  },
  precio: {
    lineas: [
      {
        cantidad: 1,
        cargo: "Traslado de rollos.",
        unidad: "Global",
        valorUnitario: 15885200,
        valorTotalImpreso: 15885200,
      },
      {
        cantidad: 2,
        cargo: "Arriendo de grúa.",
        unidad: "Día",
        valorUnitario: 500000,
        valorTotalImpreso: 1000000,
      },
    ],
    totalNetoImpreso: 16885200,
    nota: null,
  },
  condicionesComerciales: ["La validez de esta oferta es de 21 días."],
  aportes: { pertec: ["Personal especializado"], cliente: ["Carretes de cinta nueva"] },
  cierre: {
    texto: "Quedamos a disposición.",
    // Dos, a propósito: con uno solo, "cayó en el firmante correcto" no distingue
    // de "cayó en el único que había".
    firmantes: [
      // El primero firma con una rúbrica puesta: hace falta para probar que se
      // pueda SACAR, que es la otra mitad de poder ponerla.
      {
        nombre: "Alfonso Hachim Fulgeri",
        cargo: "Gerente General",
        empresa: "Performance Technologies SpA",
        firmaImagen: 2,
      },
      { nombre: "Camila Reyes Toro", cargo: "Jefa de Operaciones", empresa: null },
    ],
    cc: "CC: Gcia. Gral. / Archivo.",
    firmaImagen: null,
  },
  // Un subtítulo agregado a mano, con su tabla libre: es lo que ejercita los
  // controles de estructura y, sobre todo, que NO muevan el documento.
  bloques: [
    {
      en: "alcance",
      titulo: "Accesos a la faena",
      parrafos: ["El ingreso se coordina con 48 horas de antelación."],
      tabla: { columnas: ["Puerta", "Horario"], filas: [["Norte", "07:00 a 19:00"]] },
    },
    // Y una sección propia agregada a mano: se numera con las del maestro y lleva
    // los mismos controles del bloque, pero como <section>.
    {
      en: "alcance",
      nivel: "titulo",
      titulo: "Plan de izaje",
      parrafos: ["El izaje se ejecuta con grúa de 220 t."],
      tabla: null,
    },
  ],
  anexo: {
    respaldoInstitucional: ["PERTEC es una empresa nacional."],
    mandantes: ["Minera Franke"],
    notaEquipo: null,
  },
  porConfirmar: [],
  imagenesPorSeccion: { anexo: [1] },
  epigrafesDeImagenes: {},
  omitidas: [],
};

const PNG_VALIDO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

/** Una identidad cargada, para que el encabezado y la firma salgan completos. */
const empresa = {
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

const documento = ofertaAHtml(oferta, calcularTotales(oferta), empresa, undefined, undefined, {
  1: { uri: PNG_VALIDO, apaisada: false },
  2: { uri: PNG_VALIDO, apaisada: false },
});

// El módulo real, empacado para poder inyectarlo en la página.
const { outputFiles } = await esbuild.build({
  entryPoints: ["lib/ofertas/edicion-dom.ts"],
  bundle: true,
  format: "iife",
  globalName: "Edicion",
  write: false,
});
const guion = outputFiles[0].text;

// El cajón de fotos vive en la PÁGINA y el documento adentro del iframe, así que
// el arrastre tiene que cruzar de uno al otro. Eso no se puede comprobar con
// eventos sintéticos: hay que arrastrar de verdad.
const padre = `<!doctype html><meta charset="utf-8"><body style="margin:0">
  <div id="cajon" draggable="true" style="width:120px;height:60px;background:#c85217;color:#fff">foto 6</div>
  <iframe id="marco" sandbox="allow-same-origin" style="width:100%;height:2400px;border:0"></iframe>
  <script>
    document.getElementById("cajon").addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("application/x-imagen-oferta", "6");
      e.dataTransfer.effectAllowed = "move";
    });
  </script></body>`;

const servidor = createServer((_peticion, respuesta) => {
  respuesta.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  respuesta.end(padre);
});
await new Promise<void>((listo) => servidor.listen(4599, listo));

const navegador = await chromium.launch({ headless: true });
try {
  const pagina = await navegador.newPage({ viewport: { width: 1280, height: 1800 } });
  pagina.on("pageerror", (e: Error) => console.error("[error en la página]", e.message));
  await pagina.goto("http://localhost:4599/");
  // tsx compila este archivo con esbuild y `keepNames`, que mete una llamada a
  // __name en cada función. Las que viajan a page.evaluate se serializan con ella
  // adentro, así que en la página tiene que existir.
  await pagina.evaluate("globalThis.__name = (f) => f");
  await pagina.addScriptTag({ content: guion });

  // Monta el documento y engancha el editor, igual que hace el componente.
  const montaje = await pagina.evaluate(
    async ([html, datos]: string[]) => {
      const marco = document.getElementById("marco") as HTMLIFrameElement;
      await new Promise<void>((listo) => {
        marco.addEventListener("load", () => listo(), { once: true });
        marco.srcdoc = html;
      });
      const doc = marco.contentDocument;
      if (!doc) return { error: "la página no puede tocar el documento del iframe" };

      const ventana = window as unknown as VentanaDePrueba;

      // La maqueta ANTES de que el editor la toque. Se guardan las referencias a los
      // nodos y no un índice: montar el editor agrega elementos —los botones de
      // quitar, la hoja de estilos— y con índices se compararían nodos distintos.
      const caja = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x * 100) / 100,
          y: Math.round(r.y * 100) / 100,
          w: Math.round(r.width * 100) / 100,
          h: Math.round(r.height * 100) / 100,
        };
      };
      const comoEsta = () => [...doc.body.querySelectorAll("*")].map((el) => ({ el, caja: caja(el) }));
      const nombre = (el: Element) =>
        `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}`;

      ventana.medidas = comoEsta();
      ventana.rebase = () => {
        ventana.medidas = comoEsta();
      };
      ventana.medir = () => {
        const corridos: string[] = [];
        for (const { el, caja: antes } of ventana.medidas) {
          const ahora = caja(el);
          if (ahora.x !== antes.x || ahora.y !== antes.y || ahora.w !== antes.w || ahora.h !== antes.h) {
            corridos.push(
              `${nombre(el)}: ${antes.x},${antes.y} ${antes.w}x${antes.h} -> ${ahora.x},${ahora.y} ${ahora.w}x${ahora.h}`,
            );
          }
        }
        return { corridos: corridos.slice(0, 8), total: corridos.length };
      };

      ventana.modelo = JSON.parse(datos);
      ventana.avisos = [];
      ventana.sueltas = [];
      ventana.alto = 0;
      ventana.Edicion.prepararDocumento(doc, {
        editable: true,
        oferta: () => ventana.modelo,
        alEditar: (ruta: string, texto: string, tipo?: string) => ventana.avisos.push({ ruta, texto, tipo }),
        alMedir: (alto: number) => (ventana.alto = alto),
        alSoltarImagen: (indice: number, destino: string) => ventana.sueltas.push({ indice, destino }),
        alSoltarArchivos: (archivos: File[], destino: string | null) => {
          ventana.sueltas.push({ archivos: archivos.map((a) => a.name), destino });
        },
        alQuitarImagen: (indice: number, deLaFirma: boolean) =>
          ventana.sueltas.push({ quitada: indice, deLaFirma }),
        alCambiarEstructura: (operacion: unknown) => ventana.sueltas.push({ operacion }),
        alMoverImagen: (indice: number, delta: number) => ventana.sueltas.push({ indice, mover: delta }),
        alDisponerImagen: (indice: number, disposicion: string) =>
          ventana.sueltas.push({ indice, disposicion }),
        alSoltarLogo: (archivo: File, cual: string) => ventana.sueltas.push({ logo: cual, archivos: [archivo.name] }),
        alUsarComoLogo: (indice: number, cual: string) => ventana.sueltas.push({ logo: cual, indice }),
      });

      const cliente = doc.querySelector<HTMLElement>('[data-campo="identificacion.cliente"]');
      return {
        // Lo que se movió al montar el editor sobre la maqueta ya dibujada.
        movidosAlMontar: ventana.medir(),
        campos: doc.querySelectorAll("[data-campo]").length,
        calculadas: doc.querySelectorAll("[data-calculado]").length,
        editable: cliente?.isContentEditable === true,
        alto: ventana.alto as number,
      };
    },
    [documento, JSON.stringify(oferta)],
  );
  console.log(montaje);
  assert.ok(!("error" in montaje), "la página tiene que poder tocar el documento del iframe");
  assert.ok(montaje.editable, "los campos tienen que quedar editables");
  assert.ok((montaje.campos ?? 0) > 40 && (montaje.calculadas ?? 0) > 3);
  assert.ok((montaje.alto ?? 0) > 500, "el alto del documento tiene que medirse para la página");

  // ── 0. Montar el editor NO puede mover la maqueta ─────────────────────────
  //
  // La prueba que faltaba. Editar sobre el documento sirve porque lo que se ve es
  // el resultado: si al montar el editor el documento se corre —aunque sea unos
  // milímetros— deja de ser el resultado y pasa a ser una aproximación, y encima
  // se nota como un salto al abrir la pestaña.
  console.log("al montar:", montaje.movidosAlMontar);
  assert.equal(
    montaje.movidosAlMontar?.total,
    0,
    `montar el editor movió ${montaje.movidosAlMontar?.total} elementos:\n  ${(montaje.movidosAlMontar?.corridos ?? []).join("\n  ")}`,
  );

  // Y tampoco puede moverla mientras se arrastra una foto por encima: la señal de
  // "acá se puede soltar" tiene que dibujarse SOBRE el documento, no adentro.
  const alArrastrar = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const seccion = doc.querySelector<HTMLElement>('section[data-seccion="anexo"]')!;
    // Igual que lo hace el módulo al arrastrar por encima: el nombre CORTO.
    seccion.dataset.soltar = "Soltar en Anexo";
    seccion.classList.add("recibiendo");
    const medida = ventana.medir();
    const rotulo = seccion.dataset.soltar;
    seccion.classList.remove("recibiendo");
    return { ...medida, rotulo };
  });
  console.log("al arrastrar por encima:", alArrastrar);
  assert.equal(
    alArrastrar.total,
    0,
    `la marca de "soltar acá" movió ${alArrastrar.total} elementos:\n  ${alArrastrar.corridos.join("\n  ")}`,
  );
  // Y dice DÓNDE va a caer, con el nombre de la sección tal como está impreso.
  assert.equal(alArrastrar.rotulo, "Soltar en Anexo", "el rótulo nombra la sección por su nombre corto");

  const enfocar = (selector: string) =>
    pagina.evaluate((sel: string) => {
      const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
      const campo = doc.querySelector<HTMLElement>(sel)!;
      campo.focus();
      doc.getSelection()!.selectAllChildren(campo);
    }, selector);

  // ── 1. Escribir un texto, con Enter incluido ──────────────────────────────
  await enfocar('[data-campo="identificacion.cliente"]');
  await pagina.keyboard.type("MINERA ESCONDIDA");
  await pagina.keyboard.press("Enter");

  const texto = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const copias = [...doc.querySelectorAll<HTMLElement>('[data-campo="identificacion.cliente"]')];
    return {
      impreso: copias.map((c) => c.textContent),
      marcado: copias[0].innerHTML,
      enElDato: ventana.modelo.identificacion.cliente,
      avisado: ventana.avisos.at(-1),
      // El Enter tiene que haber soltado el campo, no partido el texto.
      enfocado: doc.activeElement === copias[0],
    };
  });
  console.log(texto);
  assert.deepEqual(
    texto.impreso,
    ["MINERA ESCONDIDA", "MINERA ESCONDIDA"],
    "lo tecleado sale en los dos lugares donde el documento muestra ese dato",
  );
  assert.ok(!texto.marcado.includes("<"), "y queda como texto plano, sin marcado");
  assert.ok(!texto.impreso[0]!.includes("\n"), "el Enter no puede meter saltos de línea en el dato");
  assert.equal(texto.enElDato, "MINERA ESCONDIDA", "el dato de la oferta quedó escrito");
  assert.equal(texto.avisado?.ruta, "identificacion.cliente", "y la página se enteró");
  assert.equal(texto.enfocado, false, "el Enter cierra la edición");

  // ── 2. Un monto: recalcula la línea y el total, y se reformatea al salir ───
  await enfocar('[data-campo="precio.lineas.1.valorUnitario"]');
  await pagina.keyboard.type("750000");

  const mientras = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const filas = [...doc.querySelectorAll<HTMLElement>('[data-calculado="linea"]')];
    return {
      lineas: filas.map((f) => f.textContent),
      total: doc.querySelector<HTMLElement>('[data-calculado="totalNeto"]')!.textContent,
      enElDato: (window as unknown as VentanaDePrueba).modelo.precio!.lineas[1].valorUnitario,
    };
  });
  console.log(mientras);
  assert.equal(mientras.enElDato, 750_000, "el monto se guarda como número, no como texto");
  assert.equal(mientras.lineas[1], "$ 1.500.000.-", "la línea se recalcula mientras se escribe");
  assert.equal(mientras.total, "$ 17.385.200.-", "y el total neto también");

  // Al salir del campo vuelve al formato del papel.
  await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    (doc.activeElement as HTMLElement).blur();
  });
  const formateado = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    return doc.querySelector<HTMLElement>('[data-campo="precio.lineas.1.valorUnitario"]')!.textContent;
  });
  assert.equal(formateado, "$ 750.000.-", "al soltar el campo el número vuelve al formato del papel");

  // ── 3. Las horas del programa mueven el total y el avance ─────────────────
  await enfocar('[data-campo="programa.turnos.1.horas"]');
  await pagina.keyboard.type("14");
  const programa = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    return {
      horas: doc.querySelector<HTMLElement>('[data-calculado="horas"]')!.textContent,
      avances: [...doc.querySelectorAll<HTMLElement>('[data-calculado="avance"] .avance')].map(
        (a) => a.textContent,
      ),
      ancho: doc.querySelector<HTMLElement>('[data-calculado="avance"] .barra > span')!.style.width,
    };
  });
  console.log(programa);
  assert.equal(programa.horas, "24", "el total de horas se recalcula");
  assert.deepEqual(programa.avances, ["10 h de 24 h", "24 h de 24 h"], "y el avance acumulado también");
  assert.equal(programa.ancho, "42%", "la barra sigue al dato");

  // ── 4. Las celdas calculadas no se pueden escribir ────────────────────────
  const calculada = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const celda = doc.querySelector<HTMLElement>('[data-calculado="totalNeto"]')!;
    return { editable: celda.isContentEditable, ayuda: celda.title };
  });
  assert.equal(calculada.editable, false, "un total no se escribe a mano");
  assert.ok(calculada.ayuda.includes("servidor"));

  // ── 5. Pegar desde Word entra como texto ──────────────────────────────────
  await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const campo = doc.querySelector<HTMLElement>('[data-campo="alcance.introduccion"]')!;
    campo.focus();
    doc.getSelection()!.selectAllChildren(campo);
    const datos = new DataTransfer();
    datos.setData("text/plain", "Traslado\n  de seis rollos\tnuevos.");
    datos.setData("text/html", '<b style="color:red">Traslado</b> de seis rollos nuevos.');
    campo.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: datos, bubbles: true, cancelable: true }),
    );
  });
  const pegado = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const campo = doc.querySelector<HTMLElement>('[data-campo="alcance.introduccion"]')!;
    return {
      marcado: campo.innerHTML,
      enElDato: (window as unknown as VentanaDePrueba).modelo.alcance!.introduccion,
    };
  });
  console.log(pegado);
  assert.ok(!pegado.marcado.includes("<b"), "pegar desde Word no puede traer marcado");
  assert.equal(pegado.enElDato, "Traslado de seis rollos nuevos.", "los saltos y tabulaciones se limpian");

  // ── 6. Arrastrar una foto hasta una sección ───────────────────────────────
  const arrastre = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const alcance = doc.querySelector<HTMLElement>('section[data-seccion="alcance"]')!;

    const datos = new DataTransfer();
    datos.setData("application/x-imagen-oferta", "4");
    const encima = new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true });
    alcance.dispatchEvent(encima);
    const marcada = alcance.className;
    // Sin preventDefault el navegador no considera soltable la zona.
    const admiteSoltar = encima.defaultPrevented;

    alcance.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return {
      marcada,
      admiteSoltar,
      sigueMarcada: alcance.className,
      soltada: ventana.sueltas.at(-1),
      // Una sección que no lleva imágenes no es blanco de nada.
      secciones: doc.querySelectorAll("section[data-seccion]").length,
    };
  });
  console.log(arrastre);
  assert.ok(arrastre.marcada.includes("recibiendo"), "la sección de destino se marca mientras se arrastra");
  assert.ok(arrastre.admiteSoltar, "y admite que se suelte");
  assert.ok(!arrastre.sigueMarcada.includes("recibiendo"), "al soltar se desmarca");
  assert.deepEqual(arrastre.soltada, { indice: 4, destino: "alcance" }, "la foto cae en la sección correcta");
  assert.ok(arrastre.secciones >= 3, "hay varias secciones que aceptan fotos");

  // ── 6b. Arrastrar una foto hasta la LÍNEA DE FIRMA ────────────────────────
  //
  // La rúbrica es la imagen de la que más obvio es dónde va, y era la única que
  // había que ir a buscar a un desplegable. Tres cosas se comprueban acá: que el
  // bloque del firmante sea blanco, que gane sobre la sección del cierre —que
  // también recibe imágenes y lo contiene—, y que el rótulo diga de QUIÉN va a ser
  // la firma, que es lo único que distingue un bloque del otro cuando hay dos.
  const firma = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    // La segunda: si cayera en la primera no se sabría si eligió o si acertó.
    const bloque = doc.querySelector<HTMLElement>('[data-firma="1"]')!;
    const nombre = bloque.querySelector(".nombre")!.textContent;

    ventana.rebase();
    const datos = new DataTransfer();
    datos.setData("application/x-imagen-oferta", "4");
    // Se despacha sobre el nodo de más adentro, como cuando el cursor está encima
    // del nombre: el módulo tiene que subir hasta el bloque.
    const adentro = bloque.querySelector<HTMLElement>(".nombre")!;
    const encima = new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true });
    adentro.dispatchEvent(encima);

    const marcado = bloque.className;
    const rotulo = bloque.dataset.soltar;
    const seccionMarcada = doc.querySelector<HTMLElement>('section[data-seccion="cierre"]')!.className;
    // El recuadro de la firma tampoco puede mover el documento: mismo criterio que
    // el de la sección, y acá el bloque es chico y está al final de una página. La
    // referencia se vuelve a tomar acá porque las pruebas de escritura de más arriba
    // ya cambiaron —con razón— el ancho de los textos que editaron.
    const medida = ventana.medir();

    adentro.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return {
      marcado,
      rotulo,
      nombre,
      seccionMarcada,
      admiteSoltar: encima.defaultPrevented,
      sigueMarcado: bloque.className,
      soltada: ventana.sueltas.at(-1),
      cuantos: doc.querySelectorAll("[data-firma]").length,
      movidos: medida,
    };
  });
  console.log(firma);
  // Y una firma escaneada arrastrada DESDE UNA CARPETA hasta la línea de firma: es
  // el camino corto de verdad —el archivo ni pasa por el cajón— y el que más se va a
  // usar, porque la firma vive en un archivo suelto, no en el borrador.
  const firmaDesdeCarpeta = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const datos = new DataTransfer();
    datos.items.add(new File(["x"], "firma-alfonso.png", { type: "image/png" }));
    const bloque = doc.querySelector<HTMLElement>('[data-firma="0"]')!;
    bloque.dispatchEvent(new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true }));
    bloque.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return ventana.sueltas.at(-1);
  });
  console.log(firmaDesdeCarpeta);
  assert.deepEqual(
    firmaDesdeCarpeta,
    { archivos: ["firma-alfonso.png"], destino: "firma-0" },
    "un archivo del escritorio soltado en la línea de firma se sube y queda como rúbrica",
  );

  // Un archivo del escritorio también cae, y en la misma sección.
  const conArchivo = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const datos = new DataTransfer();
    datos.items.add(new File(["x"], "faena.jpg", { type: "image/jpeg" }));
    const destino = doc.querySelector<HTMLElement>('section[data-seccion="anexo"]')!;
    destino.dispatchEvent(
      new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true }),
    );
    destino.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return ventana.sueltas.at(-1);
  });
  console.log(conArchivo);
  assert.deepEqual(
    conArchivo,
    { archivos: ["faena.jpg"], destino: "anexo" },
    "los archivos del escritorio también",
  );

  // Y un archivo que cae FUERA de toda sección —en la portada— igual entra a la
  // oferta, sin sección: que no pase nada por haber apuntado unos milímetros al lado
  // es lo peor que puede hacer esta pantalla.
  const enLaPortada = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const datos = new DataTransfer();
    datos.items.add(new File(["x"], "plano.png", { type: "image/png" }));
    const portada = doc.querySelector<HTMLElement>("section.portada")!;
    const encima = new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true });
    portada.dispatchEvent(encima);
    portada.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return { admiteSoltar: encima.defaultPrevented, ultima: ventana.sueltas.at(-1) };
  });
  console.log(enLaPortada);
  assert.ok(enLaPortada.admiteSoltar, "la portada tiene que aceptar un archivo del escritorio");
  assert.deepEqual(
    enLaPortada.ultima,
    { archivos: ["plano.png"], destino: null },
    "cae sin sección, para quedar en el cajón sin ubicar",
  );

  // En cambio una foto que YA está en la oferta necesita una sección: moverla a
  // ninguna parte no significa nada, así que ahí no se acepta el soltado.
  const fotoEnLaPortada = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const antes = ventana.sueltas.length;
    const datos = new DataTransfer();
    datos.setData("application/x-imagen-oferta", "4");
    const portada = doc.querySelector<HTMLElement>("section.portada")!;
    const encima = new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true });
    portada.dispatchEvent(encima);
    portada.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
    return { admiteSoltar: encima.defaultPrevented, nuevas: ventana.sueltas.length - antes };
  });
  assert.equal(fotoEnLaPortada.admiteSoltar, false, "la portada no recibe una foto de la oferta");
  assert.equal(fotoEnLaPortada.nuevas, 0, "y no reporta nada");

  // ── 7. Sacar una foto del documento con su × ──────────────────────────────
  const quitada = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const boton = doc.querySelector<HTMLElement>('figure[data-imagen="1"] .quitar-foto');
    boton?.click();
    return { hayBoton: Boolean(boton), ultima: ventana.sueltas.at(-1) };
  });
  console.log(quitada);
  assert.ok(quitada.hayBoton, "cada foto del documento tiene su × para sacarla");
  assert.deepEqual(
    quitada.ultima,
    { quitada: 1, deLaFirma: false },
    "y avisa cuál se sacó, y que es una foto del cuerpo",
  );

  // La rúbrica también tiene su ×. Se podía poner una firma arrastrándola y después
  // no había cómo sacarla desde el documento, que es la mitad del trabajo: la firma
  // es la imagen que más se equivoca —la del gerente en la oferta que firma otro— y
  // la que más urgente es poder deshacer.
  const firmaQuitada = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const boton = doc.querySelector<HTMLElement>('.rubrica-caja .quitar-foto');
    // En la esquina de la rúbrica y no en la del hueco, que es más grande y no dice
    // dónde está la imagen.
    const dentroDeLaCaja = boton?.parentElement?.classList.contains("rubrica-caja") === true;
    boton?.click();
    return {
      hayBoton: Boolean(boton),
      dentroDeLaCaja,
      rotulo: boton?.getAttribute("aria-label"),
      ultima: ventana.sueltas.at(-1),
    };
  });
  console.log(firmaQuitada);
  assert.ok(firmaQuitada.hayBoton, "la rúbrica puesta tiene su × para sacarla del documento");
  assert.ok(firmaQuitada.dentroDeLaCaja, "y va en la esquina de la firma");
  assert.equal(
    firmaQuitada.rotulo,
    "Sacar esta firma del documento",
    "el rótulo dice firma y no foto: es lo que se está sacando",
  );
  assert.deepEqual(
    firmaQuitada.ultima,
    { quitada: 2, deLaFirma: true },
    "y avisa el número de la imagen que era la rúbrica, y que es una firma: es lo que deja decir 'Sacando la firma…' y no un aviso genérico",
  );

  // ── 8. El arrastre de verdad, cruzando del cajón al documento ─────────────
  await pagina
    .locator("#cajon")
    .dragTo(pagina.frameLocator("#marco").locator('section[data-seccion="alcance"]'));
  const cruzado = await pagina.evaluate(() => (window as unknown as VentanaDePrueba).sueltas.at(-1));
  console.log(cruzado);
  assert.deepEqual(
    cruzado,
    { indice: 6, destino: "alcance" },
    "arrastrar desde el cajón de la página hasta una sección del iframe",
  );

  // Y lo mismo hasta la línea de firma, que es el destino nuevo: el arrastre real
  // es el único que ejercita el cruce de realms (ver el comentario de arriba).
  // El bloque de firma está al final del documento, a unos 2100 px del borde. El
  // arrastre real necesita ver el origen Y el destino a la vez: si hay que desplazar
  // la página con el botón apretado, el soltado llega en otras coordenadas y cae en
  // otra parte —comprobado: caía en el alcance—. Se agranda la ventana en vez de
  // desplazar. El alto de la ventana no cambia la maqueta: el iframe tiene alto fijo
  // y el documento mide en milímetros.
  await pagina.setViewportSize({ width: 1280, height: 2600 });
  await pagina.locator("#cajon").dragTo(pagina.frameLocator("#marco").locator('[data-firma="0"]'));
  const firmaCruzada = await pagina.evaluate(() => (window as unknown as VentanaDePrueba).sueltas.at(-1));
  console.log(firmaCruzada);
  assert.deepEqual(
    firmaCruzada,
    { indice: 6, destino: "firma-0" },
    "arrastrar desde el cajón de la página hasta la firma del iframe",
  );

  // ── 9. Los rótulos se editan como cualquier texto ─────────────────────────
  //
  // Es una ruta de otra clase: los demás campos apuntan a un dato que ya existe, y
  // un rótulo es una clave de diccionario que normalmente NO está —significa "usa el
  // del maestro"—. Así que esto comprueba que escribir el título de una sección lo
  // guarde igual, y que vaciarlo devuelva el del maestro en vez de dejar un título
  // en blanco.
  await enfocar('[data-campo="rotulos.s-alcance"]');
  await pagina.keyboard.type("ALCANCE DE LOS TRABAJOS");
  const rotulo = await pagina.evaluate(() => {
    const ventana = window as unknown as VentanaDePrueba;
    return { guardado: ventana.modelo.rotulos, aviso: ventana.avisos.at(-1) };
  });
  console.log(rotulo);
  assert.equal(
    rotulo.guardado?.["s-alcance"],
    "ALCANCE DE LOS TRABAJOS",
    "el título de la sección se guarda como rótulo de la oferta",
  );
  assert.equal(rotulo.aviso?.ruta, "rotulos.s-alcance", "y viaja a la página para guardarse");

  await enfocar('[data-campo="rotulos.s-alcance"]');
  await pagina.keyboard.press("Delete");
  const rotuloVacio = await pagina.evaluate(
    () => (window as unknown as VentanaDePrueba).modelo.rotulos,
  );
  console.log(rotuloVacio);
  assert.ok(
    !("s-alcance" in (rotuloVacio ?? {})),
    "vaciarlo borra la clave: el documento vuelve al rótulo del maestro en vez de quedar sin título",
  );

  // ── 9b. Un campo enfocado se tiene que poder LEER ─────────────────────────
  //
  // Los encabezados de columna son texto claro sobre una franja oscura, y el campo
  // editable es un span dentro de la celda: al enfocarlo, el fondo blanco del editor
  // dejaba texto blanco sobre blanco y se escribía a ciegas. Se comprueba con el
  // color calculado y no mirando el CSS, porque lo que importa es lo que gana en la
  // cascada dentro del documento del maestro.
  const contraste = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const medir = (selector: string) => {
      const campo = doc.querySelector<HTMLElement>(selector)!;
      campo.focus();
      const estilo = doc.defaultView!.getComputedStyle(campo);
      return { color: estilo.color, fondo: estilo.backgroundColor };
    };
    return {
      // Un encabezado del maestro y uno de una tabla libre: los dos van sobre la
      // franja oscura.
      precio: medir('[data-campo="rotulos.col-precio-cargo"]'),
      libre: medir('[data-campo="bloques.0.tabla.columnas.0"]'),
      // Y uno normal, sobre el papel blanco, que no tenía el problema: la regla no
      // puede haberlo cambiado.
      normal: medir('[data-campo="alcance.introduccion"]'),
    };
  });
  console.log(contraste);
  for (const [donde, medida] of Object.entries(contraste)) {
    assert.equal(medida.fondo, "rgb(255, 255, 255)", `el campo enfocado va sobre blanco (${donde})`);
    assert.equal(
      medida.color,
      "rgb(23, 20, 17)",
      `y con tinta oscura, para que se lea lo que se escribe (${donde})`,
    );
  }

  // ── 10. Agregar y sacar estructura desde el documento ─────────────────────
  //
  // Los botones no están en la maqueta: los pone el editor, en la esquina de lo que
  // tocan. Lo que se comprueba acá es que cada uno pida la operación correcta CON EL
  // ÍNDICE correcto: un "+ Fila" que reporte otro bloque escribiría en el subtítulo
  // de al lado, que es la falla que nadie relacionaría con haber apretado ese botón.
  const estructura = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const apretar = (dentro: Element, texto: string) => {
      const botones = [...dentro.querySelectorAll<HTMLElement>(".boton-estructura")];
      botones.find((b) => b.textContent === texto)?.click();
      return ventana.sueltas.at(-1)?.operacion;
    };

    const seccion = doc.querySelector<HTMLElement>('section[data-en="alcance"]')!;
    // El de la sección y no el del bloque que tiene adentro: querySelector encuentra
    // el primero del árbol, así que se busca en la barra propia de la sección.
    const suBarra = seccion.querySelector<HTMLElement>(":scope > .barra-estructura")!;
    const subtitulo = apretar(suBarra, "+ Subtítulo");

    const bloque = doc.querySelector<HTMLElement>('[data-bloque="0"]')!;
    const barraDelBloque = bloque.querySelector<HTMLElement>(":scope > .barra-estructura")!;
    const parrafo = apretar(barraDelBloque, "+ Párrafo");
    const fila = apretar(barraDelBloque, "+ Fila");
    const columna = apretar(barraDelBloque, "+ Columna");
    const quitar = apretar(barraDelBloque, "Quitar");

    const equis = (selector: string) => {
      doc.querySelector<HTMLElement>(selector)?.click();
      return ventana.sueltas.at(-1)?.operacion;
    };
    const sinParrafo = equis('[data-libre="parrafo"] .quitar-parte');
    const sinColumna = equis('[data-columna="1"] .quitar-parte');
    const sinFila = equis('[data-libre="fila"] td:last-child .quitar-parte');

    return {
      subtitulo,
      parrafo,
      fila,
      columna,
      quitar,
      sinParrafo,
      sinColumna,
      sinFila,
      // Con tabla, el botón de agregarla no está: sería un segundo cuadro en el
      // mismo subtítulo.
      hayBotonDeTabla: [...barraDelBloque.querySelectorAll("button")].some(
        (b) => b.textContent === "+ Tabla",
      ),
      // Y la portada no es una sección del documento: no lleva el botón.
      enLaPortada: doc.querySelector("section.portada .barra-estructura") !== null,
    };
  });
  console.log(estructura);
  assert.deepEqual(estructura.subtitulo, { tipo: "agregarBloque", en: "alcance", nivel: "subtitulo" });
  assert.deepEqual(estructura.parrafo, { tipo: "agregarParrafo", bloque: 0 });
  assert.deepEqual(estructura.fila, { tipo: "agregarFila", bloque: 0 });
  assert.deepEqual(estructura.columna, { tipo: "agregarColumna", bloque: 0 });
  assert.deepEqual(estructura.quitar, { tipo: "quitarBloque", bloque: 0 });
  assert.deepEqual(estructura.sinParrafo, { tipo: "quitarParrafo", bloque: 0, parrafo: 0 });
  assert.deepEqual(estructura.sinColumna, { tipo: "quitarColumna", bloque: 0, columna: 1 });
  assert.deepEqual(estructura.sinFila, { tipo: "quitarFila", bloque: 0, fila: 0 });
  assert.ok(!estructura.hayBotonDeTabla, "con tabla ya puesta, no se ofrece agregar otra");
  assert.ok(!estructura.enLaPortada, "la portada la arma la plantilla: no se le agregan subtítulos");

  // El "+ Título" agrega una SECCIÓN, no un subtítulo: es la otra mitad del pedido.
  // Y la sección agregada a mano lleva los controles del bloque —párrafo, tabla,
  // quitar— y no los de una sección del maestro, porque no es una del maestro.
  const titulos = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const barra = doc.querySelector<HTMLElement>('section[data-en="alcance"] > .barra-estructura')!;
    [...barra.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "+ Título")?.click();
    const pedido = ventana.sueltas.at(-1)?.operacion;

    const propia = doc.querySelector<HTMLElement>('section[data-bloque="1"]')!;
    return {
      pedido,
      // Su título se edita en el h2, con la ruta del bloque y no con un rótulo.
      rutaDelTitulo: propia.querySelector("h2 [data-campo]")?.getAttribute("data-campo"),
      numero: propia.querySelector("h2 .n")?.textContent,
      // No es blanco de arrastre: el reparto de imágenes va por sección del maestro.
      aceptaFotos: propia.hasAttribute("data-seccion"),
      // Y no ofrece "+ Subtítulo": los subtítulos son de las secciones del maestro.
      botones: [...propia.querySelectorAll<HTMLElement>(":scope > .barra-estructura button")].map(
        (b) => b.textContent,
      ),
    };
  });
  console.log(titulos);
  assert.deepEqual(titulos.pedido, { tipo: "agregarBloque", en: "alcance", nivel: "titulo" });
  assert.equal(titulos.rutaDelTitulo, "bloques.1.titulo", "el título de la sección propia es su dato");
  assert.equal(titulos.numero, "3", "se numera con las del maestro: después del alcance");
  assert.ok(!titulos.aceptaFotos, "una sección agregada a mano no recibe fotos");
  assert.deepEqual(titulos.botones, ["+ Párrafo", "+ Tabla", "Quitar"], "lleva los controles del bloque");

  // ── 10a. Acomodar una foto: moverla y elegir dónde va ─────────────────────
  //
  // Las dos cosas que faltaban: el orden dentro de la sección (que solo sabía agregar al
  // final) y poder ponerla al costado del texto en vez de siempre abajo.
  const acomodar = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;
    const figura = doc.querySelector<HTMLElement>('figure[data-imagen="1"]')!;
    const botones = [...figura.querySelectorAll<HTMLElement>(".boton-imagen")];

    botones[0].click();
    const atras = ventana.sueltas.at(-1);
    botones[1].click();
    const adelante = ventana.sueltas.at(-1);

    const selector = figura.querySelector<HTMLSelectElement>(".selector-imagen")!;
    const inicial = selector.value;
    selector.value = "derecha";
    selector.dispatchEvent(new Event("change", { bubbles: true }));

    return {
      atras,
      adelante,
      inicial,
      dispuesta: ventana.sueltas.at(-1),
      // La rúbrica no se acomoda: va donde va.
      enLaRubrica: doc.querySelector('.rubrica-caja .boton-imagen') !== null,
    };
  });
  console.log(acomodar);
  assert.deepEqual(acomodar.atras, { indice: 1, mover: -1 }, "la flecha izquierda la mueve un lugar antes");
  assert.deepEqual(acomodar.adelante, { indice: 1, mover: 1 });
  assert.equal(acomodar.inicial, "grilla", "el selector arranca en lo que el documento está mostrando");
  assert.deepEqual(acomodar.dispuesta, { indice: 1, disposicion: "derecha" });
  assert.ok(!acomodar.enLaRubrica, "la rúbrica no lleva controles de acomodar");

  // ── 10b. Los logos del encabezado, arrastrándolos ─────────────────────────
  //
  // Los dos huecos están a la vista en el documento, así que soltarlos ahí es el
  // camino corto. Dos payloads: un archivo del escritorio y una imagen que ya está en
  // la oferta —el borrador casi siempre trae el logo del cliente entre sus imágenes—.
  // Y lo que NO puede pasar es que soltar una foto sobre el encabezado la ubique como
  // una foto del cuerpo: son dos acciones distintas sobre el mismo gesto.
  const logos = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const ventana = window as unknown as VentanaDePrueba;

    const soltarArchivo = (selector: string, nombre: string) => {
      const datos = new DataTransfer();
      datos.items.add(new File(["x"], nombre, { type: "image/png" }));
      const celda = doc.querySelector<HTMLElement>(selector)!;
      const encima = new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true });
      celda.dispatchEvent(encima);
      const marcada = celda.className;
      const rotulo = celda.dataset.soltar;
      celda.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
      return { admite: encima.defaultPrevented, marcada, rotulo, ultima: ventana.sueltas.at(-1) };
    };

    const soltarFoto = (selector: string) => {
      const datos = new DataTransfer();
      datos.setData("application/x-imagen-oferta", "1");
      const celda = doc.querySelector<HTMLElement>(selector)!;
      celda.dispatchEvent(new DragEvent("dragover", { dataTransfer: datos, bubbles: true, cancelable: true }));
      celda.dispatchEvent(new DragEvent("drop", { dataTransfer: datos, bubbles: true, cancelable: true }));
      return ventana.sueltas.at(-1);
    };

    return {
      celdas: doc.querySelectorAll("[data-logo]").length,
      archivoEnCliente: soltarArchivo('[data-logo="cliente"]', "logo-axinntus.png"),
      archivoEnCasa: soltarArchivo('[data-logo="casa"]', "logo-pertec.png"),
      fotoEnCliente: soltarFoto('[data-logo="cliente"]'),
      // Soltar sobre el nodo de más adentro —la imagen del logo, cuando hay— también
      // tiene que llegar a la celda.
      adentro: doc.querySelector('[data-logo="cliente"] *') === null,
    };
  });
  console.log(logos);
  assert.equal(logos.celdas, 2, "las dos celdas de logo del encabezado son blanco de arrastre");
  assert.ok(logos.archivoEnCliente.admite, "y aceptan que se suelte un archivo");
  assert.ok(logos.archivoEnCliente.marcada.includes("recibiendo"), "la celda se marca mientras se arrastra");
  assert.equal(logos.archivoEnCliente.rotulo, "Logo del cliente", "el rótulo dice qué logo va ahí");
  assert.equal(logos.archivoEnCasa.rotulo, "Logo de la empresa");
  assert.deepEqual(logos.archivoEnCliente.ultima, { logo: "cliente", archivos: ["logo-axinntus.png"] });
  assert.deepEqual(logos.archivoEnCasa.ultima, { logo: "casa", archivos: ["logo-pertec.png"] });
  assert.deepEqual(
    logos.fotoEnCliente,
    { logo: "cliente", indice: 1 },
    "una foto del cajón soltada en el encabezado se usa como logo, no se ubica como foto del cuerpo",
  );

  // ── 11. Los controles no estorban ─────────────────────────────────────────
  //
  // Aparecen sobre el documento, así que mientras están invisibles no pueden
  // interceptar el clic: sin `pointer-events: none`, la pastilla de "+ Subtítulo"
  // —que cae justo sobre el borde derecho del título de la sección— se come el clic
  // de quien quiere editar ese título y no pasa nada. Es la clase de detalle que no
  // se ve mirando y que hace que algo "no funcione".
  const estorbo = await pagina.evaluate(() => {
    const doc = (document.getElementById("marco") as HTMLIFrameElement).contentDocument!;
    const barra = doc.querySelector<HTMLElement>('section[data-en="precio"] > .barra-estructura')!;
    const caja = barra.getBoundingClientRect();
    const debajo = doc.elementFromPoint(caja.x + caja.width / 2, caja.y + caja.height / 2);
    const estilo = doc.defaultView!.getComputedStyle(barra);
    return {
      atrapaElClic: barra.contains(debajo),
      opacidad: estilo.opacity,
      // Y se anima: sin transición, aparecer de golpe se lee como un parpadeo.
      duracion: estilo.transitionDuration,
    };
  });
  console.log(estorbo);
  assert.ok(!estorbo.atrapaElClic, "invisible no puede atrapar el clic de lo que tiene debajo");
  assert.equal(estorbo.opacidad, "0", "y arranca invisible");
  assert.ok(
    parseFloat(estorbo.duracion) >= 0.15,
    `la aparición es gradual, no un parpadeo (${estorbo.duracion})`,
  );

  // Y las celdas de la tabla libre se editan como cualquier campo.
  await enfocar('[data-campo="bloques.0.tabla.filas.0.1"]');
  await pagina.keyboard.type("06:00 a 20:00");
  const celda = await pagina.evaluate(
    () => (window as unknown as VentanaDePrueba).modelo.bloques?.[0].tabla?.filas[0],
  );
  console.log(celda);
  assert.deepEqual(celda, ["Norte", "06:00 a 20:00"], "la celda de una tabla libre es un dato más");

  console.log("\nLa edición sobre el documento funciona en el navegador.");
} finally {
  await navegador.close();
  servidor.close();
}
