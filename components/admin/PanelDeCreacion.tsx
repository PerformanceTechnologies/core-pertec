import { IconChevronRight, IconPlus } from "@tabler/icons-react";

/**
 * El «+ Nuevo …» de una pantalla de Administración: una tarjeta que se despliega con su formulario.
 * Es un <details> nativo —funciona con teclado y sin JavaScript— con el mismo aspecto en Usuarios
 * y Aplicaciones. Va cerrada: la lista es lo que se viene a ver; crear es la excepción.
 */
export default function PanelDeCreacion({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-borde bg-superficie shadow-[0_1px_2px_rgba(23,20,17,0.04)] open:border-naranjo/40">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 transition hover:bg-tinta/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-naranjo [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-naranjo text-white">
          <IconPlus size={18} stroke={2.2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-tinta">{titulo}</span>
          <span className="block text-xs text-tinta/60">{ayuda}</span>
        </span>
        <IconChevronRight
          size={18}
          stroke={1.9}
          aria-hidden
          className="shrink-0 text-tinta/40 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-borde p-5 sm:p-6">{children}</div>
    </details>
  );
}
