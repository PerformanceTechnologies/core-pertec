import "server-only";
import { puedeVerApp } from "../autorizacion";
import { contextoDeEmpresa } from "../empresas";
import { hoyEnSantiago } from "../graph-calendario";
import type { UsuarioConAcceso } from "../tipos";
import { EMPRESAS_CON_FINANZAS_SLUGS, RUTA_COMPRAS, RUTA_FIN, RUTA_VENTAS, SLUG_APP_FIN, cargarVistaDe } from "./datos";
import { asignacionesDeEmpresa } from "./flujos";
import type { RolFlujo } from "./flujos-modelo";

export interface PendienteFin {
  clave: string;
  texto: string;
  cantidad: number;
  href: string;
}

export interface PendientesFinEmpresa {
  empresa: string;
  empresaSlug: string;
  esActiva: boolean;
  items: PendienteFin[];
}

/**
 * Lo que esta persona tiene pendiente en los flujos de Finanzas donde está asignada (recibir, pagar, facturar,
 * cobrar, conciliar el banco), en CADA empresa que usa Finanzas. «Le toca» es lo mismo que en Compras: estar asignada
 * a ese paso en «Permisos de flujos» o, si el paso no tiene a nadie, ser administradora del Core. Las aprobaciones y
 * visados de compras ya tienen su propia sección en Mi Día. Solo devuelve las empresas que tienen algo.
 */
export async function pendientesDeFinanzas(usuario: UsuarioConAcceso): Promise<PendientesFinEmpresa[]> {
  try {
    if (!(await puedeVerApp(usuario, SLUG_APP_FIN))) return [];
    const { activa, permitidas } = await contextoDeEmpresa(usuario.id, usuario.rol);
    const hoy = hoyEnSantiago().iso;

    const porEmpresa = await Promise.all(
      permitidas
        .filter((e) => EMPRESAS_CON_FINANZAS_SLUGS.includes(e.slug))
        .map(async (empresa): Promise<PendientesFinEmpresa | null> => {
          const mapa = await asignacionesDeEmpresa(empresa.id);
          const lesToca = (rol: RolFlujo) => {
            const asignados = mapa.get(rol) ?? [];
            return asignados.length > 0 ? asignados.includes(usuario.id) : usuario.rol === "admin";
          };
          const roles: RolFlujo[] = ["compras_aprobador", "compras_visador", "compras_recepcion", "compras_pagador", "ventas_facturador", "ventas_cobrador", "tesoreria_conciliador"];
          if (!roles.some(lesToca)) return null;

          const v = await cargarVistaDe({ usuario, empresa, hoy });
          const compras = (pasos: string[]) => v.compras.filter((c) => pasos.includes(c.paso)).length;
          const hitos = (etapa: string) => v.hitos.filter((h) => !h.anulado && h.etapa === etapa).length;
          const items: PendienteFin[] = [];
          const sumar = (rol: RolFlujo, clave: string, texto: string, cantidad: number, href: string) => {
            if (cantidad > 0 && lesToca(rol)) items.push({ clave, texto, cantidad, href });
          };
          sumar("compras_aprobador", "regularizar", "Facturas sin OC por regularizar", compras(["Factura sin OC: regularizar"]), RUTA_COMPRAS);
          sumar("compras_visador", "enviar-oc", "OC por enviar al proveedor", compras(["Enviar OC al proveedor"]), RUTA_COMPRAS);
          sumar("compras_recepcion", "respuesta-oc", "OC esperando respuesta del proveedor", compras(["Esperar respuesta del proveedor"]), RUTA_COMPRAS);
          sumar("compras_recepcion", "recepcion", "Compras por recibir conforme", compras(["Esperar recepción conforme"]), RUTA_COMPRAS);
          sumar("compras_recepcion", "diferencia", "Facturas con diferencia contra la OC", compras(["Revisar diferencia con la OC"]), RUTA_COMPRAS);
          sumar("compras_pagador", "pagos", "Facturas por programar o pagar", compras(["Programar pago", "Vencida: programar pago ya"]), RUTA_COMPRAS);
          sumar("ventas_facturador", "facturar", "Hitos listos para facturar", hitos("Lista para facturar"), RUTA_VENTAS);
          sumar("ventas_cobrador", "cobranza", "Facturas vencidas por cobrar", hitos("Vencida"), RUTA_VENTAS);
          sumar("tesoreria_conciliador", "banco", "Movimientos del banco por aclarar", v.movimientos.filter((m) => m.estado === "Por aclarar").length, `${RUTA_FIN}/tesoreria`);
          return items.length ? { empresa: empresa.nombre, empresaSlug: empresa.slug, esActiva: empresa.id === activa?.id, items } : null;
        }),
    );
    return porEmpresa.filter((p): p is PendientesFinEmpresa => Boolean(p));
  } catch (e) {
    console.error("[finanzas] No se pudieron leer los pendientes de los flujos:", e instanceof Error ? e.message : e);
    return [];
  }
}
