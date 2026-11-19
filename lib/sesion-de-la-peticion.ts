import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

/**
 * La sesión de quien hizo la petición, leída UNA vez por petición.
 *
 * auth() descifra la cookie de sesión (un JWE) cada vez que se llama, y no recuerda nada. Una
 * carpeta de Contratos la pedía por cada carpeta del árbol que leía —44 en la portada de un
 * contrato—, y entre todas eso era más de un segundo de CPU por página aunque los datos ya
 * estuvieran en caché. Con cache() de React la segunda llamada de la misma petición es gratis.
 */
export const sesionDeLaPeticion = cache(() => auth());
