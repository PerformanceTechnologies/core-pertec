import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { urlFirmadaDeRespaldo } from "@/lib/rendidor/almacenamiento";
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

  // URLs firmadas para previsualizar cada comprobante. Se generan DESPUÉS del
  // chequeo de acceso de arriba, no antes: son credenciales portadoras y no
  // corresponde emitirlas para una rendición que esta persona no puede ver.
  //
  // En paralelo porque son N llamadas independientes a Supabase; en serie, una
  // rendición de 16 comprobantes sumaba 16 round-trips uno detrás del otro.
  const conRespaldo = rendicion.gastos.filter((g) => g.archivoPath);
  const firmadas = await Promise.all(conRespaldo.map((g) => urlFirmadaDeRespaldo(g.archivoPath)));
  const urlsRespaldo: Record<string, string> = {};
  conRespaldo.forEach((g, i) => {
    const url = firmadas[i];
    if (url) urlsRespaldo[g.id] = url;
  });

  return (
    <div>
      <Link href="/rendir-gastos" className="text-xs font-medium text-tinta/50 hover:text-naranjo">
        ← Mis rendiciones
      </Link>
      <div className="mt-2">
        <PanelRendicion rendicionInicial={rendicion} urlsRespaldo={urlsRespaldo} />
      </div>
    </div>
  );
}
