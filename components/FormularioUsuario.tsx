import type { Aplicacion, UsuarioConAcceso } from "@/lib/tipos";
import { SLUG_POR_OMISION, type Empresa } from "@/lib/empresas-modelo";
import { SUBPANELES_FINANZAS } from "@/lib/finanzas-subpaneles";
import { agruparCatalogo } from "@/lib/menu-modelo";
import { estaPausada } from "@/lib/apps-pausadas";
import { CAMPO } from "@/lib/estilos";
import BotonEnviar from "@/components/BotonEnviar";
import SelectorDeAcceso, { type GrupoDeSelector, type RolInterno } from "@/components/admin/SelectorDeAcceso";
import { ROLES_RENDIDOR } from "@/lib/permisos-rendidor";
import { ROLES_INVENTARIO } from "@/lib/permisos-inventario";

const ETIQUETA = "block text-xs font-semibold text-tinta/80";
const AYUDA = "mt-1 text-xs leading-snug text-tinta/60";

/**
 * Los roles internos de las aplicaciones que manejan permisos más finos que usuario/administrador.
 * Los valores son los que se guardan en usuario_aplicaciones.rol_extra y NO se pueden cambiar sin
 * migrar lo guardado: solo las etiquetas son libres.
 */
const ROLES_INTERNOS: Record<string, RolInterno> = {
  proyectos: {
    titulo: "Rol en Proyectos",
    porOmision: "visualizador",
    ayuda: "Solo aplica si la aplicación está marcada.",
    opciones: [
      { valor: "visualizador", etiqueta: "Visualizador" },
      { valor: "usuario", etiqueta: "Usuario" },
      { valor: "admin", etiqueta: "Administrador" },
    ],
  },
  contratos: {
    titulo: "Rol en Contratos",
    porOmision: "usuario",
    ayuda: "Normal: agrega datos y sube archivos. Especial: además edita y configura. Administrador: todo.",
    opciones: [
      { valor: "usuario", etiqueta: "Usuario normal" },
      { valor: "especial", etiqueta: "Usuario especial" },
      { valor: "admin", etiqueta: "Administrador" },
    ],
  },
  "rendir-gastos": {
    titulo: "Rol en Rendir Gastos",
    porOmision: "usuario",
    ayuda: "Usuario: ve y rinde lo suyo. Administrador de gastos: ve las rendiciones de todos, para revisarlas antes de cargarlas a Odoo.",
    opciones: ROLES_RENDIDOR.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta.replace(/^Rendir Gastos: /, "") })),
  },
  inventario: {
    titulo: "Rol en Inventario",
    porOmision: "usuario",
    ayuda: "Usuario: opera el inventario (productos, operaciones, ajustes). Administrador de inventario: además archiva y restaura productos.",
    opciones: ROLES_INVENTARIO.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta.replace(/^Inventario: /, "") })),
  },
  "gestion-financiera": {
    titulo: "Rol en Gestión financiera",
    porOmision: "usuario",
    ayuda: "Usuario: registra y opera el día a día. Administrador de finanzas: además aprueba y visa compras, anula documentos, cierra y contabiliza períodos y cambia la configuración.",
    opciones: [
      { valor: "usuario", etiqueta: "Usuario" },
      { valor: "admin", etiqueta: "Administrador de finanzas" },
    ],
  },
  cotizador: {
    titulo: "Rol en el Cotizador",
    porOmision: "visualizador",
    ayuda: "Visualizador: mira. Usuario: crea y edita las suyas. Administrador: todas.",
    opciones: [
      { valor: "visualizador", etiqueta: "Visualizador" },
      { valor: "usuario", etiqueta: "Usuario" },
      { valor: "admin", etiqueta: "Administrador" },
    ],
  },
};

/**
 * El formulario de una persona, en bloques en el orden en que se piensa: quién es, qué rol tiene y
 * a qué aplicaciones entra (agrupadas por módulo, como en el menú), y en qué empresas se puede
 * parar. Cada campo explica para qué sirve y cada etiqueta está atada a su campo.
 */
