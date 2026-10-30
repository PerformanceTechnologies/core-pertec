import { TARJETA } from "@/lib/estilos";

/**
 * Lo que se ve si no se pudo leer el Supabase del sitio: faltan las variables
 * PERTEC_WEB_SUPABASE_* o la base no respondió. Mejor decirlo que mostrar un
 * catálogo vacío, que parece que alguien borró todo.
 */
export default function ErrorDeCarga({ error }: { error: unknown }) {
  const detalle = error instanceof Error ? error.message.replace(/^\[pagina-web\]\s*/, "") : String(error);
  return (
    <div className={`${TARJETA} p-6`}>
      <p className="font-semibold text-tinta">No se pudo leer la base de pertec.cl.</p>
      <p className="mt-1 text-sm text-gris">{detalle}</p>
    </div>
  );
}
