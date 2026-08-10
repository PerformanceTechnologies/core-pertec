"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CATEGORIAS_GASTO,
  TIPOS_DOCUMENTO,
  TRATAMIENTO_DOCUMENTO,
  type CategoriaGasto,
  type GastoRendicion,
  type Rendicion,
  type TipoDocumento,
} from "@/lib/rendidor/tipos";
import { desgloseDeGasto, rutValido } from "@/lib/rendidor/iva";
import { TextInput, NumInput, SelectInput, DeleteButton } from "@/components/cotizador/campos/Campos";
import RuedaCarga from "@/components/RuedaCarga";
import { SOMBRA_CALIDA } from "@/lib/estilos";

/**
 * Lee la respuesta de un fetch tolerando que NO sea JSON.
 *
 * Cuando una función de Vercel se cae o se pasa del tiempo, la plataforma
 * responde texto plano ("An error occurred with your deployment"), no JSON.
 * Un `resp.json()` directo revienta ahí con "Unexpected token 'A'", que no le
 * dice nada a quien rinde. Esto lo traduce al problema real.
 */
async function leerRespuesta(resp: Response): Promise<Record<string, unknown>> {
  const texto = await resp.text();

  try {
    const json = JSON.parse(texto) as Record<string, unknown>;
    if (!resp.ok) throw new Error((json.error as string) ?? `Error ${resp.status}`);
    return json;
  } catch (e) {
    // Si el JSON parseó bien y el error viene del !resp.ok de arriba, se
    // propaga tal cual: ya es un mensaje accionable del servidor.
    if (e instanceof Error && !(e instanceof SyntaxError)) throw e;

    if (resp.status === 504 || resp.status === 408) {
      throw new Error(
        "el análisis tardó más de lo que permite el servidor. Subilo solo, sin otros archivos, o reducí el tamaño de la foto.",
      );
    }
    if (resp.status === 413) {
      throw new Error("el archivo es demasiado grande para el servidor. Reducilo antes de subirlo.");
    }
    throw new Error(
      `el servidor respondió ${resp.status} sin datos utilizables (${texto.slice(0, 80).trim() || "respuesta vacía"}).`,
    );
  }
}

// Las fotos de celular llegan a 4000 px y varios MB, así que se reducen antes de
// subirlas: baja el peso del upload y el tiempo de análisis.
//
// 2576 px es el lado largo máximo que aprovecha la familia Claude 5 (nivel de
// alta resolución, hasta 4784 tokens visuales por imagen). Va atado al modelo
// que usa lib/rendidor/analizar.ts: si ese modelo cambia, hay que verificar el
// número acá. ESTO ESTABA EN 1568, que es el tope de Opus 4.6 y anteriores: con ese valor cada documento se reducía a
// poco más de la mitad de lo que el modelo puede leer, y en una factura A4 la
// letra chica —fecha, RUT, folio, montos— dejaba de ser legible. El encabezado
// grande se seguía leyendo, de ahí que reconociera "LATAM AIRLINES" y el tipo de
// documento pero devolviera todo el resto como ilegible.
//
// No se sube más allá de 2576: pasado ese punto la API reescala igual y solo se
// paga peso.
const LADO_MAXIMO = 2576;

// Por debajo de esto, una factura A4 no tiene pixeles suficientes para que la
// letra chica sea legible, y NO se puede arreglar reescalando hacia arriba: los
// datos no estan en el archivo. Se avisa en vez de dejar la sospecha de que el
// modelo "no funciona".
const LADO_MINIMO_UTIL = 1100;

/**
 * Pinta el lienzo de BLANCO antes de dibujar. No es cosmético.
 *
 * Un canvas nace transparente-negro y el JPEG no tiene canal alfa, así que al
 * codificar, cada píxel transparente del origen sale NEGRO. Una factura en PNG
 * con fondo transparente — lo típico de un documento descargado de una web — se
 * convertía en texto oscuro sobre negro: medido, el contraste caía de 242 a 25
 * sobre 255. El modelo no leía nada y devolvía todos los campos como ilegibles.
 */
function lienzoBlanco(ancho: number, alto: number): CanvasRenderingContext2D | null {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  return ctx;
}

interface ImagenPreparada {
  archivo: File;
  // Dimensiones del ORIGEN, no del resultado: es lo que dice si el archivo
  // traía suficiente detalle. Null cuando no es una imagen (PDF) o el navegador
  // no la pudo decodificar.
  ancho: number | null;
  alto: number | null;
}

async function reducirImagen(archivo: File): Promise<ImagenPreparada> {
  if (!archivo.type.startsWith("image/")) return { archivo, ancho: null, alto: null };

  try {
    const bitmap = await createImageBitmap(archivo);
    const original = { ancho: bitmap.width, alto: bitmap.height };
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    // Solo un JPEG chico se devuelve sin tocar: no tiene alfa que aplanar y
    // recomprimirlo perdería calidad sin ganar nada. Cualquier otro formato pasa
    // igual por el lienzo blanco, porque puede traer transparencia.
    if (escala === 1 && archivo.size <= 1_500_000 && archivo.type === "image/jpeg") {
      bitmap.close();
      return { archivo, ...original };
    }

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const ctx = lienzoBlanco(ancho, alto);
    if (!ctx) {
      bitmap.close();
      return { archivo, ...original };
    }
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) => ctx.canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return { archivo, ...original };

    // Antes se descartaba el resultado si no pesaba menos que el original. Eso
    // devolvía el PNG con transparencia intacta justo en el caso que hay que
    // aplanar, así que ahora el aplanado manda sobre el ahorro de bytes.
    return {
      archivo: new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }),
      ...original,
    };
  } catch {
    // Si el navegador no puede decodificarla, que decida el servidor.
    return { archivo, ancho: null, alto: null };
  }
}

