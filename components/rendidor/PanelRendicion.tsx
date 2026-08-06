"use client";

import { useMemo, useState } from "react";
import {
  CATEGORIAS_GASTO,
  TIPOS_DOCUMENTO,
  TRATAMIENTO_DOCUMENTO,
  type CategoriaGasto,
  type GastoRendicion,
  type Rendicion,
  type TipoDocumento,
} from "@/lib/rendidor/tipos";
import { calcularDesglose } from "@/lib/rendidor/iva";
import { TextInput, NumInput, SelectInput, DeleteButton } from "@/components/cotizador/campos/Campos";

// Los archivos viven en memoria del navegador durante la sesión: se envían al
// análisis y otra vez al adjuntar. En esta primera versión no hay bucket, así
// que un borrador recuperado más tarde conserva los DATOS pero no los archivos
// (hay que volver a subirlos para adjuntarlos a Odoo). Se avisa en la UI.
interface ArchivoEnMemoria {
  gastoId: string;
  archivo: File;
}

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

// Las fotos de celular llegan a 4000 px y varios MB. La API de visión de todos
// modos reescala a 1568 px en el lado largo, así que reducirlas acá no pierde
// nada de calidad de lectura y sí baja mucho el peso del upload y el tiempo de
// análisis — que es lo que hacía que la función se cayera por tiempo.
const LADO_MAXIMO = 1568;

async function reducirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));

    // Ya es chica: no vale la pena recomprimirla (perdería calidad sin ganar nada).
    if (escala === 1 && archivo.size <= 1_500_000) {
      bitmap.close();
      return archivo;
    }

    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= archivo.size) return archivo;

    return new File([blob], archivo.name, { type: "image/jpeg" });
  } catch {
    // Si el navegador no puede decodificarla, que decida el servidor.
    return archivo;
  }
}

/**
 * Versión chica y en escala de grises para embeber en el Excel.
 *
 * La skill fija un techo de 60 KB por respaldo (objetivo 35 KB) en escala de
 * grises a 1400 px: medido ahí, una boleta A4 escaneada a 300 dpi baja de 339 KB
 * a 30 KB y sigue perfectamente legible. Acá el motivo no es el costo en tokens
 * sino que N respaldos viajan JUNTOS en un solo request para armar la planilla, y
 * el body de Vercel tope ~4,5 MB: con 35 KB cada uno, entran más de 100.
 */
async function comprimirParaExcel(archivo: File): Promise<File | null> {
  if (!archivo.type.startsWith("image/")) return archivo.type === "application/pdf" ? archivo : null;

  try {
    const bitmap = await createImageBitmap(archivo);
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d");
    if (!ctx) return archivo;

    // Escalones decrecientes, igual que la skill: se corta en el primero que
    // baja del objetivo, para no degradar más de lo necesario.
    for (const [maxDim, calidad] of [
      [1400, 0.65], [1200, 0.6], [1000, 0.55], [900, 0.5],
    ] as const) {
      const escala = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      lienzo.width = Math.round(bitmap.width * escala);
      lienzo.height = Math.round(bitmap.height * escala);
      ctx.filter = "grayscale(1)";
      ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);

      const blob = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/jpeg", calidad));
      if (!blob) break;
      if (blob.size <= 35 * 1024 || maxDim === 900) {
        bitmap.close();
        return new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      }
    }
    bitmap.close();
    return archivo;
  } catch {
    return archivo;
  }
}

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

