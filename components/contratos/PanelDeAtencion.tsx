import Link from "@/components/contratos/Enlace";
import { IconAlertTriangle, IconCalendarDue, IconChevronDown, IconClockHour4 } from "@tabler/icons-react";
import { TARJETA } from "@/lib/contratos/estilos";
import { textoDeAlerta, type Alerta } from "@/lib/contratos/acreditacion-modelo";

/** Cuántas se muestran de entrada; el resto está en un desplegable. */
const VISIBLES = 6;

/**
 * Lo que requiere atención ahora: documentos vencidos o por vencer y contratos que
 * terminan, lo más urgente primero.
 *
 * Es la forma de avisar que tiene el core sin salir a buscar a nadie: actúa con el
 * permiso de quien lo abre y no tiene identidad propia con la que mandar un correo
 * cuando nadie está mirando. A cambio, el aviso está donde se mira — al entrar.
 */
export default function PanelDeAtencion({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) return null;

  const vencidas = alertas.filter((a) => a.dias < 0).length;
  const primeras = alertas.slice(0, VISIBLES);
  const resto = alertas.slice(VISIBLES);

  const fila = (a: Alerta, i: number) => {
    const Icono = a.dias < 0 ? IconAlertTriangle : a.tipo === "contrato" ? IconClockHour4 : IconCalendarDue;
    return (
      <li key={`${a.personaId}-${a.asunto}-${i}`}>
        <Link
          href={`/contratos/acreditacion/${a.personaId}`}
          className="flex items-start gap-2.5 px-4 py-2.5 transition hover:bg-cian-lavado/50"
        >
          <Icono size={16} className={`mt-0.5 shrink-0 ${a.dias < 0 ? "text-red-600" : "text-amber-600"}`} />
          <span className="min-w-0 flex-1 text-sm text-tinta">
            <strong className="font-semibold">{a.persona}</strong>
            <span className="text-gris"> · {a.asunto} </span>
            <span className={a.dias < 0 ? "font-semibold text-red-600" : "text-amber-600"}>
              {textoDeAlerta(a)}
            </span>
          </span>
        </Link>
      </li>
    );
  };

  return (
    // Plegado de entrada: con muchos avisos empujaba la nómina hacia abajo. El encabezado dice
    // cuántos hay y cuántos ya pasaron, que es lo que hace decidir si abrirlo.
    <details className={`${TARJETA} group mt-6 overflow-hidden`} aria-label="Requiere atención">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gris transition hover:bg-cian-lavado/40 group-open:border-b group-open:border-borde [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span className="h-[2px] w-3 rounded-full bg-cian" />
          Requiere atención
        </span>
        <span className="font-semibold normal-case tracking-normal text-gris-suave">
          {alertas.length} {alertas.length === 1 ? "aviso" : "avisos"}
          {vencidas > 0 && (
            <span className="font-semibold text-red-600">
              {` · ${vencidas} ya ${vencidas === 1 ? "pasó" : "pasaron"}`}
            </span>
          )}
        </span>
        <IconChevronDown size={16} className="ml-auto text-gris transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <ul className="divide-y divide-borde">{primeras.map(fila)}</ul>

      {resto.length > 0 && (
        <details className="border-t border-borde">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-azul hover:underline">
            Ver {resto.length} más
          </summary>
          <ul className="divide-y divide-borde border-t border-borde">
            {resto.map((a, i) => fila(a, i + VISIBLES))}
          </ul>
        </details>
      )}
    </details>
  );
}