type Resultado<R> = { ok: true; valor: R } | { ok: false; error: unknown };

/**
 * Corre `fn` sobre todos los items con un tope de tareas en vuelo.
 *
 * Los resultados vuelven EN EL ORDEN DE ENTRADA, no en el de finalización, y un
 * item que falla no arrastra a los demás: cada posición trae su valor o su
 * error. Las dos cosas importan acá — el orden define la numeración de los
 * gastos, y una boleta ilegible no puede tumbar la tanda completa.
 *
 * El tope existe porque cada tarea es un request a una función serverless:
 * mandar 16 de golpe se traduce en 16 invocaciones simultáneas y arriesga
 * rate limits, sin ganar nada sobre unas pocas en paralelo.
 */
async function mapaConTope<T, R>(
  items: T[],
  tope: number,
  fn: (item: T, indice: number) => Promise<R>,
): Promise<Resultado<R>[]> {
  const salida: Resultado<R>[] = new Array(items.length);
  let siguiente = 0;

  async function trabajador() {
    for (;;) {
      const i = siguiente++;
      if (i >= items.length) return;
      try {
        salida[i] = { ok: true, valor: await fn(items[i], i) };
      } catch (error) {
        salida[i] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(tope, items.length) }, trabajador));
  return salida;
}

// Comprobantes analizándose a la vez. Tres es el punto donde se nota la mejora
// sin abrir demasiadas invocaciones en paralelo.
const ANALISIS_EN_PARALELO = 3;
// Adjuntos a Odoo a la vez. Más bajo porque cada uno hace dos llamadas XML-RPC
// (adjuntar y verificar) contra la misma instancia.
const ADJUNTOS_EN_PARALELO = 2;

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

type Paso = "subir" | "revisar" | "cargar";

// Lo que devuelve /api/rendidor/analizar (espejo de ComprobanteLeido, que vive
// en un módulo server-only y no se puede importar desde el cliente).
interface ComprobanteLeidoUI {
  fecha: string | null;
  proveedor: string | null;
  rutProveedor: string | null;
  numeroDocumento: string | null;
  tipoDocumento: TipoDocumento | null;
  detalle: string | null;
  categoria: CategoriaGasto | null;
  neto: number | null;
  iva: number | null;
  total: number | null;
  ilegibles: string[] | null;
}

interface CandidatoProveedor {
  id: number;
  name: string;
  vat: string | false;
}

interface EstadoProveedor {
  candidatos: CandidatoProveedor[];
  elegido: number | null;
  crear: boolean;
  esPersonaNatural: boolean;
}

/**
 * Un campo del editor de gastos: etiqueta arriba, control abajo.
 *
 * La etiqueta va SIEMPRE, no solo en pantalla angosta. Antes esto era una tabla
 * de 1100px con los nombres de columna en un thead, y al desplazarla a la derecha
 * —que era obligatorio en cualquier pantalla— el encabezado quedaba fuera de
 * vista: quien editaba tenía cuatro inputs de texto seguidos sin saber cuál era
 * el RUT y cuál el número de documento.
 */
