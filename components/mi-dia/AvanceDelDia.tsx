import Link from "next/link";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { leerResumenGuardado } from "@/lib/resumen-diario/datos";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import type { UsuarioConAcceso } from "@/lib/tipos";

/**
 * El adelanto del resumen del día, en el Dashboard.
 *
 * Reemplaza al párrafo que decía "Este es tu panel de acceso a Core PERTEC" y la
 * hora del último ingreso: eso no le servía a nadie después de la primera vez.
 *
 * SOLO LEE LA CACHÉ, nunca genera. Generar el resumen es una llamada al modelo
 * sobre el buzón completo, y ponerla en la portada convertiría los 30 a 90
 * segundos de la primera visita del día en el tiempo de carga del Dashboard
 * ENTERO, para todos, todas las mañanas. Si el resumen de hoy no existe todavía,
 * esto invita a abrir Mi Día, que es donde esa espera tiene sentido y donde hay
 * una pantalla que la explica.
 */
export default async function AvanceDelDia({ usuario }: { usuario: UsuarioConAcceso }) {
  // Mismo criterio que el resto del core: el admin ve todo, los demás solo lo
  // asignado. Sin esto le ofreceríamos el resumen a quien no tiene el módulo.
  const app = await obtenerAplicacionPorSlug("mi-dia");
  const tieneAcceso = usuario.rol === "admin" || (app ? usuario.aplicacionIds.includes(app.id) : false);
  if (!tieneAcceso) return null;

  const guardado = await leerResumenGuardado(usuario.id, hoyEnSantiago().iso);

  if (!guardado?.vigente) {
    return (
      <p className="mt-3 max-w-xl text-sm text-pretty text-tinta/55">
        Tu resumen de correo y agenda de hoy todavía no está listo.{" "}
        <Link
          href="/mi-dia"
          className="font-medium text-naranjo underline underline-offset-2 hover:text-naranjo-suave"
        >
          Ábrelo para generarlo
        </Link>
        .
      </p>
    );
  }

  const r = guardado.resumen;
  const pendientes = r.correosDestacados.length;
  const urgentes = r.correosDestacados.filter((c) => c.urgencia === "alta").length;

  return (
    <div className="mt-4 max-w-2xl">
      {/* El panorama tal cual: es la frase que resume el día y ya está escrita.
          Reescribirla más corta acá significaría una segunda llamada al modelo
          para decir casi lo mismo. */}
      <p className="border-l-2 border-naranjo pl-4 text-[15px] leading-relaxed text-pretty text-tinta">
        {r.panorama}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-4 text-xs text-tinta/50">
        {pendientes > 0 && (
          <span>
            <b className="font-semibold text-tinta">{pendientes}</b>{" "}
            {pendientes === 1 ? "correo requiere" : "correos requieren"} tu respuesta
            {urgentes > 0 && (
              <span className="text-naranjo">
                {" "}
                · {urgentes} urgente{urgentes === 1 ? "" : "s"}
              </span>
            )}
          </span>
        )}
        {r.reunionesTotales > 0 && (
          <span>
            <b className="font-semibold text-tinta">{r.reunionesTotales}</b>{" "}
            {r.reunionesTotales === 1 ? "reunión" : "reuniones"}
          </span>
        )}
        <Link
          href="/mi-dia"
          className="font-medium text-naranjo underline underline-offset-2 hover:text-naranjo-suave"
        >
          Ver mi resumen completo →
        </Link>
      </div>
    </div>
  );
}