export default function PanelRendicion({ rendicionInicial }: { rendicionInicial: Rendicion }) {
  const [rendicion, setRendicion] = useState(rendicionInicial);
  const [paso, setPaso] = useState<Paso>(rendicion.gastos.length > 0 ? "revisar" : "subir");
  const [archivos, setArchivos] = useState<ArchivoEnMemoria[]>([]);
  const [analizando, setAnalizando] = useState<{ actual: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

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

        if (g.tipoDocumento && g.total > 0) {
          const tratamiento = TRATAMIENTO_DOCUMENTO[g.tipoDocumento];
          try {
            const d = calcularDesglose(
              g.total,
              g.tipoDocumento,
              g.iva > 0 ? g.neto : null,
              g.iva > 0 ? g.iva : null,
              tratamiento.afecto === null ? g.iva > 0 : undefined,
            );
            neto = d.neto;
            iva = d.iva;
            advertencias.push(...d.advertencias);
          } catch (e) {
            advertencias.push(e instanceof Error ? e.message : "No se pudo calcular el IVA.");
          }
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

  const quitarGasto = (id: string) => {
    setRendicion((prev) => ({ ...prev, gastos: prev.gastos.filter((g) => g.id !== id) }));
    setArchivos((prev) => prev.filter((a) => a.gastoId !== id));
  };

  // PASO 1 y 2: subir y analizar, de a un comprobante (límite de 60s de Vercel).
  const subirYAnalizar = async (lista: FileList) => {
    setError(null);
    const nuevos = Array.from(lista);
    setAnalizando({ actual: 0, total: nuevos.length });

    const gastosNuevos: GastoRendicion[] = [];
    const archivosNuevos: ArchivoEnMemoria[] = [];
    const fallos: string[] = [];

    for (let i = 0; i < nuevos.length; i++) {
      setAnalizando({ actual: i + 1, total: nuevos.length });

      // Se sube (y después se adjunta a Odoo) la versión reducida, para que el
      // respaldo sea exactamente el archivo que el modelo leyó.
      const archivo = await reducirImagen(nuevos[i]);

      const fd = new FormData();
      fd.append("archivo", archivo);

      try {
        const resp = await fetch("/api/rendidor/analizar", { method: "POST", body: fd });
        const { leido: l } = (await leerRespuesta(resp)) as unknown as { leido: ComprobanteLeidoUI };
        const id = crypto.randomUUID();
        gastosNuevos.push({
          id,
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
          total: l.total ?? 0,
          pendientes: l.ilegibles ?? [],
          archivoNombre: archivo.name,
          archivoPath: "",
          archivoTipo: archivo.type,
          odooExpenseId: null,
          odooPartnerId: null,
        });
        archivosNuevos.push({ gastoId: id, archivo });
      } catch (e) {
        fallos.push(`${archivo.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    setAnalizando(null);
    if (gastosNuevos.length > 0) {
      setRendicion((prev) => ({ ...prev, gastos: [...prev.gastos, ...gastosNuevos] }));
      setArchivos((prev) => [...prev, ...archivosNuevos]);
      setPaso("revisar");
    }
    if (fallos.length > 0) {
      setError(
        `No se pudieron analizar ${fallos.length} archivo(s). Podés agregarlos a mano.\n` + fallos.join("\n"),
      );
    }
  };

  // PASO 4 de la skill: armar el FormData con un respaldo comprimido por gasto.
  // Los archivos viven en memoria del navegador, así que hay que mandarlos: el
  // servidor no los tiene.
  const formularioConRespaldos = async (): Promise<FormData> => {
    const fd = new FormData();
    for (const { gastoId, archivo } of archivos) {
      const comprimido = await comprimirParaExcel(archivo);
      if (comprimido) fd.append(`respaldo_${gastoId}`, comprimido);
    }
    return fd;
  };

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
      const fd = await formularioConRespaldos();
      const resp = await fetch(`/api/rendidor/${rendicion.id}/excel`, { method: "POST", body: fd });

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

      const sinRespaldo = rendicion.gastos.length - archivos.length;
      setAviso(
        sinRespaldo > 0
          ? `Planilla descargada. ${sinRespaldo} gasto(s) quedaron sin imagen embebida: sus archivos no están en esta sesión.`
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
      const resp = await fetch(`/api/rendidor/empleados?nombre=${encodeURIComponent(rendicion.nombreQuienRinde)}`);
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

      // Adjuntar los respaldos de a uno (el body de Vercel no aguanta todos).
      const problemas: string[] = [];
      for (const c of json.creados) {
        const enMemoria = archivos.find((a) => a.gastoId === c.gastoId);
        if (!enMemoria) {
          problemas.push(
            `El gasto ${c.expenseId} quedó sin respaldo: el archivo no está en esta sesión. Subilo a mano en Odoo.`,
          );
          continue;
        }
        const gasto = rendicion.gastos.find((g) => g.id === c.gastoId);
        const fd = new FormData();
        fd.append("archivo", enMemoria.archivo);
        fd.append("expenseId", String(c.expenseId));
        fd.append("totalEsperado", String(gasto?.total ?? 0));

        try {
          const r = await fetch("/api/rendidor/adjuntar", { method: "POST", body: fd });
          const j = (await leerRespuesta(r)) as unknown as { problemas?: string[] };
          if (j.problemas?.length) problemas.push(...j.problemas.map((p) => `Gasto ${c.expenseId}: ${p}`));
        } catch (e) {
          problemas.push(`Gasto ${c.expenseId}: ${e instanceof Error ? e.message : "falló el adjunto."}`);
        }
      }

      // La planilla consolidada se cuelga del PRIMER gasto creado: es un solo
      // documento para toda la rendición, así que duplicarlo en los N gastos
      // sería ruido para quien revisa en Odoo.
      let excelEnOdoo: string | null = null;
      const primero = json.creados[0];
      if (primero) {
        try {
          const fd = await formularioConRespaldos();
          fd.append("expenseId", String(primero.expenseId));
          const r = await fetch(`/api/rendidor/${rendicion.id}/excel`, { method: "POST", body: fd });
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
    <div>
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-2xl font-bold uppercase text-tinta">
        {rendicion.tituloRendicion}
      </h1>
      <p className="mt-1 text-sm text-tinta/60">
        {rendicion.nombreQuienRinde} · Fondo entregado {money(rendicion.montoAsignado)}
        {yaCargada && " · Ya cargada a Odoo"}
      </p>

      {error && (
        <div className="mt-3 whitespace-pre-line rounded-lg border border-red-600/20 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {aviso && (
        <div className="mt-3 rounded-lg border border-teal/20 bg-teal/5 px-3 py-2 text-xs text-teal">{aviso}</div>
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
        <div className="mt-5 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            1 · Subir comprobantes
          </p>
          <p className="mt-1 text-xs text-tinta/55">
            PDF o imagen. Se analizan de a uno y podés corregir todo después. Los archivos quedan en esta
            pestaña: si cerrás la página antes de cargar a Odoo, los datos se guardan pero hay que volver a
            subir los archivos para adjuntarlos.
          </p>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            disabled={analizando !== null}
            onChange={(e) => e.target.files && subirYAnalizar(e.target.files)}
            className="mt-3 block w-full text-xs text-tinta/70 file:mr-3 file:rounded-md file:border file:border-borde file:bg-crema/60 file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wide file:text-tinta"
          />
          {analizando && (
            <p className="mt-2 text-xs font-medium text-naranjo">
              Analizando comprobante {analizando.actual} de {analizando.total}...
            </p>
          )}
        </div>
      )}

      {/* PASO 2 — revisar y corregir */}
      {rendicion.gastos.length > 0 && (
        <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
              2 · Revisar y corregir
            </p>
            {pendientes.length > 0 && (
              <span className="rounded-full bg-naranjo/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                {pendientes.length} por confirmar
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-tinta/55">
            El neto y el IVA se calculan solos desde el total impreso según el tipo de documento. Lo que
            corrijas acá es exactamente lo que se carga a Odoo.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b border-tinta text-left text-[9px] uppercase tracking-wide text-tinta/45">
                  <th className="px-2 py-2">N°</th>
                  <th className="px-2 py-2">Fecha</th>
                  <th className="px-2 py-2">Proveedor</th>
                  <th className="px-2 py-2">RUT</th>
                  <th className="px-2 py-2">N° Doc</th>
                  <th className="px-2 py-2">Tipo documento</th>
                  <th className="px-2 py-2">Detalle</th>
                  <th className="px-2 py-2">Categoría</th>
                  <th className="px-2 py-2 text-right">Neto</th>
                  <th className="px-2 py-2 text-right">IVA</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  {!yaCargada && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {filas.map(({ gasto: g, neto, iva, advertencias }, i) => (
                  <tr key={g.id} className={i % 2 === 0 ? "bg-crema/30" : ""}>
                    <td className="px-2 py-1.5 font-semibold">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="date"
                        value={g.fecha ?? ""}
                        disabled={yaCargada}
                        onChange={(e) => actualizarGasto(g.id, { fecha: e.target.value || null })}
                        className="w-32 rounded border border-borde bg-white px-1.5 py-1 text-xs"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.proveedor}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { proveedor: v })}
                        className="w-40"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.rutProveedor ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { rutProveedor: v || null })}
                        className="w-28"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.numeroDocumento ?? ""}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { numeroDocumento: v || null })}
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1.5">
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
                    </td>
                    <td className="px-2 py-1.5">
                      <TextInput
                        value={g.detalle}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { detalle: v })}
                        className="w-52"
                      />
                    </td>
                    <td className="px-2 py-1.5">
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
                    </td>
                    <td className="px-2 py-1.5 text-right text-tinta/60">{money(neto)}</td>
                    <td className="px-2 py-1.5 text-right text-tinta/60">{money(iva)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <NumInput
                        value={g.total}
                        disabled={yaCargada}
                        onChange={(v) => actualizarGasto(g.id, { total: v })}
                        className="w-24"
                      />
                      {(advertencias.length > 0 || g.pendientes.length > 0) && (
                        <p className="mt-0.5 max-w-[14rem] text-[10px] leading-tight text-naranjo">
                          {[...g.pendientes.map((p) => `Ilegible: ${p}`), ...advertencias].join(" · ")}
                        </p>
                      )}
                    </td>
                    {!yaCargada && (
                      <td className="px-2 py-1.5">
                        <DeleteButton onClick={() => quitarGasto(g.id)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-tinta font-bold">
                  <td className="px-2 py-2" colSpan={8}>
                    TOTALES
                  </td>
                  <td className="px-2 py-2 text-right">{money(totales.neto)}</td>
                  <td className="px-2 py-2 text-right">{money(totales.iva)}</td>
                  <td className="px-2 py-2 text-right">{money(totales.total)}</td>
                  {!yaCargada && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-crema/60 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">Fondo entregado</p>
              <p className="font-condensed text-sm font-bold">{money(rendicion.montoAsignado)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">Total rendido</p>
              <p className="font-condensed text-sm font-bold">{money(totales.total)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-tinta/45">
                {totales.saldo >= 0 ? `A reembolsar a ${rendicion.nombreQuienRinde}` : "A reintegrar a la empresa"}
              </p>
              <p className={`font-condensed text-sm font-bold ${totales.saldo >= 0 ? "text-teal" : "text-naranjo"}`}>
                {money(Math.abs(totales.saldo))}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!yaCargada && (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="rounded-md border border-borde bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-40"
              >
                {guardando ? "Guardando..." : "Guardar borrador"}
              </button>
            )}
            <button
              type="button"
              onClick={descargarExcel}
              disabled={generandoExcel || rendicion.gastos.length === 0}
              className="rounded-md border border-borde bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 disabled:opacity-40"
            >
              {generandoExcel ? "Generando planilla..." : "Descargar Excel"}
            </button>
            {!yaCargada && (
              <button
                type="button"
                onClick={resolverProveedores}
                disabled={resolviendo || rendicion.gastos.length === 0}
                className="rounded-md bg-tinta px-4 py-2 text-xs font-semibold uppercase tracking-wide text-crema transition hover:bg-tinta/85 disabled:opacity-40"
              >
                {resolviendo ? "Buscando proveedores..." : "Continuar a Odoo →"}
              </button>
            )}
          </div>
          {rendicion.gastos.length > archivos.length && (
            <p className="mt-2 text-xs text-tinta/50">
              La planilla embebe las imágenes de los comprobantes que estén en esta sesión (
              {archivos.length} de {rendicion.gastos.length}). Los que falten quedan con un aviso en la
              hoja Respaldos.
            </p>
          )}
        </div>
      )}

      {/* PASO 3 — confirmar y cargar */}
      {paso === "cargar" && !yaCargada && (
        <div className="mt-4 rounded-2xl border border-borde bg-white p-5 shadow-sm">
          <p className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
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
                  className="rounded-md border border-borde bg-white px-3 py-1.5 text-xs font-medium text-tinta hover:border-naranjo/50 disabled:opacity-40"
                >
                  {buscandoEmpleado ? "Buscando..." : `Buscar "${rendicion.nombreQuienRinde}"`}
                </button>
                {empleados.length > 0 && (
                  <select
                    value={employeeId ?? ""}
                    onChange={(e) => setEmployeeId(Number(e.target.value) || null)}
                    className="rounded border border-borde bg-white px-2 py-1.5 text-xs"
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
                      className="mt-1 w-full rounded border border-borde bg-white px-2 py-1 text-xs"
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
            className="mt-4 rounded-md bg-teal px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal/85 disabled:opacity-40"
          >
            {guardando
              ? "Cargando a Odoo..."
              : `Confirmar y crear ${rendicion.gastos.length} gasto(s) en Odoo`}
          </button>
        </div>
      )}
    </div>
  );
}
