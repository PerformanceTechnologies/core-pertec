import "server-only";
import { after } from "next/server";
import { supabaseAdmin } from "../supabase-admin";
import { crearNotificacion } from "../buzon";
import { enviarCorreoAUsuario } from "../notificaciones";
import { listarUsuarios } from "../usuarios";
import { SLUG_APP_FIN, type ContextoFin } from "./datos";
import { asignacionesDeEmpresa } from "./flujos";
import type { RolFlujo } from "./flujos-modelo";
import { lineasDeCompra, tasaIvaDe } from "./oc-datos";
import { armarCorreoAvisoCompra, asuntoDeAvisoCompra, cuerpoDeAviso, enlaceDeCompra, tituloDeAviso, type DatosAvisoCompra, type TipoAvisoCompra } from "./oc-avisos-correo";
import { esMoneda, formatoMonto, totalesOc } from "./oc-modelo";

// -----------------------------------------------------------------------------
//  Avisos de una solicitud de compra: a la campana de notificaciones y por correo.
//
//  Para quien APRUEBA o VISA: las personas asignadas a ese paso en «Permisos de flujos» y, si el paso no tiene a nadie,
//  los administradores del Core. Para el solicitante (devuelta, visada): quien pidió y quien creó. Nunca le llega a quien
//  hizo el cambio. Un aviso que falla NUNCA tumba la acción: la solicitud ya quedó guardada, y acá solo se registra el error.
// -----------------------------------------------------------------------------

const ROLES_POR_TIPO: Partial<Record<TipoAvisoCompra, RolFlujo>> = { aprobar: "compras_aprobador", visar: "compras_visador" };

/** Correos de las personas activas asignadas al rol; sin nadie asignado, los administradores del Core. */
export async function destinatariosDeRol(empresaId: string, rol: RolFlujo): Promise<string[]> {
  const [usuarios, mapa] = await Promise.all([listarUsuarios(), asignacionesDeEmpresa(empresaId)]);
  const activos = usuarios.filter((u) => u.activo);
  const asignados = new Set(mapa.get(rol) ?? []);
  const elegidos = asignados.size > 0 ? activos.filter((u) => asignados.has(u.id)) : activos.filter((u) => u.rol === "admin");
  return [...new Set(elegidos.map((u) => u.correo.toLowerCase()))];
}

/**
 * Avisa de una solicitud de compra con formato de OC. No lanza nunca. Los correos salen DESPUÉS de responder (`after`),
 * para que guardar no espere a Microsoft.
 */
export async function avisarCompra(ctx: ContextoFin, tipo: TipoAvisoCompra, compraId: string, extra: { motivo?: string | null } = {}): Promise<void> {
  try {
    const { data: c, error } = await supabaseAdmin.from("fin_compras").select("*").eq("id", compraId).eq("empresa_id", ctx.empresa.id).maybeSingle();
    if (error || !c || !c.formato_oc) return;
    const yo = ctx.usuario.correo.toLowerCase();

    const rol = ROLES_POR_TIPO[tipo];
    const crudos = rol ? await destinatariosDeRol(ctx.empresa.id, rol) : [c.solicitante, c.creado_por].filter(Boolean).map((x: string) => x.toLowerCase());
    const para = [...new Set(crudos)].filter((x) => x && x !== yo);
    if (para.length === 0) return;

    const [lineas, tasaIva, prov, proy] = await Promise.all([
      lineasDeCompra(compraId),
      tasaIvaDe(ctx.empresa.id),
      c.proveedor_id ? supabaseAdmin.from("finanzas_contactos").select("razon_social").eq("id", c.proveedor_id).maybeSingle() : Promise.resolve({ data: null }),
      c.proyecto_id ? supabaseAdmin.from("fin_proyectos").select("nombre").eq("id", c.proyecto_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const moneda = esMoneda(c.moneda) ? c.moneda : "CLP";
    const datos: DatosAvisoCompra = {
      tipo, id: compraId, codigo: c.codigo, titulo: c.descripcion, proveedor: (prov.data as { razon_social?: string } | null)?.razon_social ?? null,
      proyecto: (proy.data as { nombre?: string } | null)?.nombre ?? null, solicitante: c.solicitante_nombre?.trim() || (c.solicitante ? String(c.solicitante).split("@")[0] : "—"),
      total: formatoMonto(totalesOc(lineas, tasaIva, moneda).total, moneda), empresa: ctx.empresa.nombre, actor: ctx.usuario.nombre?.trim() || ctx.usuario.correo.split("@")[0],
      motivo: extra.motivo ?? null, ocNumero: c.oc_numero ?? null,
    };

    // Campana: una por persona. La clave lleva la hora para que un reenvío posterior vuelva a avisar.
    const marca = Date.now();
    await Promise.all(
      para.map((destinatario) =>
        crearNotificacion({
          modulo: SLUG_APP_FIN, tipo: `compra_${tipo}`, titulo: tituloDeAviso(datos), cuerpo: cuerpoDeAviso(datos), enlace: enlaceDeCompra(compraId),
          severidad: tipo === "devuelta" ? "alerta" : "info", clave: `compra:${compraId}:${tipo}:${destinatario}:${marca}`, destinatario,
        }).catch(() => false),
      ),
    );
    after(async () => {
      const html = armarCorreoAvisoCompra(datos);
      const asunto = asuntoDeAvisoCompra(datos);
      await Promise.all(
        para.map((destinatario) =>
          enviarCorreoAUsuario(destinatario, asunto, html).catch((e) => console.error(`[compras] No se pudo mandar el aviso «${tipo}» a ${destinatario}:`, e instanceof Error ? e.message : e)),
        ),
      );
    });
  } catch (e) {
    console.error(`[compras] No se pudo avisar («${tipo}»):`, e instanceof Error ? e.message : e);
  }
}
