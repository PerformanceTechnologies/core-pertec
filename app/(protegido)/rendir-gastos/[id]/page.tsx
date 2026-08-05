import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import PanelRendicion from "@/components/rendidor/PanelRendicion";

const SLUG_APP = "rendir-gastos";

export const dynamic = "force-dynamic";

export default async function RendicionPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const { id } = await params;

  const rendicion = await obtenerRendicion(id);
  if (!rendicion) notFound();

  // Cada quien ve lo suyo; un admin puede abrir cualquiera.
  if (rendicion.creadoPor !== usuario.id && usuario.rol !== "admin") notFound();

  return (
    <div>
      <Link href="/rendir-gastos" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Mis rendiciones
      </Link>
      <div className="mt-2">
        <PanelRendicion rendicionInicial={rendicion} />
      </div>
    </div>
  );
}
