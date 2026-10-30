import Solicitudes from "@/components/pagina-web/Solicitudes";
import ErrorDeCarga from "@/components/pagina-web/ErrorDeCarga";
import { listarSolicitudes } from "@/lib/pagina-web";

export const dynamic = "force-dynamic";

export default async function SolicitudesPage() {
  // Solo la lectura va protegida: un error de render lo atrapa error.tsx, no un try/catch.
  const r = await listarSolicitudes().then(
    (datos) => ({ ok: true as const, datos }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!r.ok) return <ErrorDeCarga error={r.error} />;
  return <Solicitudes solicitudes={r.datos} />;
}
