"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";

const SLUG_APP = "mi-dia";

/**
 * Vuelve a generar el resumen de hoy, ignorando la caché.
 *
 * Existe porque el resumen se arma una vez al día y queda guardado: si llegó
 * correo importante después de esa generación —o si el cron corrió a una hora en
 * que el día todavía no había empezado— no había forma de actualizarlo sin
 * esperar al día siguiente. El único camino era el endpoint del cron, que pide
 * el CRON_SECRET.
 *
 * Regenera SIEMPRE el resumen de quien está en sesión: el usuario sale de
 * `exigirAccesoApp` y no de un parámetro, así que no hay manera de pedir la
 * regeneración —ni la lectura del buzón— de otra persona.
 *
 * `enviado_en` no se toca (ver `forzar` en lib/resumen-diario/datos.ts), así que
 * esto no dispara un segundo correo del día.
 */
export async function regenerarResumenAction() {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const sesion = await auth();

  await obtenerResumenDeHoy({
    usuarioId: usuario.id,
    nombre: usuario.nombre ?? usuario.correo,
    correo: usuario.correo,
    accessTokenSesion: sesion?.accessToken,
    forzar: true,
  });

  // También el Dashboard: su tarjeta lee la misma caché, y sin esto seguiría
  // mostrando el panorama viejo hasta la próxima navegación completa.
  revalidatePath("/mi-dia");
  revalidatePath("/");
}
