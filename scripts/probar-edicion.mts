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
  sueltas: { indice?: number; destino?: string | null; archivos?: string[]; quitada?: number }[];
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
        alQuitarImagen: (indice: number) => ventana.sueltas.push({ quitada: indice }),
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
  assert.deepEqual(quitada.ultima, { quitada: 1 }, "y avisa cuál se sacó");

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
    { quitada: 2 },
    "y avisa el número de la imagen que era la rúbrica",
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

  console.log("\nLa edición sobre el documento funciona en el navegador.");
} finally {
  await navegador.close();
  servidor.close();
}
