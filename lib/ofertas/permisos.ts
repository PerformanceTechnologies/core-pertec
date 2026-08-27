import type { UsuarioConAcceso } from "@/lib/tipos";

/**
 * Una oferta es de quien la creó.
 *
 * Sin "server-only": la misma regla la necesitan el servidor —para filtrar el
 * listado y para gatear cada ruta que recibe un id— y la pantalla, que decide qué
 * mostrar. Igual que en el Cotizador (ver puedeVerCotizacion en
 * lib/permisos-cotizador.ts), y por el mismo motivo: una oferta tiene precios,
 * márgenes y dotación de un cliente concreto.
 *
 * Acá no hay un rol interno de la app como en el Cotizador: manda el rol del core.
 * Admin ve todas —es la única mirada que necesita ver el portafolio completo— y el
 * resto ve las suyas.
 *
 * Una oferta sin dueño —`creado_por` en null, que hoy no existe ninguna pero podría
 * aparecer por una carga manual— la ve solo el admin. Es deliberado: mostrársela a
 * todos filtraría datos de un cliente, y esconderla de todos la perdería en
 * silencio. Así queda a la vista de quien puede reasignarla.
 */
export function puedeVerOferta(oferta: { creadoPor: string | null }, usuario: UsuarioConAcceso): boolean {
  if (usuario.rol === "admin") return true;
  return oferta.creadoPor !== null && oferta.creadoPor === usuario.id;
}
