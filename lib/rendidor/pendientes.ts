import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { puedeVerApp } from "@/lib/autorizacion";
import { contextoDeEmpresa } from "@/lib/empresas";
import type { UsuarioConAcceso } from "@/lib/tipos";
import { resolverRolRendidor } from "./permisos";
import { idsFondosArchivados, rolesDe } from "./fondos";
import { filtrarPorEmpresaRG } from "./empresa";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";

export interface PendienteRG {
  clave: string;
  texto: string;
  cantidad: number;
  /** Si viene, va en la insignia en lugar de la cantidad (por ejemplo «vencido»). */
  etiqueta?: string;
  href: string;
}

export interface PendientesRG {
  empresa: string;
  empresaSlug: string;
  esActiva: boolean;
  items: PendienteRG[];
}


/**
 * Lo que esta persona tiene pendiente en Rendir Gastos, en CADA empresa donde tiene acceso (no solo la activa):
 * solicitudes por validar, fondos por asignar o reponer, transferencias, reembolsos y devoluciones de Tesorería,
 * informes por revisar y los suyos que le observaron. Solo devuelve las empresas que tienen algo. Para Mi Día.
 */
export async function pendientesRendirGastos(usuario: UsuarioConAcceso): Promise<PendientesRG[]> {
  try {
    if (!(await puedeVerApp(usuario, "rendir-gastos"))) return [];
    const { activa, permitidas } = await contextoDeEmpresa(usuario.id, usuario.rol);
    const esAdminModulo = (await resolverRolRendidor(usuario)) === "admin";
    const yo = usuario.correo.toLowerCase();

    // Los fondos archivados (y sus informes) no cuentan: se leen las filas y se descartan en JS, así sirve aunque
    // todavía no esté el SQL de archivar.
    const fondos = (empresaId: string, estado: string, archivados: Set<string>) =>
      supabaseAdmin.from("rg_fondos").select("id").eq("empresa_id", empresaId).eq("estado", estado).neq("rendidor_correo", yo)
        .then((r) => ({ count: (r.data ?? []).filter((f) => !archivados.has(f.id as string)).length }));
    // Los informes antiguos (sin empresa) son de PERTEC.
    const informes = (empresaId: string, porOmision: boolean) =>
      filtrarPorEmpresaRG(supabaseAdmin.from("rendiciones").select("id, fondo_id").eq("tipo", "informe"), { id: empresaId, porOmision });
    // Un conteo de informes: se descartan los de fondos archivados.
    const contar = (q: PromiseLike<{ data: { fondo_id: string | null }[] | null }>, archivados: Set<string>) =>
      Promise.resolve(q).then((r) => ({ count: (r.data ?? []).filter((i) => !i.fondo_id || !archivados.has(i.fondo_id)).length }));

    const porEmpresa = await Promise.all(
      permitidas.map(async (e): Promise<PendientesRG | null> => {
        const roles = await rolesDe(usuario, esAdminModulo, e.id);
        const archivados = await idsFondosArchivados(e.id);
        const tiene = (r: string) => (roles as string[]).includes(r);
        const consultas: { clave: string; texto: string; href: string; q: PromiseLike<{ count: number | null }> }[] = [];
        if (tiene("validador")) consultas.push({ clave: "validar", texto: "Solicitudes de fondo por validar", href: "/rendir-gastos?ver=validar", q: fondos(e.id, "en_validacion", archivados) });
        if (tiene("asignador")) {
          consultas.push({ clave: "asignar", texto: "Fondos validados por asignar", href: "/rendir-gastos?ver=asignar", q: fondos(e.id, "validado", archivados) });
          consultas.push({ clave: "reponer", texto: "Fondos fijos por reponer", href: "/rendir-gastos?ver=asignar", q: fondos(e.id, "cerrado_con_saldo", archivados) });
        }
        if (tiene("tesoreria")) {
          consultas.push({ clave: "transferir", texto: "Fondos por transferir", href: "/rendir-gastos?ver=tesoreria", q: fondos(e.id, "por_transferir", archivados) });
          consultas.push({ clave: "devoluciones", texto: "Devoluciones por confirmar", href: "/rendir-gastos?ver=tesoreria", q: fondos(e.id, "devolucion_pendiente", archivados) });
          consultas.push({ clave: "reembolsos", texto: "Reembolsos por pagar", href: "/rendir-gastos?ver=tesoreria", q: contar(informes(e.id, e.slug === SLUG_POR_OMISION).eq("estado", "reembolso_pendiente").neq("rinde_correo", yo), archivados) });
        }
        if (tiene("revisor")) consultas.push({ clave: "revisar", texto: "Informes por revisar", href: "/rendir-gastos?ver=revisar", q: contar(informes(e.id, e.slug === SLUG_POR_OMISION).not("fondo_id", "is", null).eq("estado", "enviada").neq("rinde_correo", yo), archivados) });
        // Lo propio: informes que le observaron y tiene que corregir.
        consultas.push({ clave: "observados", texto: "Tus informes observados, por corregir", href: "/rendir-gastos?ver=informes", q: contar(informes(e.id, e.slug === SLUG_POR_OMISION).eq("estado", "rechazada").eq("rinde_correo", yo), archivados) });

        const resultados = await Promise.all(consultas.map((c) => Promise.resolve(c.q).then((r) => r.count ?? 0, () => 0)));
        const items = consultas.map((c, i) => ({ clave: c.clave, texto: c.texto, href: c.href, cantidad: resultados[i] })).filter((i) => i.cantidad > 0);
        return items.length ? { empresa: e.nombre, empresaSlug: e.slug, esActiva: e.id === activa?.id, items } : null;
      }),
    );
    return porEmpresa.filter((p): p is PendientesRG => Boolean(p));
  } catch (e) {
    console.error("[rendir-gastos] No se pudieron leer los pendientes:", e instanceof Error ? e.message : e);
    return [];
  }
}
