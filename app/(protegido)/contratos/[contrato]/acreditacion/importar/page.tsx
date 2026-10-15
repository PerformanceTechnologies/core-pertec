import Link from "@/components/contratos/Enlace";
import { IconArrowLeft } from "@tabler/icons-react";
import ImportadorDePersonas from "@/components/contratos/ImportadorDePersonas";
import { exigirAccesoApp } from "@/lib/contratos/autorizacion";
import { listarCargos } from "@/lib/contratos/acreditacion";

export const dynamic = "force-dynamic";

// Importar crea una carpeta en SharePoint por persona. La acción se corta sola a
// los 40 segundos, y este tope le da margen a la plataforma para no cortarla antes.
export const maxDuration = 60;

export default async function ImportarPage() {
  await exigirAccesoApp("acreditacion");
  const cargos = (await listarCargos()).filter((c) => c.activo);

  return (
    <div className="animar-entrada max-w-3xl">
      <Link
        href="/contratos/acreditacion"
        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gris transition hover:text-azul"
      >
        <IconArrowLeft size={14} />
        Nómina
      </Link>

      <h1 className="titular mt-3 text-3xl text-azul">Importar personas</h1>
      <p className="mt-1 text-sm text-gris">
        Para dar de alta a varias personas de una vez. Cada una queda con su checklist según su
        cargo, y el resto de los datos se completa después en su ficha.
      </p>

      <div className="mt-6">
        <ImportadorDePersonas cargos={cargos.map((c) => c.nombre)} />
      </div>
    </div>
  );
}
