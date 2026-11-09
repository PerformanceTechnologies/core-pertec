import { CAMPO } from "@/lib/estilos";

// Piezas de los formularios de Flota: sección numerada, campo con etiqueta y monto en pesos.

export function Seccion({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="flex items-center gap-2.5 text-sm font-bold text-tinta">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-naranjo text-[11px] font-bold text-white">{n}</span>
        {titulo}
        <span className="h-px flex-1 bg-borde" />
      </h3>
      {children}
    </section>
  );
}

export function Campo({ etiqueta, obligatorio, ayuda, children }: { etiqueta: string; obligatorio?: boolean; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-1.5 text-xs font-semibold text-gris">
        {etiqueta} {obligatorio && <span className="text-rose-500">*</span>}
        {ayuda && <span className="font-normal text-gris-suave">· {ayuda}</span>}
      </span>
      {children}
    </label>
  );
}

export function Pesos({ name, valor }: { name: string; valor?: number }) {
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gris">$</span>
      <input name={name} type="number" min="0" step="1" defaultValue={valor ?? ""} placeholder="0" className={`${CAMPO} pl-7`} />
    </span>
  );
}

/** Un acceso rápido del tablero, igual a los del Inventario. Abre la ventana de su formulario. */
export function TarjetaAccion({
  titulo,
  detalle,
  Icono,
  tono,
  onClick,
}: {
  titulo: string;
  detalle: string;
  Icono: React.ComponentType<{ size?: number; stroke?: number }>;
  tono: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 text-left shadow-[0_1px_2px_rgba(23,20,17,0.04),0_10px_28px_-14px_rgba(23,20,17,0.12)] transition hover:-translate-y-0.5 hover:border-naranjo/40"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tono}`}>
        <Icono size={20} stroke={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-tinta">{titulo}</span>
        <span className="line-clamp-2 block text-[11px] leading-snug text-gris">{detalle}</span>
      </span>
    </button>
  );
}
