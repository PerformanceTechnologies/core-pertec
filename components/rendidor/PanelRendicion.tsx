"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { leerRespuesta, mapaConTope } from "@/lib/rendidor/red";
import { TextInput, NumInput, SelectInput, DeleteButton } from "@/components/cotizador/campos/Campos";
import RuedaCarga from "@/components/RuedaCarga";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import Avisos, { type Aviso } from "@/components/rendidor/Avisos";
import VisorComprobante, { type Comprobante } from "./VisorComprobante";


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

// Comprobantes analizándose a la vez. Tres es el punto donde se nota la mejora
// sin abrir demasiadas invocaciones en paralelo.
const ANALISIS_EN_PARALELO = 3;

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

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
 * Es un botón y no un enlace: abre el visor dentro de la misma página. Abrirlo en
 * otra pestaña rompía justo lo que uno está haciendo —mirar el documento para
 * cotejar un dato contra el campo de al lado— porque obligaba a cambiar de
 * pestaña, mirar, volver y buscar otra vez dónde se estaba.
 *
 * Con `<img>` y no con next/image a propósito: el optimizador de Next descarga la
 * imagen desde su servidor y la CACHEA en la CDN, y estos son documentos
 * tributarios que viven en un bucket privado detrás de una URL firmada que expira.
 * Dejar copias optimizadas en una CDN pública es exactamente lo que el bucket
 * privado evita.
 *
 * Los PDF no se pueden miniaturizar en un <img>, así que muestran una ficha con el
 * nombre. Abren igual en el visor, que para PDF usa el lector del navegador.
 */
function Previsualizacion({
  url,
  nombre,
  tipo,
  onAbrir,
}: {
  url?: string;
  nombre: string;
  tipo: string;
  onAbrir: (c: Comprobante) => void;
}) {
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
    <button
      type="button"
      // La miniatura vive dentro de un <summary>: sin preventDefault, el clic
      // abriría el visor Y plegaría la tarjeta al mismo tiempo.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAbrir({ url, nombre, esPdf });
      }}
      title={`Ver ${nombre}`}
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
    </button>
  );
}

