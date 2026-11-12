import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { normalizarRut } from "../contratos/rut";
import type { EstadoRendicion, GastoRendicion } from "./tipos";
import { estadoDeGasto, type Repetido } from "./mis-gastos-modelo";
import { filtrarPorEmpresaRG, type EmpresaRG } from "./empresa";
import { idsFondosArchivados } from "./fondos";

const plano = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

interface Entrada {
  rid: string;
  titulo: string;
  esBolsa: boolean;
  quien: string;
  estadoInforme: EstadoRendicion;
  g: GastoRendicion;
}

/** Proveedor + folio + monto: el mismo documento. El RUT, si lo hay, afina (pero no es obligatorio). */
function claveFuerte(g: GastoRendicion): string | null {
  const folio = plano(g.numeroDocumento);
  const total = Math.round(Number(g.total) || 0);
  const prov = g.rutProveedor ? normalizarRut(g.rutProveedor) : plano(g.proveedor);
  if (!folio || !prov || total <= 0) return null;
  return `${prov}|${folio}|${total}`;
}

/** Proveedor + fecha + monto: puede ser el mismo gasto sin folio anotado. */
function claveDebil(g: GastoRendicion): string | null {
  const total = Math.round(Number(g.total) || 0);
  const prov = plano(g.proveedor);
  if (!prov || !g.fecha || total <= 0) return null;
  return `${prov}|${g.fecha}|${total}`;
}

/**
 * Para cada gasto de las rendiciones dadas, los otros gastos que parecen el mismo, en cualquier
 * estado (suelto en «Mis gastos», en un informe en revisión, o ya cerrado) y de cualquier persona, de la misma empresa.
 * Una boleta rechazada por quien revisó no cuenta como el original.
 */
export async function repetidosDe(rendicionIds: string[], empresa: EmpresaRG): Promise<Record<string, Repetido[]>> {
  if (!rendicionIds.length) return {};
  // Solo se compara dentro de la misma empresa: un gasto de otra empresa no es un repetido.
  const { data, error } = await filtrarPorEmpresaRG(
    supabaseAdmin.from("rendiciones").select("id, tipo, titulo_rendicion, estado, nombre_quien_rinde, gastos, fondo_id").neq("estado", "anulada"),
    empresa,
  ).limit(3000);
  if (error) return {};

  const entradas: Entrada[] = [];
  // Los gastos de un fondo archivado (pruebas, fondos que ya no se usan) no cuentan como el original.
  const archivados = await idsFondosArchivados(empresa.id);
  for (const r of data ?? []) {
    if (r.fondo_id && archivados.has(r.fondo_id as string) && !rendicionIds.includes(r.id as string)) continue;
    for (const g of (r.gastos ?? []) as GastoRendicion[]) {
      if (g.revision?.estado === "rechazada") continue;
      entradas.push({ rid: r.id as string, titulo: r.titulo_rendicion as string, esBolsa: r.tipo === "bolsa", quien: r.nombre_quien_rinde as string, estadoInforme: r.estado as EstadoRendicion, g });
    }
  }
  const porFuerte = new Map<string, Entrada[]>();
  const porDebil = new Map<string, Entrada[]>();
  for (const e of entradas) {
    const f = claveFuerte(e.g);
    const d = claveDebil(e.g);
    if (f) porFuerte.set(f, [...(porFuerte.get(f) ?? []), e]);
    if (d) porDebil.set(d, [...(porDebil.get(d) ?? []), e]);
  }

  const aRepetido = (e: Entrada, fuerte: boolean): Repetido => ({
    enRendicionId: e.rid,
    enTitulo: e.titulo,
    esBolsa: e.esBolsa,
    quien: e.quien,
    estado: estadoDeGasto(e.g, e.esBolsa ? null : e.estadoInforme),
    proveedor: e.g.proveedor,
    fecha: e.g.fecha,
    total: Number(e.g.total) || 0,
    numeroDocumento: e.g.numeroDocumento,
    fuerte,
  });

  const salida: Record<string, Repetido[]> = {};
  const objetivo = new Set(rendicionIds);
  for (const e of entradas) {
    if (!objetivo.has(e.rid)) continue;
    const f = claveFuerte(e.g);
    const d = claveDebil(e.g);
    const fuertes = f ? (porFuerte.get(f) ?? []).filter((x) => x.g.id !== e.g.id) : [];
    const vistos = new Set(fuertes.map((x) => x.g.id));
    const debiles = d ? (porDebil.get(d) ?? []).filter((x) => x.g.id !== e.g.id && !vistos.has(x.g.id)) : [];
    const lista = [...fuertes.map((x) => aRepetido(x, true)), ...debiles.map((x) => aRepetido(x, false))].slice(0, 3);
    salida[e.g.id] = lista;
  }
  return salida;
}
