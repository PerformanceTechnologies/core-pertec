"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerResumenDeHoy } from "@/lib/resumen-diario/datos";

const SLUG_APP = "mi-dia";

/**
 * Regenera el resumen de hoy, tirando el que está en caché.
 *
 * Sirve para cuando alguien mira el resumen a media tarde: el de la mañana ya no
 * refleja los correos que llegaron después. Es lo único que puede pasar `forzar`,
 * y va detrás del guard de la app igual que la página — una Server Action se
 * puede invocar directo sin pasar por la UI.
 */
export async function regenerarResumenAction(): Promise<void> {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const sesion = await auth();

  await obtenerResumenDeHoy({
    usuarioId: usuario.id,
    nombre: usuario.nombre ?? usuario.correo,
    accessTokenSesion: sesion?.accessToken,
    forzar: true,
  });

  revalidatePath(`/${SLUG_APP}`);
}
