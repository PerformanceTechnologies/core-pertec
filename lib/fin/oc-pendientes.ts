import "server-only";
import { supabaseAdmin } from "../supabase-admin";
import { puedeVerApp } from "../autorizacion";
import type { UsuarioConAcceso } from "../tipos";
import { SLUG_APP_FIN, contextoFinDeUsuario } from "./datos";
import { asignacionesDeEmpresa } from "./flujos";
import { lineasDeCompras, tasaIvaDe } from "./oc-datos";
import { esMoneda, formatoMonto, totalesOc } from "./oc-modelo";
import type { PendientesDeCompras, ResumenCompra, TarjetaAprobacion } from "./oc-resumen";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PASOS = { aprobar: "Falta aprobación JP o gerente", visar: "Falta visado de Finanzas", devuelta: "Devuelta: corregir y reenviar" } as const;
const LIMITE = 50;

/**
 * Lo que esta persona tiene pendiente en Compras y pagos, para Mi Día: solicitudes por aprobar o por visar (si le toca) y
 * las suyas que le devolvieron. «Le toca» es lo mismo que decide a quién llega el aviso: estar asignada a ese paso en
 * «Permisos de flujos» o, si el paso no tiene a nadie, ser administradora del Core. Null si no aplica (sin la app, o la
 * empresa activa no usa Finanzas) o si algo falla: Mi Día sigue sin esta sección.
 */
export async function pendientesDeCompras(usuario: UsuarioConAcceso): Promise<PendientesDeCompras | null> {
  try {
    if (!(await puedeVerApp(usuario, SLUG_APP_FIN))) return null;
    const ctx = await contextoFinDeUsuario(usuario);
    if (!ctx) return null;
    const mapa = await asignacionesDeEmpresa(ctx.empresa.id);
    const lesToca = (rol: "compras_aprobador" | "compras_visador") => {
      const asignados = mapa.get(rol) ?? [];
      return asignados.length > 0 ? asignados.includes(usuario.id) : usuario.rol === "admin";
    };
    const puedeAprobar = lesToca("compras_aprobador");
    const puedeVisar = lesToca("compras_visador");
    const yo = usuario.correo.toLowerCase();

    const base = () => supabaseAdmin.from("fin_compras").select("*").eq("empresa_id", ctx.empresa.id).eq("formato_oc", true).is("estado_override", null).limit(LIMITE);
    const vacio = Promise.resolve({ data: [] as any[], error: null });
    const [aprobar, visar, devueltas] = await Promise.all([
      puedeAprobar ? base().not("enviada_aprobacion_en", "is", null).is("aprobado_por", null).order("enviada_aprobacion_en", { ascending: true }) : vacio,
      puedeVisar ? base().not("aprobado_por", "is", null).is("fecha_visado", null).order("enviada_aprobacion_en", { ascending: true }) : vacio,
      base().is("enviada_aprobacion_en", null).not("devuelta_motivo", "is", null).or(`creado_por.eq.${yo.replace(/[,()]/g, "")},solicitante.eq.${yo.replace(/[,()]/g, "")}`).order("devuelta_en", { ascending: false }),
    ]);
    const filas = [...(aprobar.data ?? []), ...(visar.data ?? []), ...(devueltas.data ?? [])] as any[];
    if (filas.length === 0) return { empresa: ctx.empresa.nombre, porAprobar: [], porVisar: [], devueltas: [], puedeAprobar, puedeVisar };

    const ids = [...new Set(filas.map((f) => f.id as string))];
    const provIds = [...new Set(filas.map((f) => f.proveedor_id).filter(Boolean))] as string[];
    const proyIds = [...new Set(filas.map((f) => f.proyecto_id).filter(Boolean))] as string[];
    const [lineas, tasaIva, provs, proys] = await Promise.all([
      lineasDeCompras(ids),
      tasaIvaDe(ctx.empresa.id),
      provIds.length ? supabaseAdmin.from("finanzas_contactos").select("id, razon_social, rut").in("id", provIds) : Promise.resolve({ data: [] as any[] }),
      proyIds.length ? supabaseAdmin.from("fin_proyectos").select("id, nombre").in("id", proyIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const proveedor = new Map((provs.data ?? []).map((p: any) => [p.id, { nombre: p.razon_social as string, rut: (p.rut as string | null) ?? null }]));
    const proyecto = new Map((proys.data ?? []).map((p: any) => [p.id, p.nombre as string]));

    const tarjeta = (f: any, paso: string): TarjetaAprobacion => {
      const moneda = esMoneda(f.moneda) ? f.moneda : "CLP";
      const items = lineas.get(f.id) ?? [];
      const prov = f.proveedor_id ? proveedor.get(f.proveedor_id) ?? null : null;
      const solicitante = f.solicitante_nombre?.trim() || (f.solicitante ? String(f.solicitante).split("@")[0] : "—");
      const resumen: ResumenCompra = {
        id: f.id, codigo: f.codigo, titulo: f.descripcion, paso, anulada: false, ocNumero: f.oc_numero ?? null, proyecto: f.proyecto_id ? proyecto.get(f.proyecto_id) ?? null : null,
        solicitante, proveedor: prov, atencion: f.atencion ?? null, proveedorCorreo: f.proveedor_correo ?? null, moneda, tipoCambio: Number(f.tipo_cambio) || 1, tasaIva, lineas: items,
        fechaRequerida: f.fecha_requerida ?? null, entregaLugar: f.entrega_lugar ?? null, entregaPlazo: f.entrega_plazo ?? null, formaPago: f.forma_pago ?? null,
        condicionPagoDias: f.condicion_pago_dias === null || f.condicion_pago_dias === undefined ? null : Number(f.condicion_pago_dias), observaciones: f.observaciones_oc ?? null,
        enviadaPor: f.enviada_aprobacion_por ?? null, enviadaEn: f.enviada_aprobacion_en ?? null, aprobadoPor: f.aprobado_por ?? null, fechaAprobacion: f.fecha_aprobacion ?? null,
        visadoPor: f.visado_por ?? null, fechaVisado: f.fecha_visado ?? null,
        devuelta: f.devuelta_motivo ? { motivo: f.devuelta_motivo, por: f.devuelta_por ?? null, en: f.devuelta_en ?? null } : null, motivoAnulacion: null,
      };
      return {
        id: f.id, codigo: f.codigo, titulo: f.descripcion, paso, ocNumero: f.oc_numero ?? null, proveedor: prov?.nombre ?? null, solicitante,
        total: formatoMonto(totalesOc(items, tasaIva, moneda).total, moneda), desde: f.enviada_aprobacion_en ?? f.devuelta_en ?? null, resumen,
      };
    };

    return {
      empresa: ctx.empresa.nombre,
      porAprobar: (aprobar.data ?? []).map((f: any) => tarjeta(f, PASOS.aprobar)),
      porVisar: (visar.data ?? []).map((f: any) => tarjeta(f, PASOS.visar)),
      devueltas: (devueltas.data ?? []).map((f: any) => tarjeta(f, PASOS.devuelta)),
      puedeAprobar,
      puedeVisar,
    };
  } catch (e) {
    console.error("[compras] No se pudieron leer las aprobaciones pendientes:", e instanceof Error ? e.message : e);
    return null;
  }
}
