import ErrorDeCarga from "@/components/pagina-web/ErrorDeCarga";
import FormularioContacto from "@/components/pagina-web/FormularioContacto";
import { leerConfig } from "@/lib/pagina-web";

export const dynamic = "force-dynamic";

export default async function ContactoPage() {
  // Solo la lectura va protegida: un error de render lo atrapa error.tsx, no un try/catch.
  const r = await leerConfig().then(
    (datos) => ({ ok: true as const, datos }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  if (!r.ok) return <ErrorDeCarga error={r.error} />;
  return <FormularioContacto valores={r.datos} />;
}