export default function PanelRendicion({
  rendicionInicial,
  urlsRespaldo = {},
  revisar = [],
}: {
  rendicionInicial: Rendicion;
  /**
   * Lo que la carga a Odoo dejó por revisar: un adjunto que no subió, la planilla que no
   * se pudo colgar. Viene de la URL (ver [id]/page.tsx), no de un estado de este
   * componente, porque la carga ya no pasa acá — pasa en ./odoo.
   */
  revisar?: string[];
  /**
   * URL firmada por gasto, generada en el servidor. De vida corta, ver
   * lib/rendidor/almacenamiento.ts.
   */
  urlsRespaldo?: Record<string, string>;
}) {
  const router = useRouter();
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
  /** El comprobante que se está mirando en el visor, o null si está cerrado. */
  const [viendo, setViendo] = useState<Comprobante | null>(null);
  const [analizando, setAnalizando] = useState<{ actual: number; total: number } | null>(null);
  /**
   * Los avisos, apilados abajo a la derecha y cada uno con su ×. Ver ./Avisos.tsx.
   *
   * Antes eran dos strings —uno de error y uno de aviso— dibujados debajo del título. Se
   * veían solo arriba, se pisaban entre sí y se iban con el siguiente evento: quien
   * apretaba "cargar a Odoo" al final del paso 3 no veía nada y volvía a apretar.
   */
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  /**
   * Lleva hasta un elemento y lo destaca un momento.
   *
   * El destaque es lo que cierra el círculo: llevar el scroll hasta una tarjeta que se ve
   * igual que las otras quince no dice cuál era. `open` de paso, porque las tarjetas de
   * gasto son <details> y la que hay que mirar puede estar plegada.
   */
  const irA = (id: string) => {
    const nodo = document.getElementById(id);
    if (!nodo) return;
    nodo.closest("details")?.setAttribute("open", "");
    nodo.scrollIntoView({ behavior: "smooth", block: "center" });
    nodo.classList.add("destacado");
    window.setTimeout(() => nodo.classList.remove("destacado"), 2200);
  };

  const cerrarAviso = (id: string) => setAvisos((prev) => prev.filter((a) => a.id !== id));
  /**
   * Pone un aviso arriba de la pila.
   *
   * Los del mismo `clave` se reemplazan: apretar dos veces "cargar a Odoo" con el mismo
   * problema tiene que dejar UN aviso, no dos idénticos. Los que no traen clave se
   * acumulan, que es lo correcto para los que hablan de cosas distintas.
   */
  const avisar = (aviso: Omit<Aviso, "id"> & { clave?: string }) => {
    const id = aviso.clave ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAvisos((prev) => [{ ...aviso, id }, ...prev.filter((a) => a.id !== id)]);
  };
  const [generandoExcel, setGenerandoExcel] = useState(false);
  /**
   * Estado del autoguardado.
   *
   * "limpio" es el estado inicial y también el de después de guardar sin cambios
   * nuevos; se distingue de "guardado" para no mostrar "Guardado 15:02" al abrir
   * una rendición que nadie tocó.
   */
  const [estadoGuardado, setEstadoGuardado] = useState<
    "limpio" | "pendiente" | "guardando" | "guardado" | "error"
  >("limpio");
  const [guardadoEn, setGuardadoEn] = useState<string | null>(null);

  /**
   * Para plegar o desplegar todas las tarjetas de gasto de una vez.
   *
   * Se toca el DOM en vez de llevar el estado de apertura en React, y es a
   * propósito: `<details>` ya guarda su propio estado, y duplicarlo en un `Set` de
   * ids significaría re-renderizar el formulario entero cada vez que alguien abre
   * una fila — con inputs controlados adentro, eso es pedir problemas de foco.
   * Esto es exactamente el caso para el que sirve una ref.
   */
  const listaGastos = useRef<HTMLUListElement>(null);
  const plegarTodo = (abrir: boolean) => {
    listaGastos.current?.querySelectorAll("details").forEach((d) => {
      d.open = abrir;
    });
  };

  // Cada createObjectURL retiene el archivo en memoria hasta que se revoca. Sin
  // esto, subir 16 comprobantes y navegar a otra parte deja los 16 colgados.
  useEffect(() => {
    const urls = Object.values(vistasLocales);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [vistasLocales]);

  /**
   * Mientras se guarda antes de pasar a la página de Odoo.
   *
   * El paso de Odoo —elegir el proveedor de cada gasto y el fondo— vive en su propia
   * página (./odoo). Acá solo queda guardar y navegar: los proveedores se resuelven allá,
   * en el servidor, así que este componente ya no tiene estado de Odoo.
   */
  const [yendoAOdoo, setYendoAOdoo] = useState(false);

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

  const actualizarGasto = (id: string, patch: Partial<GastoRendicion>) => {
    setEstadoGuardado("pendiente");
    setRendicion((prev) => ({
      ...prev,
      gastos: prev.gastos.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));
  };

  // El respaldo queda en el bucket. No se borra al quitar la fila: si alguien
  // borra un gasto por error, volver a subir el archivo es lo mas molesto de
  // rehacer. Los huerfanos se van con la rendicion cuando se borra.
  const quitarGasto = (id: string) => {
    setEstadoGuardado("pendiente");
    setRendicion((prev) => ({ ...prev, gastos: prev.gastos.filter((g) => g.id !== id) }));
  };

  // PASO 1 y 2: subir y analizar. Un comprobante por request (el límite de 60s
  // de Vercel no da para varios), pero VARIOS REQUESTS A LA VEZ: analizar 16
  // boletas de a una eran más de cinco minutos de espera.
  const subirYAnalizar = async (lista: FileList) => {
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
    // El id del primer gasto que quedó a medio leer: es a donde lleva el "Ir al primero"
    // del aviso. Se anota acá y no se deduce del texto —los mensajes traen el NOMBRE del
    // archivo, no el id, así que buscar el elemento por ahí no encontraba nada—.
    let primerPobre: string | null = null;

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
      const idGastoPobre = ilegibles.length >= 3 && ladoLargo > 0 && ladoLargo < LADO_MINIMO_UTIL;
      if (idGastoPobre) {
        pobres.push(
          `${nuevos[i].name}: ${ancho}×${alto} px. A esa resolución la letra chica de un ` +
            `comprobante no se puede leer, y ampliarla no la recupera. Subí el PDF original o ` +
            `una captura más grande.`,
        );
      }
      const idGasto = crypto.randomUUID();
      if (idGastoPobre && !primerPobre) primerPobre = idGasto;
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
      setEstadoGuardado("pendiente");
      setVistasLocales((prev) => ({ ...prev, ...vistasNuevas }));
      setRendicion((prev) => ({ ...prev, gastos: [...prev.gastos, ...gastosNuevos] }));
    }
    if (fallos.length > 0) {
      avisar({
        tono: "error",
        titulo: `No se pudieron analizar ${fallos.length} archivo(s)`,
        detalle: `Podés agregarlos a mano.\n${fallos.join("\n")}`,
      });
    }
    if (pobres.length > 0) {
      // Va como atención y no como error: el gasto SÍ se creó, con los campos que se
      // pudieron leer, y el resto se completa a mano. Y ADEMÁS del anterior, no en su
      // lugar: si diez archivos fallaron y tres quedaron a medias, las dos cosas pasaron.
      avisar({
        tono: "atencion",
        titulo: `${pobres.length} comprobante(s) quedaron con campos sin leer`,
        detalle: `Por la resolución del archivo. Completalos a mano:\n${pobres.join("\n")}`,
        accion: primerPobre
          ? { texto: "Ir al primero", alPulsar: () => irA(`gasto-${primerPobre}`) }
          : undefined,
      });
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

      avisar({
        tono: "ok",
        titulo: "Planilla descargada",
        detalle:
          sinRespaldo > 0
            ? `${sinRespaldo} gasto(s) no tienen comprobante, así que salen sin imagen.`
            : undefined,
      });
    } catch (e) {
      avisar({
        tono: "error",
        titulo: "No se pudo generar la planilla",
        detalle: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setGenerandoExcel(false);
    }
  };

  /**
   * Persiste los gastos. La usa el autoguardado y el reintento manual.
   *
   * No toca `aviso` ni `error` globales: el autoguardado corre solo y llenar la
   * pantalla de "Borrador guardado." cada vez que alguien tipea una letra sería
   * insoportable. El estado se comunica en el indicador de al lado del paso 2.
   */
  const persistir = useCallback(async () => {
    setEstadoGuardado("guardando");
    try {
      const resp = await fetch(`/api/rendidor/${rendicion.id}/gastos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gastos: rendicion.gastos }),
      });
      await leerRespuesta(resp);
      setEstadoGuardado("guardado");
      setGuardadoEn(
        new Intl.DateTimeFormat("es-CL", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "America/Santiago",
        }).format(new Date()),
      );
    } catch (e) {
      setEstadoGuardado("error");
      avisar({
        tono: "error",
        clave: "guardar",
        titulo: "No se pudo guardar",
        detalle: e instanceof Error ? e.message : undefined,
      });
    }
  }, [rendicion.id, rendicion.gastos]);

  /**
   * Autoguardado: cada cambio en los gastos se persiste solo, con un compás de
   * espera para no mandar un PATCH por cada tecla.
   *
   * Antes había que apretar "Guardar borrador", y no apretarlo perdía todo el
   * trabajo de corrección al cerrar la pestaña — sin ningún aviso, porque los
   * comprobantes SÍ quedaban guardados y la rendición existía: lo único que se
   * perdía eran las correcciones.
   *
   * El primer render no guarda: abrir una rendición no es un cambio, y guardar al
   * abrir escribiría en la base cada visita.
   *
   * El estado "pendiente" NO se marca acá sino en las funciones que modifican los
   * gastos. Marcarlo en el cuerpo del efecto es un setState sincrónico durante el
   * render —el lint lo rechaza con razón— y además es conceptualmente al revés:
   * "hay cambios sin guardar" es consecuencia de que alguien editó, no de que se
   * haya vuelto a renderizar.
   */
  const primerRender = useRef(true);
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    // Una rendición ya cargada a Odoo es de solo lectura.
    if (yaCargada) return;

    const t = setTimeout(persistir, 1200);
    return () => clearTimeout(t);
    // persistir cambia junto con rendicion.gastos, que es justo el disparador.
  }, [persistir, yaCargada]);

  /**
   * Aviso al cerrar si quedó algo sin guardar.
   *
   * La ventana del compás de espera es de poco más de un segundo, pero cerrar la
   * pestaña justo ahí perdía la última corrección. El navegador muestra su propio
   * diálogo; el texto no se puede personalizar.
   */
  useEffect(() => {
    if (estadoGuardado !== "pendiente" && estadoGuardado !== "guardando") return;
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [estadoGuardado]);

  /**
   * Guarda y pasa a la página de Odoo.
   *
   * El guardado es lo que hace que la página siguiente vea lo mismo que la pantalla: ahí
   * los proveedores se resuelven EN EL SERVIDOR leyendo la rendición de la base, así que
   * una corrección todavía en el compás de espera del autoguardado se resolvería contra
   * el dato viejo — el proveedor que se acaba de corregir se buscaría por el anterior.
   */
  const irAOdoo = async () => {
    setYendoAOdoo(true);
    try {
      await persistirGastos();
      router.push(`/rendir-gastos/${rendicion.id}/odoo`);
    } catch (e) {
      setYendoAOdoo(false);
      avisar({
        tono: "error",
        clave: "guardar",
        titulo: "No se pudo guardar antes de continuar",
        detalle: e instanceof Error ? e.message : undefined,
      });
    }
  };

  return (
    // El <main> del core no tiene tope de ancho: sin esto los campos del editor
    // se estiran a 1900px en un monitor grande.
    <div className="animar-entrada max-w-[1500px]">
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-3xl font-bold uppercase leading-none tracking-tight text-tinta sm:text-4xl">
        {rendicion.tituloRendicion}
      </h1>
      <p className="mt-2 text-sm text-tinta/60">
        {rendicion.nombreQuienRinde} · Fondo entregado {money(rendicion.montoAsignado)}
        {yaCargada && " · Ya cargada a Odoo"}
      </p>


      {/* Lo que quedó por revisar en Odoo, si la carga dejó algo a medias.
          Llega en la URL desde la página de carga, que es la que sabe qué pasó: así
          sobrevive al refresco y se puede compartir el enlace con quien tenga que
          revisarlo en Odoo. Un adjunto que falló no cancela la carga —los gastos ya
          están creados— pero hay que subirlo a mano, y esto es lo único que lo dice. */}
      {yaCargada && (
        <div className="mt-4 rounded-2xl border border-teal/30 bg-teal/5 p-5">
          <p className="font-condensed text-base font-bold uppercase text-teal">Cargada a Odoo</p>
          <p className="mt-1 text-sm text-tinta/70">
            {rendicion.gastos.length} gasto(s) en Odoo. Los comprobantes y la planilla quedaron adjuntos.
          </p>
          {revisar.length > 0 && (
            <div className="mt-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                Revisar en Odoo ({revisar.length})
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-tinta/70">
                {revisar.map((p, i) => (
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
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="font-condensed text-lg font-bold tracking-tight text-tinta">
              2 · Revisar y corregir
            </p>
            {/* Todo lo demás agrupado a la derecha: con cuatro elementos sueltos,
                justify-between los repartía a lo ancho y el estado del guardado
                quedaba flotando en el medio de la nada. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* El estado del autoguardado vive acá, al lado del título del paso, y
                no como un aviso flotante: es información de fondo, no un evento
                que interrumpa. */}
              {!yaCargada && (
                <span
                  className="flex items-center gap-1.5 text-[11px] text-tinta/40"
                  // aria-live para que un lector de pantalla anuncie el cambio de
                  // estado, que es el único indicio de que se guardó.
                  aria-live="polite"
                >
                  {estadoGuardado === "guardando" && (
                    <>
                      <RuedaCarga />
                      Guardando
                    </>
                  )}
                  {estadoGuardado === "pendiente" && "Cambios sin guardar"}
                  {estadoGuardado === "guardado" && <span className="text-teal">Guardado {guardadoEn}</span>}
                  {estadoGuardado === "error" && <span className="text-red-600">No se pudo guardar</span>}
                  {estadoGuardado === "limpio" && "Se guarda solo"}
                </span>
              )}
              {/* Solo con más de una tarjeta: con una sola, plegar y desplegar todo
                es lo mismo que el propio encabezado de esa tarjeta. */}
              {filas.length > 1 && (
                <span className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => plegarTodo(true)}
                    className="font-medium text-tinta/45 underline underline-offset-2 hover:text-naranjo"
                  >
                    Desplegar todo
                  </button>
                  <span className="text-tinta/20">·</span>
                  <button
                    type="button"
                    onClick={() => plegarTodo(false)}
                    className="font-medium text-tinta/45 underline underline-offset-2 hover:text-naranjo"
                  >
                    Plegar todo
                  </button>
                </span>
              )}
              {pendientes.length > 0 && (
                <span className="rounded-full bg-naranjo/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                  {pendientes.length} por confirmar
                </span>
              )}
            </div>
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
          <ul ref={listaGastos} className="mt-4 flex flex-col gap-3">
            {filas.map(({ gasto: g, neto, iva, advertencias }, i) => {
              const avisos = [...g.pendientes.map((p) => `Ilegible: ${p}`), ...advertencias];
              const rutMalo = Boolean(g.rutProveedor?.trim()) && !rutValido(g.rutProveedor!);

              // Se abre lo que hay que mirar: un gasto con campos ilegibles o con
              // un RUT que no calza. Lo que quedó bien arranca plegado, y con una
              // rendición de dieciséis comprobantes eso es la diferencia entre una
              // lista que se recorre y una página de cinco pantallas de alto.
              //
              // Con un solo gasto no tiene sentido plegarlo: no hay lista que
              // recorrer.
              const abierto = avisos.length > 0 || rutMalo || filas.length === 1;

              return (
                <li
                  key={g.id}
                  id={`gasto-${g.id}`}
                  className={`overflow-hidden rounded-xl border bg-superficie ${SOMBRA_CALIDA} ${
                    avisos.length > 0 || rutMalo ? "border-naranjo/40" : "border-borde"
                  }`}
                >
                  <details open={abierto} className="group/gasto">
                    {/* <details> y no estado propio: plegar y desplegar no tiene
                        por qué re-renderizar el formulario ni arriesgar que un
                        input pierda el foco mientras alguien escribe. */}
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-crema/40">
                      <div className="flex min-w-0 items-start gap-3">
                        {/* La miniatura del comprobante, para poder cotejar lo que
                            dice el documento contra lo que quedó en los campos sin
                            tener que abrirlo en otra pestaña. */}
                        <Previsualizacion
                          url={vistasLocales[g.id] ?? urlsRespaldo[g.id]}
                          nombre={g.archivoNombre}
                          tipo={g.archivoTipo}
                          onAbrir={setViendo}
                        />
                        <div className="min-w-0">
                          <span className="font-condensed text-base font-bold leading-none tabular-nums text-tinta">
                            {i + 1}
                          </span>
                          {/* El proveedor identifica el gasto de un vistazo, y es
                              lo único que se ve con la tarjeta plegada. */}
                          <p className="truncate text-xs text-tinta/45">
                            {g.proveedor?.trim() || "Sin proveedor"}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-tinta/30" title={g.archivoNombre}>
                            {g.archivoNombre || "sin archivo"}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {/* El total va en el resumen: es la cifra que se recorre
                            cuando se revisa una rendición entera plegada. */}
                        <div className="text-right">
                          <p className="font-condensed text-base font-bold tabular-nums text-tinta">
                            {money(g.total)}
                          </p>
                          {(avisos.length > 0 || rutMalo) && (
                            <p className="text-[10px] font-semibold text-naranjo">Revisar</p>
                          )}
                        </div>
                        {!yaCargada && (
                          // preventDefault en el span y no en el botón: DeleteButton
                          // no recibe el evento, y sin esto el clic burbujea al
                          // <summary> y además pliega la tarjeta.
                          <span onClick={(e) => e.preventDefault()}>
                            <DeleteButton onClick={() => quitarGasto(g.id)} />
                          </span>
                        )}
                        {/* La flecha gira al abrir. Es el único indicio de que la
                            fila se despliega, así que no puede faltar. */}
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          aria-hidden
                          className="shrink-0 text-tinta/35 transition-transform duration-200 group-open/gasto:rotate-180"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                    </summary>

                    <div className="border-t border-borde px-4 pb-4">
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
                    </div>
                  </details>
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
            {/* No hay botón de guardar: se guarda solo. El único botón que
                aparece es el de reintentar, y solo cuando el autoguardado falló —
                un botón de guardar permanente al lado de un autoguardado que
                funciona solo genera la duda de si hay que apretarlo. */}
            {!yaCargada && estadoGuardado === "error" && (
              <button
                type="button"
                onClick={persistir}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-red-600/40 bg-red-600/5 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-600/10 sm:w-auto sm:py-2"
              >
                Reintentar el guardado
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
                onClick={irAOdoo}
                disabled={yendoAOdoo || rendicion.gastos.length === 0}
                aria-busy={yendoAOdoo}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-tinta px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85 disabled:cursor-progress disabled:opacity-40 sm:w-auto sm:py-2"
              >
                {yendoAOdoo && <RuedaCarga />}
                {yendoAOdoo ? "Guardando cambios..." : "Continuar a Odoo →"}
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

      {/* El visor se monta una sola vez, al final: uno por página y no uno por
          gasto. Y se desmonta al cerrar, así el <img> o el <iframe> dejan de
          existir en vez de quedar ocultos consumiendo memoria. */}
      {viendo && <VisorComprobante comprobante={viendo} onCerrar={() => setViendo(null)} />}

      {/* Los avisos, fijos abajo a la derecha: se ven desde cualquier punto de la página,
          se apilan en vez de pisarse y se cierran con su ×. Ver ./Avisos.tsx. */}
      <Avisos avisos={avisos} alCerrar={cerrarAviso} />
    </div>
  );
}
