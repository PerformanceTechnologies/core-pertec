import { ICONOS_DISPONIBLES } from "@/lib/iconos";
import { ESTADOS } from "@/lib/colores";
import { CAMPO } from "@/lib/estilos";
import type { Aplicacion } from "@/lib/tipos";
import BotonEnviar from "@/components/BotonEnviar";

const ETIQUETA = "block text-xs font-semibold text-tinta/80";
const AYUDA = "mt-1 text-xs leading-snug text-tinta/60";

/**
 * El formulario de una aplicación del catálogo, en tres bloques que siguen el orden en que se
 * piensa: qué es, a dónde lleva y cómo se publica. Cada campo explica para qué sirve debajo, y
 * cada etiqueta está atada a su campo (sin eso, un lector de pantalla lee «cuadro de edición»).
 */
export default function FormularioAplicacion({
  accion,
  valoresPorDefecto,
  textoBoton,
  cancelar,
}: {
  accion: (form: FormData) => void;
  valoresPorDefecto?: Partial<Aplicacion>;
  textoBoton: string;
  /** En la pantalla de edición: a dónde vuelve «Cancelar». */
  cancelar?: React.ReactNode;
}) {
  return (
    <form action={accion} className="space-y-7">
      <fieldset className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">Qué es</legend>
        <div className="sm:col-span-2">
          <label htmlFor="app-nombre" className={ETIQUETA}>
            Nombre
          </label>
          <input
            id="app-nombre"
            name="nombre"
            required
            defaultValue={valoresPorDefecto?.nombre}
            placeholder="Licitaciones"
            className={`mt-1 ${CAMPO}`}
          />
          <p className={AYUDA}>Como se ve en el menú, en el buscador y en la página de su módulo.</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="app-descripcion" className={ETIQUETA}>
            Descripción corta
          </label>
          <input
            id="app-descripcion"
            name="descripcion"
            defaultValue={valoresPorDefecto?.descripcion ?? ""}
            placeholder="Seguimiento diario de licitaciones"
            className={`mt-1 ${CAMPO}`}
          />
          <p className={AYUDA}>Una línea que diga para qué sirve: aparece en la cartilla de su módulo.</p>
        </div>

        <div>
          <label htmlFor="app-icono" className={ETIQUETA}>
            Ícono
          </label>
          <select id="app-icono" name="icono" defaultValue={valoresPorDefecto?.icono ?? "apps"} className={`mt-1 ${CAMPO}`}>
            {ICONOS_DISPONIBLES.map((icono) => (
              <option key={icono.clave} value={icono.clave}>
                {icono.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="app-color" className={ETIQUETA}>
            Color
          </label>
          <select id="app-color" name="color" defaultValue={valoresPorDefecto?.color ?? "naranjo"} className={`mt-1 ${CAMPO}`}>
            <option value="naranjo">Naranjo</option>
            <option value="teal">Teal</option>
            <option value="gris">Gris</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-x-5 gap-y-4 border-t border-borde pt-6 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">A dónde lleva</legend>
        <div>
          <label htmlFor="app-tipo" className={ETIQUETA}>
            Tipo
          </label>
          <select id="app-tipo" name="tipo" defaultValue={valoresPorDefecto?.tipo ?? "externa"} className={`mt-1 ${CAMPO}`}>
            <option value="externa">Externa (otro sitio o dominio)</option>
            <option value="interna">Interna (una página del propio Core)</option>
          </select>
        </div>

        <div>
          <label htmlFor="app-url" className={ETIQUETA}>
            URL
          </label>
          <input
            id="app-url"
            name="url"
            required
            defaultValue={valoresPorDefecto?.url}
            placeholder="licitaciones.pertec.cl o /reclutamiento"
            className={`mt-1 font-mono ${CAMPO}`}
          />
        </div>
        <p className={`${AYUDA} sm:col-span-2`}>
          Interna: la ruta dentro del Core, que empieza con «/» (por ejemplo, /reclutamiento). Externa: el dominio del otro sitio.
        </p>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-x-5 gap-y-4 border-t border-borde pt-6 sm:grid-cols-2">
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">Cómo se publica</legend>
        <div>
          <label htmlFor="app-estado" className={ETIQUETA}>
            Estado
          </label>
          <select id="app-estado" name="estado" defaultValue={valoresPorDefecto?.estado ?? "activa"} className={`mt-1 ${CAMPO}`}>
            {ESTADOS.map((estado) => (
              <option key={estado.valor} value={estado.valor}>
                {estado.etiqueta}
              </option>
            ))}
          </select>
          <p className={AYUDA}>«Mantención» la deja a la vista pero sin poder abrirse.</p>
        </div>

        <div>
          <label htmlFor="app-orden" className={ETIQUETA}>
            Orden
          </label>
          <input
            id="app-orden"
            type="number"
            name="orden"
            defaultValue={valoresPorDefecto?.orden ?? 0}
            className={`mt-1 ${CAMPO}`}
          />
          <p className={AYUDA}>
            Fija su lugar en «Otras» y en el buscador. Dentro de un módulo manda el orden del menú.
          </p>
        </div>
      </fieldset>

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