function Campo({
  etiqueta,
  ancho = "",
  children,
}: {
  etiqueta: string;
  /** Clases de col-span para que el campo ocupe más de una celda. */
  ancho?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${ancho}`}>
      <span className="mb-1 block text-[10px] font-medium text-tinta/45">{etiqueta}</span>
      {children}
    </label>
  );
}

/**
 * Miniatura del comprobante de un gasto.
 *
 * Con `<img>` y no con next/image a propósito: el optimizador de Next descarga la
 * imagen desde su servidor y la CACHEA en la CDN, y estos son documentos
 * tributarios que viven en un bucket privado detrás de una URL firmada que expira.
 * Dejar copias optimizadas en una CDN pública es exactamente lo que el bucket
 * privado evita. Además habría que registrar el dominio de Supabase en
 * remotePatterns para algo que no se quiere cachear.
 *
 * Los PDF no se pueden miniaturizar en un <img>, así que muestran una ficha con el
 * nombre. Los dos casos abren el archivo completo en otra pestaña.
 */
function Previsualizacion({ url, nombre, tipo }: { url?: string; nombre: string; tipo: string }) {
  if (!url) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-borde text-center text-[9px] leading-tight text-tinta/35">
        Sin
        <br />
        comprobante
      </div>
    );
  }

  const esPdf = tipo === "application/pdf" || nombre.toLowerCase().endsWith(".pdf");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir ${nombre}`}
      className="group/vista relative block h-20 w-20 shrink-0 overflow-hidden rounded-md border border-borde bg-crema/60 transition hover:border-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
    >
      {esPdf ? (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-tinta/45">
          <span className="font-condensed text-sm font-bold tracking-wide">PDF</span>
          <span className="px-1 text-center text-[8px] leading-tight break-all">
            {nombre.length > 24 ? `${nombre.slice(0, 24)}…` : nombre}
          </span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- ver el comentario del componente
        <img
          src={url}
          alt={`Comprobante: ${nombre}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-200 group-hover/vista:scale-105"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 bg-tinta/70 py-0.5 text-center text-[8px] font-semibold text-crema opacity-0 transition-opacity group-hover/vista:opacity-100">
        Ver
      </span>
    </a>
  );
}

export default function PanelRendicion({
  rendicionInicial,
  urlsRespaldo = {},
}: {
  rendicionInicial: Rendicion;
  /**
   * URL firmada por gasto, generada en el servidor. De vida corta, ver
   * lib/rendidor/almacenamiento.ts.
   */
  urlsRespaldo?: Record<string, string>;
}) {
  const [rendicion, setRendicion] = useState(rendicionInicial);
  /**
   * Vistas de los archivos recién subidos, con URL.createObjectURL.
   *
   * Las firmadas las emite el servidor al cargar la página, así que un comprobante
   * subido en esta misma sesión no tiene ninguna hasta recargar. Como el navegador
   * ya tiene el File en la mano, se arma la vista local y la miniatura aparece de
   * inmediato.
   */
  const [vistasLocales, setVistasLocales] = useState<Record<string, string>>({});
  const [paso, setPaso] = useState<Paso>(rendicion.gastos.length > 0 ? "revisar" : "subir");
  const [analizando, setAnalizando] = useState<{ actual: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  // Cada createObjectURL retiene el archivo en memoria hasta que se revoca. Sin
  // esto, subir 16 comprobantes y navegar a otra parte deja los 16 colgados.
  useEffect(() => {
    const urls = Object.values(vistasLocales);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [vistasLocales]);

  // Empleado de Odoo
  const [empleados, setEmpleados] = useState<{ id: number; name: string }[]>([]);
  const [employeeId, setEmployeeId] = useState<number | null>(rendicion.odooEmployeeId);
  const [buscandoEmpleado, setBuscandoEmpleado] = useState(false);

  // Proveedores por gasto
  const [proveedores, setProveedores] = useState<Record<string, EstadoProveedor>>({});
  const [resolviendo, setResolviendo] = useState(false);

  const [resultado, setResultado] = useState<{
    creados: number;
    proveedoresCreados: number;
    problemas: string[];
    excelEnOdoo: string | null;
  } | null>(null);

  const yaCargada = rendicion.estado === "cargada_odoo";

  // El desglose se recalcula acá con las MISMAS reglas que usa la carga a Odoo,
  // así que lo que se ve en pantalla es exactamente lo que se va a cargar.
  const filas = useMemo(
    () =>
      rendicion.gastos.map((g) => {
        let neto = g.neto;
        let iva = g.iva;
        const advertencias: string[] = [];

        try {
          // Misma puerta que usan el preview de Odoo y la planilla: lo que se ve
          // acá es exactamente lo que se exporta y lo que se carga.
          const d = desgloseDeGasto(g);
          if (d) {
            neto = d.neto;
            iva = d.iva;
            advertencias.push(...d.advertencias);
          }
        } catch (e) {
          advertencias.push(e instanceof Error ? e.message : "No se pudo calcular el IVA.");
        }

        return { gasto: g, neto, iva, advertencias };
      }),
    [rendicion.gastos],
  );

  const totales = useMemo(() => {
    const total = filas.reduce((a, f) => a + f.gasto.total, 0);
    const neto = filas.reduce((a, f) => a + f.neto, 0);
    const iva = filas.reduce((a, f) => a + f.iva, 0);
    return { total, neto, iva, saldo: total - rendicion.montoAsignado };
  }, [filas, rendicion.montoAsignado]);

  const pendientes = useMemo(
    () =>
      filas.filter(
        (f) =>
          !f.gasto.tipoDocumento ||
          !f.gasto.categoria ||
          !f.gasto.fecha ||
          f.gasto.total <= 0 ||
          f.gasto.pendientes.length > 0 ||
          f.advertencias.length > 0,
      ),
    [filas],
  );

  const actualizarGasto = (id: string, patch: Partial<GastoRendicion>) =>
    setRendicion((prev) => ({
      ...prev,
      gastos: prev.gastos.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));

  // El respaldo queda en el bucket. No se borra al quitar la fila: si alguien
  // borra un gasto por error, volver a subir el archivo es lo mas molesto de
  // rehacer. Los huerfanos se van con la rendicion cuando se borra.
  const quitarGasto = (id: string) =>
    setRendicion((prev) => ({ ...prev, gastos: prev.gastos.filter((g) => g.id !== id) }));

  // PASO 1 y 2: subir y analizar. Un comprobante por request (el límite de 60s
  // de Vercel no da para varios), pero VARIOS REQUESTS A LA VEZ: analizar 16
  // boletas de a una eran más de cinco minutos de espera.
  const subirYAnalizar = async (lista: FileList) => {
    setError(null);
    const nuevos = Array.from(lista);
    setAnalizando({ actual: 0, total: nuevos.length });

    // El avance ya no puede ser "voy por el i-ésimo" porque terminan
    // desordenados: se cuenta cuántos cerraron.
    let completados = 0;

    const resultados = await mapaConTope(nuevos, ANALISIS_EN_PARALELO, async (origen) => {
      // Se sube (y después se adjunta a Odoo) la versión reducida, para que el
      // respaldo sea exactamente el archivo que el modelo leyó.
      const { archivo, ancho, alto } = await reducirImagen(origen);

      const fd = new FormData();
      fd.append("archivo", archivo);
      // La rendicion viaja para que el servidor agrupe el respaldo en su carpeta.
      fd.append("rendicionId", rendicion.id);

      try {
        const resp = await fetch("/api/rendidor/analizar", { method: "POST", body: fd });
        // El servidor guarda el archivo en el bucket y devuelve su ruta: es lo
        // unico que hay que recordar del archivo.
        const { leido, archivoPath } = (await leerRespuesta(resp)) as unknown as {
          leido: ComprobanteLeidoUI;
          archivoPath: string;
        };
        return { archivo, leido, archivoPath, ancho, alto };
      } finally {
        completados += 1;
        setAnalizando({ actual: completados, total: nuevos.length });
      }
    });

    const gastosNuevos: GastoRendicion[] = [];
    const vistasNuevas: Record<string, string> = {};
    const fallos: string[] = [];
    const pobres: string[] = [];

    // Recién acá se numeran los gastos, recorriendo los resultados en el orden
    // en que se eligieron los archivos.
    resultados.forEach((r, i) => {
      if (!r.ok) {
        fallos.push(`${nuevos[i].name}: ${r.error instanceof Error ? r.error.message : "error"}`);
        return;
      }
      const { archivo, leido: l, archivoPath, ancho, alto } = r.valor;

      // Si volvieron varios campos ilegibles Y el archivo era chico, la causa es
      // la resolución del origen, no el modelo — y no se arregla reintentando.
      // Decirlo con los números concretos evita la sospecha de que "no funciona".
      const ilegibles = l.ilegibles ?? [];
      const ladoLargo = Math.max(ancho ?? 0, alto ?? 0);
      if (ilegibles.length >= 3 && ladoLargo > 0 && ladoLargo < LADO_MINIMO_UTIL) {
        pobres.push(
          `${nuevos[i].name}: ${ancho}×${alto} px. A esa resolución la letra chica de un ` +
            `comprobante no se puede leer, y ampliarla no la recupera. Subí el PDF original o ` +
            `una captura más grande.`,
        );
      }
      const idGasto = crypto.randomUUID();
      // La vista se arma del archivo REDUCIDO, que es el que se subió al bucket y
      // el que leyó el modelo: así la miniatura muestra exactamente lo que se
      // analizó, no el original del celular.
      if (archivo.type.startsWith("image/")) {
        vistasNuevas[idGasto] = URL.createObjectURL(archivo);
      }

      gastosNuevos.push({
        id: idGasto,
        orden: rendicion.gastos.length + gastosNuevos.length + 1,
        fecha: l.fecha,
        proveedor: l.proveedor ?? "",
        rutProveedor: l.rutProveedor,
        numeroDocumento: l.numeroDocumento,
        tipoDocumento: l.tipoDocumento,
        detalle: l.detalle ?? "",
        categoria: l.categoria,
        neto: l.neto ?? 0,
        iva: l.iva ?? 0,
        // AQUÍ se salva la distinción que los números no pueden guardar: el
        // modelo devuelve null cuando el documento no declara nada, y 0 cuando el
        // documento afirma que no hay IVA (línea "VALOR EXENTO"). Al pasar a
        // number las dos cosas caían en 0 y quedaban indistinguibles.
        ivaDesglosado: l.neto !== null && l.iva !== null,
        total: l.total ?? 0,
        pendientes: l.ilegibles ?? [],
        archivoNombre: archivo.name,
        archivoPath,
        archivoTipo: archivo.type,
        odooExpenseId: null,
        odooPartnerId: null,
      });
    });

    setAnalizando(null);
    if (gastosNuevos.length > 0) {
      setVistasLocales((prev) => ({ ...prev, ...vistasNuevas }));
      setRendicion((prev) => ({ ...prev, gastos: [...prev.gastos, ...gastosNuevos] }));
      setPaso("revisar");
    }
    if (fallos.length > 0) {
      setError(
        `No se pudieron analizar ${fallos.length} archivo(s). Podés agregarlos a mano.\n` + fallos.join("\n"),
      );
    } else if (pobres.length > 0) {
      // Va como aviso, no como error: el gasto SÍ se creó, con los campos que se
      // pudieron leer, y el resto se completa a mano.
      setAviso(
        `${pobres.length} comprobante(s) quedaron con campos sin leer por resolución:\n` + pobres.join("\n"),
      );
    }
  };

  // Cuantos gastos no tienen respaldo en el bucket. Con el flujo normal es 0;
  // solo pasa con gastos agregados a mano, sin comprobante.
  const sinRespaldo = rendicion.gastos.filter((g) => !g.archivoPath).length;

  /**
   * Persiste los gastos y lanza si falla.
   *
   * Es obligatorio antes de generar la planilla y antes de cargar a Odoo: las dos
   * rutas leen los gastos DE LA BASE, no del body. Sin esto, una corrección hecha
   * en la tabla que no se guardó a mano se perdería en silencio y a Odoo llegarían
   * los datos que leyó el modelo, no los que confirmó quien rinde.
   */
  const persistirGastos = async () => {
    const resp = await fetch(`/api/rendidor/${rendicion.id}/gastos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gastos: rendicion.gastos }),
    });
    await leerRespuesta(resp);
  };

  const descargarExcel = async () => {
    setGenerandoExcel(true);
    setError(null);
    setAviso(null);
    try {
      await persistirGastos();
      // Sin cuerpo: el servidor baja los respaldos del bucket por su cuenta.
      const resp = await fetch(`/api/rendidor/${rendicion.id}/excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (!resp.ok) {
        // El modo descarga devuelve binario; un error sí viene en JSON.
        await leerRespuesta(resp);
        throw new Error("No se pudo generar la planilla.");
      }

      const blob = await resp.blob();
      const nombre =
        resp.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "rendicion.xlsx";
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(url);

      setAviso(
        sinRespaldo > 0
          ? `Planilla descargada. ${sinRespaldo} gasto(s) no tienen comprobante, así que salen sin imagen.`
          : "Planilla descargada.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la planilla.");
    } finally {
      setGenerandoExcel(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const resp = await fetch(`/api/rendidor/${rendicion.id}/gastos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gastos: rendicion.gastos }),
      });
      await leerRespuesta(resp);
      setAviso("Borrador guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const buscarEmpleado = async () => {
    setBuscandoEmpleado(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/rendidor/empleados?nombre=${encodeURIComponent(rendicion.nombreQuienRinde)}`,
      );
      const json = (await leerRespuesta(resp)) as unknown as { empleados: { id: number; name: string }[] };
      setEmpleados(json.empleados);
      if (json.empleados.length === 1) setEmployeeId(json.empleados[0].id);
      if (json.empleados.length === 0) {
        setError(
          `No hay ningún empleado en Odoo que coincida con "${rendicion.nombreQuienRinde}". ` +
            "Revisá el nombre — no se puede cargar un gasto sin empleado.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar el empleado.");
    } finally {
      setBuscandoEmpleado(false);
    }
  };

  const resolverProveedores = async () => {
    setResolviendo(true);
    setError(null);
    try {
      // Antes de cualquier otra cosa: dejar en la base exactamente lo que se ve
      // en la tabla, porque /cargar lee de ahí.
      await persistirGastos();

      const resp = await fetch("/api/rendidor/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gastos: rendicion.gastos.map((g) => ({
            gastoId: g.id,
            rut: g.rutProveedor,
            proveedor: g.proveedor,
          })),
        }),
      });
      const json = (await leerRespuesta(resp)) as unknown as {
        resultados: { gastoId: string; candidatos: CandidatoProveedor[] }[];
      };

      const estado: Record<string, EstadoProveedor> = {};
      for (const r of json.resultados) {
        estado[r.gastoId] = {
          candidatos: r.candidatos,
          // Un solo candidato se autoselecciona; varios los elige quien rinde.
          elegido: r.candidatos.length === 1 ? r.candidatos[0].id : null,
          crear: r.candidatos.length === 0,
          esPersonaNatural: false,
        };
      }
      setProveedores(estado);
      setPaso("cargar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron resolver los proveedores.");
    } finally {
      setResolviendo(false);
    }
  };

  const cargarAOdoo = async () => {
    if (!employeeId) {
      setError("Falta elegir el empleado de Odoo.");
      return;
    }
    const sinResolver = rendicion.gastos.filter((g) => {
      const p = proveedores[g.id];
      return !p || (!p.elegido && !p.crear);
    });
    if (sinResolver.length > 0) {
      setError(`Hay ${sinResolver.length} gasto(s) sin proveedor resuelto. Es obligatorio.`);
      return;
    }

    setGuardando(true);
    setError(null);
    try {
      const decisiones = rendicion.gastos.map((g) => {
        const p = proveedores[g.id];
        return p.elegido
          ? { gastoId: g.id, partnerId: p.elegido }
          : {
              gastoId: g.id,
              crear: {
                nombre: g.proveedor,
                rut: g.rutProveedor,
                esPersonaNatural: p.esPersonaNatural,
              },
            };
      });

      const resp = await fetch(`/api/rendidor/${rendicion.id}/cargar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, proveedores: decisiones }),
      });
      const json = (await leerRespuesta(resp)) as unknown as {
        creados: { gastoId: string; expenseId: number }[];
        proveedoresCreados: unknown[];
      };

      // Un adjunto por request, de a varios a la vez: cada uno hace además una
      // verificación contra Odoo, así que en serie son 2N round-trips en fila.
      // El archivo ya no viaja — el servidor lo lee del bucket por su ruta.
      const problemas: string[] = [];

      const adjuntos = await mapaConTope(json.creados, ADJUNTOS_EN_PARALELO, async (c) => {
        const gasto = rendicion.gastos.find((g) => g.id === c.gastoId);
        if (!gasto?.archivoPath) {
          return [`El gasto ${c.expenseId} no tiene comprobante guardado. Subilo a mano en Odoo.`];
        }
        // El total esperado en Odoo es NETO + IVA, no el total impreso. Para un
        // pasaje aéreo el IVA se agrega encima, así que Odoo va a tener más que
        // el papel: comparar contra el impreso marcaría una falsa alarma en cada
        // pasaje. Se usa la fila, que ya tiene el desglose calculado.
        const fila = filas.find((f) => f.gasto.id === c.gastoId);

        const r = await fetch("/api/rendidor/adjuntar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseId: c.expenseId,
            archivoPath: gasto.archivoPath,
            nombre: gasto.archivoNombre,
            totalEsperado: fila ? fila.neto + fila.iva : 0,
          }),
        });
        const j = (await leerRespuesta(r)) as unknown as { problemas?: string[] };
        return (j.problemas ?? []).map((p) => `Gasto ${c.expenseId}: ${p}`);
      });

      adjuntos.forEach((r, i) => {
        const expenseId = json.creados[i].expenseId;
        problemas.push(
          ...(r.ok
            ? r.valor
            : [`Gasto ${expenseId}: ${r.error instanceof Error ? r.error.message : "falló el adjunto."}`]),
        );
      });

      // La planilla consolidada se cuelga del PRIMER gasto creado: es un solo
      // documento para toda la rendición, así que duplicarlo en los N gastos
      // sería ruido para quien revisa en Odoo.
      let excelEnOdoo: string | null = null;
      const primero = json.creados[0];
      if (primero) {
        try {
          const r = await fetch(`/api/rendidor/${rendicion.id}/excel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expenseId: primero.expenseId }),
          });
          const j = (await leerRespuesta(r)) as unknown as { nombre: string };
          excelEnOdoo = `${j.nombre} (adjunta al gasto ${primero.expenseId})`;
        } catch (e) {
          problemas.push(
            `La planilla no se pudo adjuntar a Odoo: ${e instanceof Error ? e.message : "error"}. ` +
              "Descargala con el botón y súbila a mano.",
          );
        }
      }

      setRendicion((prev) => ({ ...prev, estado: "cargada_odoo", odooEmployeeId: employeeId }));
      setResultado({
        excelEnOdoo,
        creados: json.creados.length,
        proveedoresCreados: json.proveedoresCreados.length,
        problemas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar a Odoo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    // El <main> del core no tiene tope de ancho: sin esto los campos del editor
    // se estiran a 1900px en un monitor grande.
    <div className="max-w-[1500px]">
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-3xl font-bold uppercase leading-none tracking-tight text-tinta sm:text-4xl">
        {rendicion.tituloRendicion}
      </h1>
      <p className="mt-2 text-sm text-tinta/60">
        {rendicion.nombreQuienRinde} · Fondo entregado {money(rendicion.montoAsignado)}
        {yaCargada && " · Ya cargada a Odoo"}
      </p>

      {error && (
        <div className="mt-3 whitespace-pre-line rounded-lg border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mt-3 whitespace-pre-line rounded-lg border border-teal/20 bg-teal/5 px-3 py-2 text-xs text-teal">
          {aviso}
        </div>
      )}

      {resultado && (
        <div className="mt-4 rounded-2xl border border-teal/30 bg-teal/5 p-5">
          <p className="font-condensed text-base font-bold uppercase text-teal">Cargado a Odoo</p>
          <p className="mt-1 text-sm text-tinta/70">
            {resultado.creados} gasto(s) creados
            {resultado.proveedoresCreados > 0 && ` · ${resultado.proveedoresCreados} proveedor(es) nuevos`}
          </p>
          {resultado.excelEnOdoo && (
            <p className="mt-1 text-sm text-tinta/70">Planilla en Odoo: {resultado.excelEnOdoo}</p>
          )}
          {resultado.problemas.length > 0 && (
            <div className="mt-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                Revisar en Odoo ({resultado.problemas.length})
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-tinta/70">
                {resultado.problemas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* PASO 1 — subir comprobantes */}
      {!yaCargada && (
        <div className={`mt-6 rounded-2xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
          <p className="font-condensed text-lg font-bold tracking-tight text-tinta">1 · Subir comprobantes</p>
          <p className="mt-1 max-w-[70ch] text-xs text-pretty text-tinta/55">
            PDF o imagen. Se analizan de a varios a la vez y puedes corregir todo después. Los comprobantes
            quedan guardados: si cierras la página puedes volver más tarde y seguir donde estabas, sin subir
            nada de nuevo.
          </p>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            disabled={analizando !== null}
            onChange={(e) => e.target.files && subirYAnalizar(e.target.files)}
            className="mt-4 block w-full text-xs text-tinta/70 file:mr-3 file:mb-2 file:rounded-md file:border file:border-borde file:bg-crema/60 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-tinta sm:file:mb-0"
          />
          {analizando && (
            <p className="mt-2 flex items-center gap-2 text-xs font-medium text-naranjo">
              <RuedaCarga />
              Analizando comprobante {analizando.actual} de {analizando.total}...
            </p>
          )}
        </div>
      )}

      {/* PASO 2 — revisar y corregir */}
      {rendicion.gastos.length > 0 && (
        <div className={`mt-6 rounded-2xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-condensed text-lg font-bold tracking-tight text-tinta">
              2 · Revisar y corregir
            </p>
            {pendientes.length > 0 && (
              <span className="rounded-full bg-naranjo/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                {pendientes.length} por confirmar
              </span>
            )}
          </div>
          <p className="mt-1 max-w-[70ch] text-xs text-pretty text-tinta/55">
            El neto y el IVA se calculan desde el total impreso según el tipo de documento. Lo que corrijas
            aquí es exactamente lo que se carga a Odoo.
          </p>

          {/* Una tarjeta por gasto, en vez de una tabla de 1100px con scroll
              horizontal. Diez campos editables no caben en una fila en ninguna
              pantalla: en el celular había que arrastrar para ver el total, y en
              escritorio igual, solo un poco menos.

              La grilla va de 1 columna a 2 y a 4, así que el mismo marcado sirve
              para el teléfono y para un monitor ancho sin nada oculto ni ningún
              desplazamiento lateral. */}
          <ul className="mt-4 flex flex-col gap-3">
            {filas.map(({ gasto: g, neto, iva, advertencias }, i) => {
              const avisos = [...g.pendientes.map((p) => `Ilegible: ${p}`), ...advertencias];
              const rutMalo = Boolean(g.rutProveedor?.trim()) && !rutValido(g.rutProveedor!);

              return (
                <li
                  key={g.id}
                  className={`rounded-xl border bg-superficie px-4 py-3.5 ${SOMBRA_CALIDA} ${
                    avisos.length > 0 || rutMalo ? "border-naranjo/40" : "border-borde"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-borde pb-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {/* La miniatura del comprobante, para poder cotejar lo que
                          dice el documento contra lo que quedó en los campos sin
                          tener que abrirlo en otra pestaña. */}
                      <Previsualizacion
                        url={vistasLocales[g.id] ?? urlsRespaldo[g.id]}
                        nombre={g.archivoNombre}
                        tipo={g.archivoTipo}
                      />
                      <div className="min-w-0">
                        <span className="font-condensed text-base font-bold leading-none tabular-nums text-tinta">
                          {i + 1}
                        </span>
                        {/* El proveedor repetido en el encabezado: es lo que
                            identifica el gasto de un vistazo. */}
                        <p className="truncate text-xs text-tinta/45">
                          {g.proveedor?.trim() || "Sin proveedor"}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-tinta/30" title={g.archivoNombre}>
                          {g.archivoNombre || "sin archivo"}
                        </p>
                      </div>
                    </div>
                    {!yaCargada && <DeleteButton onClick={() => quitarGasto(g.id)} />}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Campo etiqueta="Fecha">
                      <input
                        type="date"
                        value={g.fecha ?? ""}
                        disabled={yaCargada}
                        onChange={(e) => actualizarGasto(g.id, { fecha: e.target.value || null })}
                        className="h-8 w-full rounded-md border border-borde bg-superficie px-2 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema disabled:text-tinta/50"
                      />
                    </Campo>

                    <Campo etiqueta="Tipo de documento">
                      <SelectInput
                        value={(g.tipoDocumento ?? "") as TipoDocumento | ""}
                        disabled={yaCargada}
                        onChange={(v) =>
                          actualizarGasto(g.id, { tipoDocumento: (v || null) as TipoDocumento | null })
                        }
                        options={[
                          { value: "" as TipoDocumento | "", label: "— elegir —" },
                          ...TIPOS_DOCUMENTO.map((t) => ({
                            value: t as TipoDocumento | "",
                            label: TRATAMIENTO_DOCUMENTO[t].etiqueta,
                          })),
                        ]}
                      />
                    </Campo>

                    <Campo etiqueta="Proveedor" ancho="xl:col-span-2">
                      <TextInput
                        value={g.proveedor}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { proveedor: v })}
                      />
                    </Campo>

                    <Campo etiqueta="RUT del proveedor">
                      <TextInput
                        value={g.rutProveedor ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { rutProveedor: v || null })}
                      />
                      {/* Se avisa al escribirlo, no al cargar: Odoo valida el
                          dígito verificador y rechaza el proveedor recién en la
                          carga, cuando ya hay gastos creados. */}
                      {rutMalo && (
                        <span className="mt-1 block text-[10px] leading-tight text-red-600">
                          El dígito verificador no calza
                        </span>
                      )}
                    </Campo>

                    <Campo etiqueta="N° de documento">
                      <TextInput
                        value={g.numeroDocumento ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { numeroDocumento: v || null })}
                      />
                    </Campo>

                    <Campo etiqueta="Categoría">
                      <SelectInput
                        value={(g.categoria ?? "") as CategoriaGasto | ""}
                        disabled={yaCargada}
                        onChange={(v) =>
                          actualizarGasto(g.id, { categoria: (v || null) as CategoriaGasto | null })
                        }
                        options={[
                          { value: "" as CategoriaGasto | "", label: "— elegir —" },
                          ...CATEGORIAS_GASTO.map((c) => ({
                            value: c as CategoriaGasto | "",
                            label: c,
                          })),
                        ]}
                      />
                    </Campo>

                    <Campo etiqueta="Detalle" ancho="sm:col-span-2 xl:col-span-3">
                      <TextInput
                        value={g.detalle}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { detalle: v })}
                      />
                    </Campo>

                    <Campo etiqueta="Total impreso">
                      <NumInput
                        value={g.total}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { total: v })}
                        align="right"
                      />
                      {/* Neto e IVA no se editan: salen del total según el tipo de
                          documento. Van debajo del total, que es de donde se
                          derivan, en vez de en dos columnas aparte que parecían
                          campos más. */}
                      <span className="mt-1 block text-right text-[10px] tabular-nums text-tinta/45">
                        Neto {money(neto)} · IVA {money(iva)}
                      </span>
                    </Campo>
                  </div>

                  {avisos.length > 0 && (
                    <p className="mt-3 rounded-md border-l-2 border-naranjo bg-naranjo/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-pretty text-naranjo">
                      {avisos.join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Los totales de la tabla vivían en un <tfoot> que quedaba fuera de
              vista con el scroll horizontal. Ahora van acá, junto al fondo y el
              saldo, que es la única cifra que a alguien le interesa de verdad. */}
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-crema/60 px-4 py-3.5 sm:grid-cols-5">
            <div>
              <p className="text-[10px] text-tinta/45">Neto</p>
              <p className="font-condensed text-sm font-bold tabular-nums">{money(totales.neto)}</p>
            </div>
            <div>
              <p className="text-[10px] text-tinta/45">IVA</p>
              <p className="font-condensed text-sm font-bold tabular-nums">{money(totales.iva)}</p>
            </div>
            <div>
              <p className="text-[10px] text-tinta/45">Fondo entregado</p>
              <p className="font-condensed text-sm font-bold tabular-nums">
                {money(rendicion.montoAsignado)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-tinta/45">Total rendido</p>
              <p className="font-condensed text-sm font-bold tabular-nums">{money(totales.total)}</p>
            </div>
            <div>
              <p className="text-[10px] text-pretty text-tinta/45">
                {totales.saldo >= 0
                  ? `A reembolsar a ${rendicion.nombreQuienRinde}`
                  : "A reintegrar a la empresa"}
              </p>
              <p
                className={`font-condensed text-sm font-bold tabular-nums ${
                  totales.saldo >= 0 ? "text-teal" : "text-naranjo"
                }`}
              >
                {money(Math.abs(totales.saldo))}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {!yaCargada && (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                aria-busy={guardando}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-borde bg-superficie px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:cursor-progress disabled:opacity-40 sm:w-auto sm:py-2"
              >
                {guardando && <RuedaCarga />}
                {guardando ? "Guardando..." : "Guardar borrador"}
              </button>
            )}
            <button
              type="button"
              onClick={descargarExcel}
              disabled={generandoExcel || rendicion.gastos.length === 0}
              aria-busy={generandoExcel}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-borde bg-superficie px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:cursor-progress disabled:opacity-40 sm:w-auto sm:py-2"
            >
              {generandoExcel && <RuedaCarga />}
              {generandoExcel ? "Generando planilla..." : "Descargar Excel"}
            </button>
            {!yaCargada && (
              <button
                type="button"
                onClick={resolverProveedores}
                disabled={resolviendo || rendicion.gastos.length === 0}
                aria-busy={resolviendo}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-tinta px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85 disabled:cursor-progress disabled:opacity-40 sm:w-auto sm:py-2"
              >
                {resolviendo && <RuedaCarga />}
                {resolviendo ? "Buscando proveedores..." : "Continuar a Odoo →"}
              </button>
            )}
          </div>
          {sinRespaldo > 0 && (
            <p className="mt-2 text-xs text-tinta/50">
              {sinRespaldo} de {rendicion.gastos.length} gasto(s) no tienen comprobante, así que en la hoja
              Respaldos salen con un aviso en vez de la imagen.
            </p>
          )}
        </div>
      )}

      {/* PASO 3 — confirmar y cargar */}
      {paso === "cargar" && !yaCargada && (
        <div className={`mt-6 rounded-2xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
          <p className="font-condensed text-lg font-bold tracking-tight text-tinta">
            3 · Confirmar y cargar a Odoo
          </p>

          <div className="mt-3">
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
              Empleado en Odoo
            </label>
            {/* El empleado se elige al crear la rendición, así que acá ya viene
                resuelto. El buscador queda solo para las rendiciones anteriores
                a ese cambio, que se guardaron con el nombre a mano. */}
            {employeeId && empleados.length === 0 ? (
              <p className="mt-1 text-sm text-tinta">
                {rendicion.nombreQuienRinde}{" "}
                <span className="text-xs text-tinta/50">· Odoo #{employeeId}</span>
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={buscarEmpleado}
                  disabled={buscandoEmpleado}
                  aria-busy={buscandoEmpleado}
                  className="inline-flex items-center gap-2 rounded-md border border-borde bg-superficie px-3 py-1.5 text-xs font-medium text-tinta hover:border-naranjo/50 disabled:cursor-progress disabled:opacity-40"
                >
                  {buscandoEmpleado && <RuedaCarga />}
                  {buscandoEmpleado ? "Buscando..." : `Buscar "${rendicion.nombreQuienRinde}"`}
                </button>
                {empleados.length > 0 && (
                  <select
                    value={employeeId ?? ""}
                    onChange={(e) => setEmployeeId(Number(e.target.value) || null)}
                    className="rounded border border-borde bg-superficie px-2 py-1.5 text-xs"
                  >
                    <option value="">— elegir empleado —</option>
                    {empleados.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} (id {e.id})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
            Proveedor por gasto (obligatorio)
          </p>
          <div className="mt-2 space-y-2">
            {rendicion.gastos.map((g) => {
              const p = proveedores[g.id];
              if (!p) return null;
              return (
                <div key={g.id} className="rounded-lg border border-borde bg-crema/30 px-3 py-2">
                  <p className="text-xs font-medium text-tinta">
                    {g.orden}. {g.proveedor || "(sin proveedor)"}{" "}
                    <span className="text-tinta/45">{g.rutProveedor ?? "sin RUT"}</span>
                  </p>
                  {p.candidatos.length > 0 ? (
                    <select
                      value={p.elegido ?? ""}
                      onChange={(e) =>
                        setProveedores((prev) => ({
                          ...prev,
                          [g.id]: { ...prev[g.id], elegido: Number(e.target.value) || null, crear: false },
                        }))
                      }
                      className="mt-1 w-full rounded border border-borde bg-superficie px-2 py-1 text-xs"
                    >
                      <option value="">— elegir proveedor —</option>
                      {p.candidatos.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.vat ? `· ${c.vat}` : ""} (id {c.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-tinta/70">
                      <span className="text-naranjo">No existe en Odoo: se creará.</span>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={p.esPersonaNatural}
                          onChange={(e) =>
                            setProveedores((prev) => ({
                              ...prev,
                              [g.id]: { ...prev[g.id], esPersonaNatural: e.target.checked },
                            }))
                          }
                        />
                        Es persona natural
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {pendientes.length > 0 && (
            <div className="mt-4 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-naranjo">
              Hay {pendientes.length} gasto(s) con datos por confirmar. Revisalos antes de cargar: los que no
              tengan tipo de documento, categoría o fecha van a rechazar la carga.
            </div>
          )}

          <button
            type="button"
            onClick={cargarAOdoo}
            disabled={guardando || !employeeId}
            aria-busy={guardando}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal/85 disabled:cursor-progress disabled:opacity-40 sm:w-auto sm:py-2"
          >
            {guardando && <RuedaCarga />}
            {guardando
              ? "Cargando a Odoo..."
              : `Confirmar y crear ${rendicion.gastos.length} gasto(s) en Odoo`}
          </button>
        </div>
      )}
    </div>
  );
}
