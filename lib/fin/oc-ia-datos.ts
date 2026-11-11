// Leer la cotización de un proveedor con IA: lo que el modelo devuelve y cómo se vuelve datos del formulario.
// Sin "server-only": es solo datos y reglas, y así se prueba con tsx sin llamar al modelo.
//
// El reparto es el mismo que en Rendir Gastos: el modelo TRANSCRIBE lo impreso y el servidor CALCULA y VERIFICA.
// Si el documento solo trae precios con IVA incluido, el modelo lo declara y el servidor los pasa a neto; si la suma
// de los ítems no calza con el total impreso, se avisa en vez de «arreglarlo».

import { MONEDAS, formatoMonto, redondear, totalesOc, type LineaOc, type Moneda } from "./oc-modelo";

/** Lo que el modelo devuelve (ver ESQUEMA_COTIZACION en oc-ia.ts). */
export interface LecturaCotizacion {
  numeroCotizacion: string | null;
  fecha: string | null;
  titulo: string | null;
  proveedor: { razonSocial: string | null; rut: string | null; atencion: string | null; correo: string | null; telefono: string | null; direccion: string | null };
  moneda: Moneda | null;
  /** true si los precios impresos YA incluyen IVA (el documento no desglosa el neto). */
  preciosIncluyenIva: boolean;
  lineas: { descripcion: string; cantidad: number | null; unidad: string | null; precioUnitario: number | null; descuentoPct: number | null; exento: boolean }[];
  totalDeclarado: number | null;
  plazoEntrega: string | null;
  formaPago: string | null;
  condicionPagoDias: number | null;
  lugarEntrega: string | null;
  observaciones: string | null;
  ilegibles: string[];
}

/** Lo que se carga en el formulario. */
export interface DatosLeidos {
  titulo: string;
  atencion: string | null;
  correo: string | null;
  moneda: Moneda;
  lineas: LineaOc[];
  plazoEntrega: string | null;
  formaPago: string | null;
  condicionPagoDias: number | null;
  lugarEntrega: string | null;
  observaciones: string | null;
  /** Lo que la persona debe revisar antes de enviar. */
  avisos: string[];
}

const texto = (v: string | null | undefined, max: number): string | null => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
};
const numero = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** RUT sin puntos ni guion y en mayúscula, para comparar («76.123.456-7» = «761234567»). */
export function rutPlano(rut: string | null | undefined): string {
  return String(rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/** Qué contacto es el proveedor del documento: por RUT (exacto) y, si no, por nombre idéntico sin tildes ni mayúsculas. */
export function buscarProveedor<T extends { id: string; nombre: string; rut: string | null }>(contactos: T[], rut: string | null, razonSocial: string | null): T | null {
  const r = rutPlano(rut);
  if (r.length >= 7) {
    const porRut = contactos.find((c) => rutPlano(c.rut) === r);
    if (porRut) return porRut;
  }
  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nombre = razonSocial ? plano(razonSocial) : "";
  if (nombre.length < 4) return null;
  const iguales = contactos.filter((c) => plano(c.nombre) === nombre);
  return iguales.length === 1 ? iguales[0] : null;
}

export function normalizarLectura(l: LecturaCotizacion, tasaIva: number): DatosLeidos {
  const moneda: Moneda = l.moneda && (MONEDAS as readonly string[]).includes(l.moneda) ? l.moneda : "CLP";
  const avisos: string[] = [];

  const lineas: LineaOc[] = (l.lineas ?? [])
    .map((x): LineaOc | null => {
      const descripcion = texto(x.descripcion, 500);
      if (!descripcion) return null;
      const cantidad = numero(x.cantidad);
      const precio = numero(x.precioUnitario);
      // Con IVA incluido en lo impreso, el neto lo calcula el servidor (no el modelo). Lo exento no lleva IVA que sacar.
      const neto = precio === null ? 0 : l.preciosIncluyenIva && !x.exento ? Math.round((precio / (1 + tasaIva)) * 100) / 100 : precio;
      return {
        productoId: null, descripcion, cantidad: cantidad !== null && cantidad > 0 ? cantidad : 1, unidad: texto(x.unidad, 20) ?? "un", precioUnitario: Math.max(0, neto),
        descuentoPct: Math.max(0, Math.min(100, numero(x.descuentoPct) ?? 0)) / 100, exento: Boolean(x.exento), nota: null,
      };
    })
    .filter((x): x is LineaOc => x !== null)
    .slice(0, 200);

  if (lineas.length === 0) avisos.push("La IA no encontró ítems en el documento: agrégalos a mano.");
  if (l.preciosIncluyenIva) avisos.push(`Los precios del documento incluyen IVA: se pasaron a neto (÷ ${(1 + tasaIva).toLocaleString("es-CL", { maximumFractionDigits: 2 })}). Revísalos.`);
  if (l.lineas.some((x) => numero(x.precioUnitario) === null && texto(x.descripcion, 50))) avisos.push("Algún ítem no traía precio legible: quedó en cero.");

  // Verificación: la suma de los ítems tiene que dar el total impreso (con IVA, salvo que el documento no lo desglose).
  const declarado = numero(l.totalDeclarado);
  if (declarado !== null && lineas.length > 0) {
    const t = totalesOc(lineas, tasaIva, moneda);
    const candidatos = [t.total, redondear(moneda, t.neto + t.exento)];
    const margen = moneda === "CLP" ? Math.max(2, declarado * 0.002) : Math.max(0.05, declarado * 0.002);
    if (!candidatos.some((c) => Math.abs(c - declarado) <= margen)) {
      avisos.push(`La suma de los ítems (${formatoMonto(t.total, moneda)} con IVA) no coincide con el total del documento (${formatoMonto(declarado, moneda)}). Revisa cantidades y precios.`);
    }
  }
  for (const i of (l.ilegibles ?? []).slice(0, 6)) {
    const t = texto(i, 120);
    if (t) avisos.push(`No se pudo leer con certeza: ${t}.`);
  }

  const dias = numero(l.condicionPagoDias);
  return {
    titulo: texto(l.titulo, 300) ?? lineas[0]?.descripcion.slice(0, 120) ?? "",
    atencion: texto(l.proveedor?.atencion, 120), correo: texto(l.proveedor?.correo, 160), moneda, lineas,
    plazoEntrega: texto(l.plazoEntrega, 120), formaPago: texto(l.formaPago, 200), condicionPagoDias: dias !== null && dias >= 0 && dias <= 365 ? Math.round(dias) : null,
    lugarEntrega: texto(l.lugarEntrega, 300), observaciones: texto(l.observaciones, 1500), avisos,
  };
}
