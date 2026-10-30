import Catalogo from "@/components/pagina-web/Catalogo";
import ErrorDeCarga from "@/components/pagina-web/ErrorDeCarga";
import { listarEquipos } from "@/lib/pagina-web";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  // Solo la lectura va protegida: un error de render lo atrapa error.tsx, no un try/catch.
  const r = await listarEquipos().then(
    (datos) => ({ ok: true as const, datos }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!r.ok) return <ErrorDeCarga error={r.error} />;
  return <Catalogo equipos={r.datos} />;
}
