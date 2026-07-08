import {
  IconApps,
  IconFileInvoice,
  IconMusic,
  IconCash,
  IconChartBar,
  IconBuilding,
  IconTruck,
  IconClipboardList,
  IconShieldCheck,
  IconUsers,
  IconSettings,
  IconFolder,
  IconCalendar,
  IconMail,
  IconBriefcase,
  IconTool,
  IconGauge,
  IconMapPin,
  IconPackage,
  IconClipboardCheck,
  IconAlertTriangle,
  IconDatabase,
  IconCloud,
  type Icon,
} from "@tabler/icons-react";

export const ICONOS_DISPONIBLES: { clave: string; etiqueta: string; Componente: Icon }[] = [
  { clave: "apps", etiqueta: "General", Componente: IconApps },
  { clave: "file-invoice", etiqueta: "Facturación / licitaciones", Componente: IconFileInvoice },
  { clave: "cash", etiqueta: "Finanzas", Componente: IconCash },
  { clave: "chart-bar", etiqueta: "Reportes / métricas", Componente: IconChartBar },
  { clave: "building", etiqueta: "Empresa / faena", Componente: IconBuilding },
  { clave: "truck", etiqueta: "Logística / arriendos", Componente: IconTruck },
  { clave: "clipboard-list", etiqueta: "Gestión / tareas", Componente: IconClipboardList },
  { clave: "clipboard-check", etiqueta: "Cumplimiento", Componente: IconClipboardCheck },
  { clave: "shield-check", etiqueta: "Seguridad", Componente: IconShieldCheck },
  { clave: "users", etiqueta: "Recursos humanos", Componente: IconUsers },
  { clave: "briefcase", etiqueta: "Reclutamiento", Componente: IconBriefcase },
  { clave: "settings", etiqueta: "Configuración / TI", Componente: IconSettings },
  { clave: "folder", etiqueta: "Documentos", Componente: IconFolder },
  { clave: "calendar", etiqueta: "Calendario", Componente: IconCalendar },
  { clave: "mail", etiqueta: "Correo / notificaciones", Componente: IconMail },
  { clave: "tool", etiqueta: "Mantención / herramientas", Componente: IconTool },
  { clave: "gauge", etiqueta: "Rendimiento", Componente: IconGauge },
  { clave: "map-pin", etiqueta: "Terreno / ubicación", Componente: IconMapPin },
  { clave: "package", etiqueta: "Inventario", Componente: IconPackage },
  { clave: "alert-triangle", etiqueta: "Alertas", Componente: IconAlertTriangle },
  { clave: "database", etiqueta: "Datos", Componente: IconDatabase },
  { clave: "cloud", etiqueta: "Cloud / infraestructura", Componente: IconCloud },
  { clave: "music", etiqueta: "Eventos", Componente: IconMusic },
];

const MAPA_ICONOS = new Map(ICONOS_DISPONIBLES.map((i) => [i.clave, i.Componente]));

export function obtenerIcono(clave: string): Icon {
  return MAPA_ICONOS.get(clave) ?? IconApps;
}