export default function FormularioUsuario({
  accion,
  todasLasApps,
  todasLasEmpresas = [],
  empresasAsignadas = [],
  valoresPorDefecto,
  subpanelesFinanzasAsignados,
  textoBoton,
  correoBloqueado,
  cancelar,
}: {
  accion: (form: FormData) => void;
  todasLasApps: Aplicacion[];
  /** Las empresas del grupo, para marcar en cuáles puede pararse la persona. */
  todasLasEmpresas?: Empresa[];
  empresasAsignadas?: string[];
  valoresPorDefecto?: Partial<UsuarioConAcceso>;
  // "facturas-ih" deniega por defecto sin fila explicita (ver
  // lib/finanzas-subpaneles-usuario.ts)
  subpanelesFinanzasAsignados?: string[];
  textoBoton: string;
  correoBloqueado?: boolean;
  /** En la pantalla de edición: a dónde vuelve «Cancelar». */
  cancelar?: React.ReactNode;
}) {
  const grupos: GrupoDeSelector[] = agruparCatalogo(todasLasApps).map((g) => ({
    slug: g.slug,
    titulo: g.titulo,
    apps: g.apps.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      slug: a.slug,
      descripcion: a.descripcion,
      icono: a.icono,
      pausada: estaPausada(a.slug),
    })),
  }));
  const empresaPorOmision = todasLasEmpresas.find((e) => e.slug === SLUG_POR_OMISION)?.nombre ?? "la empresa principal";

  return (
    <form action={accion} className="space-y-7">
      <fieldset className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">Quién es</legend>
        <div className="sm:col-span-2">
          <span className={ETIQUETA}>Tipo de acceso</span>
          {valoresPorDefecto?.tipo === "invitado" && <input type="hidden" name="tipoPrevio" value="invitado" />}
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3 has-[:checked]:border-naranjo has-[:checked]:bg-naranjo/[0.05]">
              <input type="radio" name="tipo" value="interno" defaultChecked={valoresPorDefecto?.tipo !== "invitado"} className="mt-1 accent-[var(--color-naranjo)]" />
              <span className="text-sm">
                <b className="text-tinta">Interno de PERTEC</b>
                <span className="block text-xs text-tinta/60">Entra con su cuenta Microsoft @pertec.cl.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3 has-[:checked]:border-naranjo has-[:checked]:bg-naranjo/[0.05]">
              <input type="radio" name="tipo" value="invitado" defaultChecked={valoresPorDefecto?.tipo === "invitado"} className="mt-1 accent-[var(--color-naranjo)]" />
              <span className="text-sm">
                <b className="text-tinta">Invitado externo</b>
                <span className="block text-xs text-tinta/60">Cualquier correo. Entra con un código que le llega por mail y solo ve los módulos que le marques. Nunca es administrador.</span>
              </span>
            </label>
          </div>
        </div>
        <div>
          <label htmlFor="usuario-correo" className={ETIQUETA}>
            Correo
          </label>
          <input
            id="usuario-correo"
            name="correo"
            type="email"
            required
            disabled={correoBloqueado}
            defaultValue={valoresPorDefecto?.correo}
            placeholder="nombre.apellido@pertec.cl o el correo del invitado"
            autoComplete="off"
            className={`mt-1 ${CAMPO} disabled:bg-crema disabled:text-tinta/50`}
          />
          <p className={AYUDA}>
            {correoBloqueado ? "El correo no se puede cambiar: es con el que la persona inicia sesión." : "Con este correo inicia sesión."}
          </p>
        </div>

        <div>
          <label htmlFor="usuario-nombre" className={ETIQUETA}>
            Nombre
          </label>
          <input
            id="usuario-nombre"
            name="nombre"
            defaultValue={valoresPorDefecto?.nombre ?? ""}
            placeholder="Nombre completo"
            autoComplete="off"
            className={`mt-1 ${CAMPO}`}
          />
          <p className={AYUDA}>Es el que se ve en las listas y en los avisos.</p>
        </div>

        {valoresPorDefecto?.id && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-borde bg-superficie p-3.5 transition hover:border-naranjo/40 has-[:checked]:border-teal/50 sm:col-span-2">
            <input
              type="checkbox"
              name="activo"
              defaultChecked={valoresPorDefecto?.activo ?? true}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-borde accent-[var(--color-naranjo)]"
            />
            <span>
              <span className="block text-sm font-semibold text-tinta">Cuenta activa</span>
              <span className="block text-xs leading-snug text-tinta/60">
                Desmárcala para quitarle el acceso sin borrar a la persona ni lo que tenía asignado.
              </span>
            </span>
          </label>
        )}
      </fieldset>

      <div className="border-t border-borde pt-6">
        <SelectorDeAcceso
          grupos={grupos}
          rolInicial={valoresPorDefecto?.rol ?? "usuario"}
          asignadas={valoresPorDefecto?.aplicacionIds ?? []}
          rolesExtra={valoresPorDefecto?.rolesExtra ?? {}}
          rolesInternos={ROLES_INTERNOS}
          subpaneles={SUBPANELES_FINANZAS.map((sp) => ({ slug: sp.slug, nombre: sp.nombre }))}
          subpanelesAsignados={subpanelesFinanzasAsignados ?? []}
        />
      </div>

      {todasLasEmpresas.length > 1 && (
        <fieldset className="border-t border-borde pt-6">
          <legend className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">Empresas</legend>
          <p className="mb-3 text-xs leading-snug text-tinta/60">
            En cuáles se puede parar desde el selector del menú. Sin marcar ninguna ve {empresaPorOmision}. Los
            administradores del Core entran a todas.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todasLasEmpresas.map((e) => (
              <label
                key={e.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-borde bg-superficie px-3.5 py-2 text-sm text-tinta transition hover:border-naranjo/40 has-[:checked]:border-naranjo has-[:checked]:bg-naranjo/[0.06]"
              >
                <input
                  type="checkbox"
                  name="empresas"
                  value={e.id}
                  defaultChecked={empresasAsignadas.includes(e.id)}
                  className="h-4 w-4 shrink-0 rounded border-borde accent-[var(--color-naranjo)]"
                />
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} aria-hidden />
                <span className="truncate font-medium">{e.nombre}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-5">
        <BotonEnviar
          cargando="Guardando..."
          className="min-h-11 rounded-lg bg-naranjo px-5 py-2.5 font-condensed text-sm font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
        >
          {textoBoton}
        </BotonEnviar>
        {cancelar}
      </div>
    </form>
  );
}
