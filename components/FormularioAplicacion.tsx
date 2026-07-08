import { ICONOS_DISPONIBLES } from "@/lib/iconos";
import { ESTADOS } from "@/lib/colores";
import type { Aplicacion } from "@/lib/tipos";

export default function FormularioAplicacion({
  accion,
  valoresPorDefecto,
  textoBoton,
}: {
  accion: (form: FormData) => void;
  valoresPorDefecto?: Partial<Aplicacion>;
  textoBoton: string;
}) {
  return (
    <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-tinta/70">Nombre</label>
        <input
          name="nombre"
          required
          defaultValue={valoresPorDefecto?.nombre}
          placeholder="Licitaciones"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-tinta/70">URL</label>
        <input
          name="url"
          required
          defaultValue={valoresPorDefecto?.url}
          placeholder="licitaciones.pertec.cl"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-tinta/70">Descripción corta</label>
        <input
          name="descripcion"
          defaultValue={valoresPorDefecto?.descripcion ?? ""}
          placeholder="Seguimiento diario"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Ícono</label>
        <select
          name="icono"
          defaultValue={valoresPorDefecto?.icono ?? "apps"}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        >
          {ICONOS_DISPONIBLES.map((icono) => (
            <option key={icono.clave} value={icono.clave}>
              {icono.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Color</label>
        <select
          name="color"
          defaultValue={valoresPorDefecto?.color ?? "naranjo"}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="naranjo">Naranjo</option>
          <option value="teal">Teal</option>
          <option value="gris">Gris</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Estado</label>
        <select
          name="estado"
          defaultValue={valoresPorDefecto?.estado ?? "activa"}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        >
          {ESTADOS.map((estado) => (
            <option key={estado.valor} value={estado.valor}>
              {estado.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Orden</label>
        <input
          type="number"
          name="orden"
          defaultValue={valoresPorDefecto?.orden ?? 0}
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
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
