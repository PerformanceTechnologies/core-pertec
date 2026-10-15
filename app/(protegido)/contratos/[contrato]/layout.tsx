import Link from "next/link";
import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { contratoActual } from "@/lib/contratos/contrato-actual";
import { alertasPendientes } from "@/lib/contratos/acreditacion-alertas";
import { alertasDeVehiculosPendientes } from "@/lib/contratos/vehiculos-alertas";
import { tieneAccesoASharePoint } from "@/lib/contratos/graph-credenciales";
import { ContratoProvider } from "@/components/contratos/ContratoProvider";
import { PermisosDelUsuario } from "@/components/contratos/PermisosDelUsuario";
import PestanasDelContrato from "@/components/contratos/PestanasDelContrato";
import BotonPrepararCarpetas from "@/components/contratos/BotonPrepararCarpetas";

export const dynamic = "force-dynamic";

/**
 * Un contrato: su nombre arriba, sus módulos en pestañas, y todo lo de core-ih adentro.
 *
 * Pone dos cosas que los componentes traídos de core-ih necesitan: el contrato (para que sus
 * enlaces lleven a este contrato y no a otro) y el rol de quien mira (para esconder lo que no
 * puede hacer). El servidor sabe el contrato por la dirección (ver proxy.ts).
 */
export default async function LayoutDelContrato({ children }: { children: React.ReactNode }) {
  const [usuario, contrato] = await Promise.all([exigirAccesoApp("contratos"), contratoActual()]);
  const [alertasPersonas, alertasVehiculos, conectado] = await Promise.all([
    alertasPendientes(),
    alertasDeVehiculosPendientes(),
    contrato.carpetaItemId ? Promise.resolve(true) : tieneAccesoASharePoint(usuario.correo),
  ]);

  const pestanas = [
    { etiqueta: "Resumen", ruta: "" },
    { etiqueta: "Dashboard", ruta: "/dashboard" },
    { etiqueta: "Documentos generales", ruta: "/DOCUMENTOS%20GENERALES" },
    { etiqueta: "Acreditación Personas", ruta: "/acreditacion", insignia: alertasPersonas },
    { etiqueta: "Acreditación Vehículos", ruta: "/acreditacion-vehiculos", insignia: alertasVehiculos },
    { etiqueta: "Logística", ruta: "/logistica" },
    { etiqueta: "Gastos de arranque", ruta: "/gastos-arranque" },
  ];

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

          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
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

          <PestanasDelContrato slug={contrato.slug} pestanas={pestanas} />

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
