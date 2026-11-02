// Los iconos de los MÓDULOS del menú (Finanzas, CRM…), no los de cada aplicación: esos vienen de
// la tabla `aplicaciones` y de lib/iconos.tsx. Sin "use client": son componentes sin estado, los
// usan la barra lateral (cliente) y la página de cada módulo (servidor).

import {
  IconApps,
  IconBuildingWarehouse,
  IconContract,
  IconHeartHandshake,
  IconHome2,
  IconLayoutKanban,
  IconReportMoney,
  IconShieldCog,
  IconWorld,
  type Icon,
} from "@tabler/icons-react";

const ICONOS_DE_MODULO: Record<string, Icon> = {
  finanzas: IconReportMoney,
  crm: IconHeartHandshake,
  tareas: IconLayoutKanban,
  contratos: IconContract,
  inventario: IconBuildingWarehouse,
  "pagina-web": IconWorld,
  otras: IconApps,
  administracion: IconShieldCog,
};

/** El icono de un módulo por su slug (ver GrupoDelMenu.slug). Uno desconocido cae en el genérico. */
export function iconoDeModulo(slug: string): Icon {
  return ICONOS_DE_MODULO[slug] ?? IconApps;
}

/** El icono de «Inicio», la portada del Core. */
export const IconoInicio: Icon = IconHome2;
