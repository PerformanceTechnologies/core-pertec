export type Rol = "admin" | "usuario";

export type EstadoApp = "activa" | "en_desarrollo" | "mantenimiento";

export type ColorApp = "naranjo" | "teal" | "gris";

export type TipoApp = "interna" | "externa";

export interface Usuario {
  id: string;
  correo: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  creado_en: string;
}

export interface Aplicacion {
  id: string;
  nombre: string;
  slug: string;
  url: string;
  tipo: TipoApp;
  icono: string;
  color: ColorApp;
  descripcion: string | null;
  estado: EstadoApp;
  orden: number;
}

export interface UsuarioConAcceso extends Usuario {
  aplicacionIds: string[];
  // Rol interno opcional por app (aplicacion_id -> rol), para apps que
  // manejan sus propios permisos mas finos que admin/usuario (ej: Proyectos).
  rolesExtra: Record<string, string>;
}
