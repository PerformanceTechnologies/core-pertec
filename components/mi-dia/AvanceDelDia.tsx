import Link from "next/link";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { leerResumenGuardado } from "@/lib/resumen-diario/datos";
import { obtenerAplicacionPorSlug } from "@/lib/aplicaciones";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import type { UsuarioConAcceso } from "@/lib/tipos";

/**
 * El resumen del día, destacado en el Dashboard.
 *
 * Reemplaza al párrafo que decía "Este es tu panel de acceso a Core PERTEC" y la
 * hora del último ingreso: eso no le servía a nadie después de la primera vez.
 *
 * Va como tarjeta con acento y botón, no como un párrafo más: es lo único de esta
 * página que dice algo distinto cada día, y compitiendo con siete tarjetas de
 * aplicación pasaba desapercibido.
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
  const r = guardado?.vigente ? guardado.resumen : null;

  const pendientes = r?.correosDestacados.length ?? 0;
  const urgentes = r?.correosDestacados.filter((c) => c.urgencia === "alta").length ?? 0;

  return (
    <section
      className={`mt-6 max-w-4xl overflow-hidden rounded-2xl border border-naranjo/25 bg-naranjo/[0.05] ${SOMBRA_CALIDA}`}
    >
      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0">
          <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
            <span className="h-px w-6 bg-naranjo" />
            Tu día
          </span>

          {r ? (
            <>
              <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-pretty text-tinta">
                {/* El panorama tal cual está guardado. Reescribirlo más corto para
                    el Dashboard significaría una segunda llamada al modelo para
                    decir casi lo mismo. */}
                {r.panorama}
              </p>

              {(pendientes > 0 || r.reunionesTotales > 0) && (
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-tinta/55">
                  {pendientes > 0 && (
                    <span>
                      <b className="font-condensed text-lg font-bold tabular-nums text-tinta">{pendientes}</b>{" "}
                      {pendientes === 1 ? "correo requiere" : "correos requieren"} tu respuesta
                      {urgentes > 0 && (
                        <b className="font-semibold text-naranjo">
                          {" "}
                          · {urgentes} urgente{urgentes === 1 ? "" : "s"}
                        </b>
                      )}
                    </span>
                  )}
                  {r.reunionesTotales > 0 && (
                    <span>
                      <b className="font-condensed text-lg font-bold tabular-nums text-tinta">
                        {r.reunionesTotales}
                      </b>{" "}
                      {r.reunionesTotales === 1 ? "reunión" : "reuniones"}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-pretty text-tinta/70">
              Tu resumen de correo y agenda de hoy todavía no está listo. Se arma al abrirlo, leyendo tu
              bandeja de los últimos días, así que la primera vez tarda unos segundos.
            </p>
          )}
        </div>

        {/* Botón sólido y no un enlace subrayado: es la acción principal de esta
            página, y con siete tarjetas de aplicación al lado un enlace de texto
            se pierde. */}
        <Link
          href="/mi-dia"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-naranjo px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-naranjo-suave focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo lg:self-center"
        >
          Ver mi resumen
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
