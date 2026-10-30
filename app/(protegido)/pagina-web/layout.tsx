import { IconWorldWww } from "@tabler/icons-react";
import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";
import NavPaginaWeb from "@/components/pagina-web/NavPaginaWeb";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { contarSolicitudesNuevas } from "@/lib/pagina-web";
import { SLUG_APP_PAGINA_WEB } from "@/lib/pagina-web-modelo";

export const dynamic = "force-dynamic";

// Lo que antes se hacía en pertec.cl/admin. Los datos viven en el Supabase del sitio
// (ver lib/pagina-web.ts) y el sitio los lee en vivo: lo que se guarda acá se ve en
// pertec.cl en la próxima carga, sin publicar nada.
export default async function LayoutPaginaWeb({ children }: { children: React.ReactNode }) {
  await exigirAccesoApp(SLUG_APP_PAGINA_WEB);
  const nuevas = await contarSolicitudesNuevas().catch(() => 0);

  return (
    <div className="animar-entrada">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-azul/10 text-azul">
          <IconWorldWww size={22} stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-tinta">Página web</h1>
          <p className="text-sm text-gris">Lo que se guarda acá se ve en pertec.cl al recargar, sin publicar nada.</p>
        </div>
        <a
          href="https://pertec.cl"
          target="_blank"
          rel="noreferrer"
          className="hidden rounded-lg border border-borde px-3 py-2 text-xs font-semibold text-gris transition hover:text-tinta sm:inline-block"
        >
          Ver pertec.cl ↗
        </a>
      </header>
      {/* pertec.cl es de PERTEC: parado en otra empresa no se muestra. */}
      <FiltroDeEmpresa>
        <NavPaginaWeb nuevas={nuevas} />
        {children}
      </FiltroDeEmpresa>
    </div>
  );
}
