import Link from "next/link";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { contratoActual, urlDelLogo } from "@/lib/contratos/contrato-actual";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { puede } from "@/lib/contratos/permisos";
import { ContratoProvider } from "@/components/contratos/ContratoProvider";
import { PermisosDelUsuario } from "@/components/contratos/PermisosDelUsuario";
import LogoDelContrato from "@/components/contratos/LogoDelContrato";
import BotonPrepararCarpetas from "@/components/contratos/BotonPrepararCarpetas";

export const dynamic = "force-dynamic";

/**
 * Un contrato: su logo y su nombre arriba, y todo lo de core-ih adentro. Sus módulos se recorren
 * desde la barra lateral: Contratos › <contrato> › Carpeta de arranque › …
 *
 * Pone dos cosas que los componentes traídos de core-ih necesitan: el contrato (para que sus
 * enlaces lleven a este contrato y no a otro) y el rol de quien mira (para esconder lo que no
 * puede hacer). El servidor sabe el contrato por la dirección (ver proxy.ts).
 */
export default async function LayoutDelContrato({ children }: { children: React.ReactNode }) {
  const [usuario, contrato] = await Promise.all([exigirAccesoApp("contratos"), contratoActual()]);
  const conectado = contrato.carpetaItemId ? true : await tieneAccesoASharePoint(usuario.correo);

  return (
    <ContratoProvider slug={contrato.slug}>
      <PermisosDelUsuario rol={usuario.rol}>
        <div className="mx-auto max-w-6xl">
          <Link
            href="/contratos"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gris transition hover:text-naranjo"
          >
            <IconArrowLeft size={14} />
            Contratos
          </Link>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 items-center gap-4">
              <LogoDelContrato
                slug={contrato.slug}
                url={urlDelLogo(contrato)}
                nombre={contrato.nombre}
                editable={puede(usuario.rol, "configurar")}
              />
              <div className="min-w-0">
              <h1 className="font-condensed text-2xl font-bold uppercase leading-[0.95] tracking-tight text-tinta [overflow-wrap:anywhere] sm:text-3xl">
                {contrato.nombre}
              </h1>
              {(contrato.cliente || contrato.numero) && (
                <p className="mt-1 text-sm text-gris">
                  {[contrato.cliente, contrato.numero && `N.º ${contrato.numero}`].filter(Boolean).join(" · ")}
                </p>
              )}
              </div>
            </div>
            {contrato.carpetaUrl && (
              <a
                href={contrato.carpetaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gris transition hover:text-naranjo"
              >
                Carpeta en SharePoint
                <IconExternalLink size={14} />
              </a>
            )}
          </div>

          {!contrato.carpetaItemId && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-700">Este contrato todavía no tiene su carpeta en SharePoint</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-700/90">
                Se crea en Core Pertec › CONTRATOS › {contrato.carpeta}, con la estructura de la plantilla.
                {conectado ? "" : " Primero conecta tu cuenta a SharePoint (más abajo)."}
              </p>
              {conectado && (
                <div className="mt-3">
                  <BotonPrepararCarpetas slug={contrato.slug} />
                </div>
              )}
            </div>
          )}

          <div className="mt-6">{children}</div>
        </div>
      </PermisosDelUsuario>
    </ContratoProvider>
  );
}
