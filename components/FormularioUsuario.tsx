import type { Aplicacion, UsuarioConAcceso } from "@/lib/tipos";
import { MODULOS_PANEL_ODOO } from "@/lib/panel-odoo/modulos-usuario";

const ETIQUETAS_MODULO_ODOO: Record<string, string> = {
  facturas: "Facturas",
  contabilidad: "Contabilidad",
  crm: "CRM",
  gastos: "Gastos",
};

export default function FormularioUsuario({
  accion,
  todasLasApps,
  valoresPorDefecto,
  modulosOdooAsignados,
  textoBoton,
  correoBloqueado,
}: {
  accion: (form: FormData) => void;
  todasLasApps: Aplicacion[];
  valoresPorDefecto?: Partial<UsuarioConAcceso>;
  // undefined = sin restricción, ve todos los módulos (ver
  // lib/panel-odoo/modulos-usuario.ts: sin filas guardadas = acceso total)
  modulosOdooAsignados?: string[];
  textoBoton: string;
  correoBloqueado?: boolean;
}) {
  const appsAsignadas = new Set(valoresPorDefecto?.aplicacionIds ?? []);
  const rolesExtra = valoresPorDefecto?.rolesExtra ?? {};

  return (
    <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-tinta/70">Correo @pertec.cl</label>
        <input
          name="correo"
          type="email"
          required
          disabled={correoBloqueado}
          defaultValue={valoresPorDefecto?.correo}
          placeholder="nombre.apellido@pertec.cl"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none disabled:bg-crema disabled:text-tinta/50 focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Nombre</label>
        <input
          name="nombre"
          defaultValue={valoresPorDefecto?.nombre ?? ""}
          placeholder="Nombre completo"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Rol</label>
        <select
          name="rol"
          defaultValue={valoresPorDefecto?.rol ?? "usuario"}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="usuario">Usuario</option>
          <option value="admin">Administrador general</option>
        </select>
      </div>

      {valoresPorDefecto?.id && (
        <label className="mt-6 flex items-center gap-2 text-sm text-tinta/70">
          <input
            type="checkbox"
            name="activo"
            defaultChecked={valoresPorDefecto?.activo ?? true}
            className="h-4 w-4 rounded border-borde"
          />
          Cuenta activa
        </label>
      )}

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-tinta/70">
          Aplicaciones asignadas (el administrador siempre ve todas, esto solo aplica al rol
          Usuario)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-borde p-3 sm:grid-cols-3">
          {todasLasApps.length === 0 && (
            <p className="col-span-full text-xs text-tinta/50">
              Todavía no hay aplicaciones registradas en el catálogo.
            </p>
          )}
          {todasLasApps.map((app) => (
            <div key={app.id} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm text-tinta/80">
                <input
                  type="checkbox"
                  name="aplicaciones"
                  value={app.id}
                  defaultChecked={appsAsignadas.has(app.id)}
                  className="h-4 w-4 rounded border-borde"
                />
                {app.nombre}
              </label>
              {app.slug === "proyectos" && (
                <select
                  name={`rol_extra_${app.id}`}
                  defaultValue={rolesExtra[app.id] ?? "visualizador"}
                  className="ml-6 rounded-md border border-borde bg-white px-2 py-1 text-xs outline-none focus:border-naranjo/50"
                  title="Rol interno dentro de Proyectos (solo aplica si la app está asignada arriba)"
                >
                  <option value="visualizador">Proyectos: Visualizador</option>
                  <option value="usuario">Proyectos: Usuario</option>
                  <option value="admin">Proyectos: Admin</option>
                </select>
              )}
              {app.slug === "cotizador" && (
                <select
                  name={`rol_extra_${app.id}`}
                  defaultValue={rolesExtra[app.id] ?? "visualizador"}
                  className="ml-6 rounded-md border border-borde bg-white px-2 py-1 text-xs outline-none focus:border-naranjo/50"
                  title="Rol interno dentro del Cotizador (solo aplica si la app está asignada arriba)"
                >
                  <option value="visualizador">Cotizador: Visualizador</option>
                  <option value="usuario">Cotizador: Usuario</option>
                  <option value="admin">Cotizador: Admin</option>
                </select>
              )}
              {app.slug === "panel-odoo" && (
                <>
                  <select
                    name={`rol_extra_${app.id}`}
                    defaultValue={rolesExtra[app.id] ?? "visualizador"}
                    className="ml-6 rounded-md border border-borde bg-white px-2 py-1 text-xs outline-none focus:border-naranjo/50"
                    title="Rol interno dentro de Panel Odoo (solo aplica si la app está asignada arriba)"
                  >
                    <option value="visualizador">Panel Odoo: Visualizador</option>
                    <option value="usuario">Panel Odoo: Usuario</option>
                    <option value="admin">Panel Odoo: Admin</option>
                  </select>
                  <div className="ml-6 flex flex-col gap-1">
                    <span className="text-[11px] text-tinta/50">
                      Módulos visibles (sin marcar ninguno = ve todos)
                    </span>
                    {MODULOS_PANEL_ODOO.map((modulo) => (
                      <label key={modulo} className="flex items-center gap-2 text-xs text-tinta/70">
                        <input
                          type="checkbox"
                          name="modulos_panel_odoo"
                          value={modulo}
                          defaultChecked={modulosOdooAsignados?.includes(modulo) ?? false}
                          className="h-3.5 w-3.5 rounded border-borde"
                        />
                        {ETIQUETAS_MODULO_ODOO[modulo]}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-lg bg-naranjo px-5 py-2.5 font-condensed text-sm font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
        >
          {textoBoton}
        </button>
      </div>
    </form>
  );
}
