import Link from "next/link";
import { IconArrowRight, IconBuildingFactory2, IconCalendarEvent, IconFolder, IconPlus } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { listarContratos } from "@/lib/contratos/contratos";
import { urlDelLogo } from "@/lib/contratos/contrato-actual";
import { puede } from "@/lib/contratos/permisos";
import { BOTON_PRIMARIO } from "@/lib/estilos";
import { TARJETA } from "@/lib/contratos/estilos";

export const dynamic = "force-dynamic";

function fecha(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * Los contratos: cada uno con sus documentos en SharePoint, su acreditación de personas y
 * vehículos, su logística y sus gastos de arranque. Es la entrada desde el menú.
 */
export default async function ContratosPage() {
  const usuario = await exigirAccesoApp("contratos");
  const contratos = await listarContratos();
  const puedeCrear = puede(usuario.rol, "configurar");

  return (
    <div className="mx-auto max-w-6xl">
      <span className="etiqueta-seccion">Contratos</span>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
            Contratos
          </h1>
          <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-tinta/60">
            Cada contrato tiene sus documentos en SharePoint (Core Pertec › CONTRATOS), la acreditación de
            personas y vehículos, la logística y los gastos de arranque.
          </p>
        </div>
        {puedeCrear && (
          <Link href="/contratos/nuevo" className={`${BOTON_PRIMARIO} inline-flex items-center gap-2`}>
            <IconPlus size={16} />
            Nuevo contrato
          </Link>
        )}
      </div>

      {contratos.length === 0 ? (
        <div className={`${TARJETA} mt-8 p-10 text-center`}>
          <IconFolder size={32} className="mx-auto text-gris-suave" />
          <p className="mt-3 text-sm font-semibold text-tinta">Todavía no hay contratos</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gris">
            {puedeCrear
              ? "Crea el primero: queda con su carpeta en SharePoint y todos los módulos listos para usar."
              : "Cuando un administrador cree uno, aparecerá acá."}
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {contratos.map((c) => (
            <li key={c.id}>
              <Link
                href={`/contratos/${c.slug}`}
                className={`${TARJETA} group flex h-full flex-col p-5 transition hover:border-naranjo/50 ${
                  c.activo ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-borde bg-superficie text-naranjo">
                    {urlDelLogo(c) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- imagen chica servida por el propio core
                      <img src={urlDelLogo(c) as string} alt="" className="h-full w-full object-contain p-1" />
                    ) : (
                      <IconBuildingFactory2 size={22} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-condensed text-lg font-bold leading-tight text-tinta [overflow-wrap:anywhere]">
                      {c.nombre}
                    </p>
                    {(c.cliente || c.numero) && (
                      <p className="mt-0.5 text-xs text-gris">
                        {[c.cliente, c.numero && `N.º ${c.numero}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[11px] text-gris">
                  {c.fechaInicio && (
                    <span className="inline-flex items-center gap-1">
                      <IconCalendarEvent size={13} />
                      Inicio {fecha(c.fechaInicio)}
                    </span>
                  )}
                  {!c.carpetaItemId && <span className="font-semibold text-amber-700">Sin carpeta en SharePoint</span>}
                  {!c.activo && <span className="font-semibold">Cerrado</span>}
                  <span className="ml-auto inline-flex items-center gap-1 font-bold uppercase tracking-wide text-naranjo transition-[gap] group-hover:gap-2">
                    Entrar
                    <IconArrowRight size={13} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
