import type { DatosNuevaCotizacion } from "@/lib/cotizador";

export default function FormularioCotizacion({
  accion,
  valoresPorDefecto,
  textoBoton,
}: {
  accion: (form: FormData) => void;
  valoresPorDefecto?: Partial<DatosNuevaCotizacion>;
  textoBoton: string;
}) {
  return (
    <form action={accion} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-tinta/70">Nombre del proyecto</label>
        <input
          name="nombre"
          required
          defaultValue={valoresPorDefecto?.nombre}
          placeholder="Servicio SPOT Vulcanización CV-01"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Cliente</label>
        <input
          name="cliente"
          defaultValue={valoresPorDefecto?.cliente ?? ""}
          placeholder="Antofagasta Minerals — AMSA"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Faena / locación</label>
        <input
          name="faena"
          defaultValue={valoresPorDefecto?.faena ?? ""}
          placeholder="Minera Antucoya"
          className="mt-1 w-full rounded-lg border border-borde px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-tinta/70">Tipo de servicio</label>
        <select
          name="tipoServicio"
          defaultValue={valoresPorDefecto?.tipoServicio ?? "spot"}
          className="mt-1 w-full rounded-lg border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-naranjo/50"
        >
          <option value="spot">SPOT</option>
          <option value="contrato_permanente">Contrato permanente</option>
        </select>
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          className="rounded-lg bg-naranjo px-4 py-2 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
        >
          {textoBoton}
        </button>
      </div>
    </form>
  );
}
