/**
 * Los tipos de usuario que usa Contratos.
 *
 * Contratos viene de core-ih, donde el rol tiene tres niveles. En core-pertec el rol del core es
 * admin/usuario, y el resto se resuelve con el rol POR APLICACIÓN que ya existe (rol_extra en
 * usuario_aplicaciones): ver lib/contratos/usuarios.ts.
 */

/** admin = Administrador · especial = Usuario Especial · usuario = Usuario Normal (ver permisos.ts). */
export type Rol = "admin" | "especial" | "usuario";

export type EstadoApp = "activa" | "en_desarrollo" | "mantenimiento";

export type TipoApp = "interna" | "externa";

export interface Usuario {
  id: string;
  correo: string;
  nombre: string | null;
  rol: Rol;
  activo: boolean;
  creado_en: string;
  ultimo_ingreso: string | null;
  /** core-pertec no guarda el ingreso anterior: queda en null y el panel no lo muestra. */
  ingreso_anterior: string | null;
}

/** Un submódulo de Contratos. En core-ih eran aplicaciones del catálogo; acá son fijos (ver aplicaciones.ts). */
export interface Aplicacion {
  id: string;
  nombre: string;
  slug: string;
  url: string;
  tipo: TipoApp;
  icono: string;
  descripcion: string | null;
  estado: EstadoApp;
  orden: number;
}

export interface UsuarioConAcceso extends Usuario {
  /** Los submódulos que ve: todos si tiene la app Contratos, ninguno si no. */
  aplicacionIds: string[];
  rolesExtra: Record<string, string>;
}
