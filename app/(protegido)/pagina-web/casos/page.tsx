import Casos from "@/components/pagina-web/Casos";
import ErrorDeCarga from "@/components/pagina-web/ErrorDeCarga";
import { listarCasos } from "@/lib/pagina-web";

export const dynamic = "force-dynamic";

export default async function CasosPage() {
  // Solo la lectura va protegida: un error de render lo atrapa error.tsx, no un try/catch.
  const r = await listarCasos().then(
    (datos) => ({ ok: true as const, datos }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!r.ok) return <ErrorDeCarga error={r.error} />;
  return <Casos casos={r.datos} />;
}
