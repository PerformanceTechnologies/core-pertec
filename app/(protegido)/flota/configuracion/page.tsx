import Link from "next/link";
import { IconCar, IconFiles, IconSettings } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import ConfigDocumentos from "@/components/flota/ConfigDocumentos";
import ConfigMarcas from "@/components/flota/ConfigMarcas";
import { listarMarcas, listarModelos, listarTiposDocumento } from "@/lib/flota";

export const dynamic = "force-dynamic";

export default async function ConfiguracionFlotaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const enMarcas = (await searchParams).ver === "marcas";
  const [marcas, modelos, tipos] = await Promise.all([listarMarcas(), listarModelos(), listarTiposDocumento()]);

  const pestanas = [
    { href: "/flota/configuracion", texto: "Documentos", detalle: `${tipos.filter((t) => t.activo).length} se piden`, Icono: IconFiles, on: !enMarcas },
    { href: "/flota/configuracion?ver=marcas", texto: "Marcas y modelos", detalle: `${marcas.length} marcas · ${modelos.length} modelos`, Icono: IconCar, on: enMarcas },
  ];

  return (
    <div className="space-y-5">
      <IntroSeccion
        Icono={IconSettings}
        tono="bg-slate-500/10 text-slate-600"
        titulo="Configuración"
        bajada="Qué documentos se le piden a cada vehículo, y las marcas y modelos que se eligen al crearlo."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {pestanas.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            scroll={false}
            className={`flex items-center gap-3 rounded-2xl border p-4 transition ${
              p.on ? "border-naranjo bg-naranjo/[0.06] ring-2 ring-naranjo/15" : "border-borde bg-superficie hover:border-naranjo/40"
            }`}
          >
            <span className={`grid h-10 w-10 place-items-center rounded-xl ${p.on ? "bg-naranjo text-white" : "bg-tinta/[0.05] text-gris"}`}>
              <p.Icono size={20} stroke={1.75} />
            </span>
            <span>
              <span className="block text-sm font-bold text-tinta">{p.texto}</span>
              <span className="block text-xs text-gris">{p.detalle}</span>
            </span>
          </Link>
        ))}
      </div>

      {enMarcas ? <ConfigMarcas marcas={marcas} modelos={modelos} /> : <ConfigDocumentos tipos={tipos} />}
    </div>
  );
}
