import type { InfoProyecto } from "@/lib/fin/info-proyecto";

/** El código del proyecto en una pastilla; al pasar el mouse (o enfocarlo) muestra todos sus datos. */
export default function CodigoProyecto({ info, className = "" }: { info: InfoProyecto; className?: string }) {
  return (
    <span tabIndex={0} className={`group/cod relative inline-block outline-none ${className}`}>
      <span className="inline-block cursor-help whitespace-nowrap rounded-lg border border-borde/70 bg-tinta/[0.03] px-2 py-1 font-mono text-[11px] font-bold tracking-wide text-tinta transition group-hover/cod:border-naranjo/50 group-focus/cod:border-naranjo/50">
        {info.codigo}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-72 translate-y-1 rounded-xl border border-borde/70 bg-superficie p-3 text-left opacity-0 shadow-[0_12px_32px_-8px_rgba(23,20,17,0.3)] transition group-hover/cod:visible group-hover/cod:translate-y-0 group-hover/cod:opacity-100 group-focus/cod:visible group-focus/cod:translate-y-0 group-focus/cod:opacity-100"
      >
        <span className="mb-2 block font-mono text-xs font-bold tracking-wide text-naranjo">{info.codigo}</span>
        <span className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] normal-case tracking-normal">
          {info.datos.map((d) => (
            <span key={d.etiqueta} className="contents">
              <span className="font-medium text-gris">{d.etiqueta}</span>
              <span className="min-w-0 break-words font-semibold text-tinta">{d.valor}</span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
