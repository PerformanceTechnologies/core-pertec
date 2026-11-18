import type { Aplicacion, UsuarioConAcceso } from "@/lib/tipos";
import { SLUG_POR_OMISION, type Empresa } from "@/lib/empresas-modelo";
import { SUBPANELES_FINANZAS } from "@/lib/finanzas-subpaneles";
import { agruparCatalogo } from "@/lib/menu-modelo";
import { estaPausada } from "@/lib/apps-pausadas";
import { IconUser } from "@tabler/icons-react";
import BotonEnviar from "@/components/BotonEnviar";
import SelectorDeAcceso, { type GrupoDeSelector, type RolInterno } from "@/components/admin/SelectorDeAcceso";
import { Interruptor, Segmentado } from "@/components/admin/PartesFormulario";
import { Tarjeta } from "@/components/admin/VisualUsuarios";
import { BOTON_C, CAMPO_C, HOJA } from "@/components/contactos/Visual";
import { ROLES_RENDIDOR } from "@/lib/permisos-rendidor";
import { ROLES_INVENTARIO } from "@/lib/permisos-inventario";

const ETIQUETA = "block text-xs font-semibold text-gris";

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
 * El formulario de una persona, en bloques en el orden en que se piensa: quién es, qué rol tiene,
 * a qué aplicaciones entra y en qué empresas se puede parar. Cada bloque dice para qué sirve en una
 * línea; lo demás, solo cuando hace falta (los permisos internos aparecen al marcar la app).
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
  /** A dónde vuelve «Cancelar». */
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
  const esInvitado = valoresPorDefecto?.tipo === "invitado";

  const persona = (
    <Tarjeta Icono={IconUser} titulo="Persona" ayuda={correoBloqueado ? "El correo no se cambia: es con el que inicia sesión." : "Con este correo inicia sesión."}>
      <div className="space-y-4">
        <div>
          <label htmlFor="usuario-nombre" className={ETIQUETA}>Nombre</label>
          <input id="usuario-nombre" name="nombre" defaultValue={valoresPorDefecto?.nombre ?? ""} placeholder="Nombre y apellido" autoComplete="off" className={`mt-1 ${CAMPO_C}`} />
        </div>
        <div>
          <label htmlFor="usuario-correo" className={ETIQUETA}>Correo</label>
          <input
            id="usuario-correo"
            name="correo"
            type="email"
            required
            disabled={correoBloqueado}
            defaultValue={valoresPorDefecto?.correo}
            placeholder="nombre.apellido@pertec.cl"
            autoComplete="off"
            className={`mt-1 ${CAMPO_C} disabled:cursor-not-allowed disabled:text-gris`}
          />
        </div>
        <div>
          <span className={ETIQUETA}>Tipo</span>
          {esInvitado && <input type="hidden" name="tipoPrevio" value="invitado" />}
          <div className="mt-1">
            <Segmentado
              nombre="tipo"
              inicial={esInvitado ? "invitado" : "interno"}
              opciones={[
                { valor: "interno", etiqueta: "De PERTEC" },
                { valor: "invitado", etiqueta: "Invitado externo" },
              ]}
            />
          </div>
          <p className="mt-1.5 text-xs leading-snug text-gris">Invitado: cualquier correo. Entra con un código que le llega por mail y nunca es administrador.</p>
        </div>
        {valoresPorDefecto?.id && (
          <Interruptor
            nombre="activo"
            inicial={valoresPorDefecto.activo ?? true}
            etiqueta="Puede entrar al Core"
            ayuda="Apágalo para quitarle el acceso sin borrar a la persona ni lo que tenía asignado."
          />
        )}
      </div>
    </Tarjeta>
  );

  return (
    <form action={accion}>
      <SelectorDeAcceso
        persona={persona}
        grupos={grupos}
        rolInicial={valoresPorDefecto?.rol ?? "usuario"}
        asignadas={valoresPorDefecto?.aplicacionIds ?? []}
        rolesExtra={valoresPorDefecto?.rolesExtra ?? {}}
        rolesInternos={ROLES_INTERNOS}
        subpaneles={SUBPANELES_FINANZAS.map((sp) => ({ slug: sp.slug, nombre: sp.nombre }))}
        subpanelesAsignados={subpanelesFinanzasAsignados ?? []}
        empresas={todasLasEmpresas.map((e) => ({ id: e.id, slug: e.slug, logo: e.logo, nombre: e.nombre, color: e.color }))}
        empresasAsignadas={empresasAsignadas}
        nombrePorOmision={empresaPorOmision}
      />

      {/* Flotando abajo: en una ficha larga, guardar no obliga a bajar hasta el final. En celular va
          sobre la barra de navegación de abajo (h-16, ver NavInferior) y deja aire a la derecha para
          el botón flotante de «Volver arriba» (BotonSubir). */}
      <div className={`${HOJA} sticky bottom-[4.5rem] z-10 mt-5 flex items-center justify-end gap-2 bg-superficie/95 py-2.5 pl-4 pr-[4.25rem] backdrop-blur lg:bottom-4 lg:pr-2.5`}>
        {cancelar}
        <BotonEnviar cargando="Guardando…" className={BOTON_C}>
          {textoBoton}
        </BotonEnviar>
      </div>
    </form>
  );
}
