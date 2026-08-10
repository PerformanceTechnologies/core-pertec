import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado simétrico para credenciales guardadas en la base.
 *
 * Existe por el refresh token de Microsoft Graph: es una credencial de larga
 * vida que permite leer el correo de una persona, así que no puede quedar en
 * texto plano en una tabla. Cifrando en Node —y no con pgcrypto— la base nunca
 * ve el valor en claro: una filtración de la base sola no alcanza, hace falta
 * además la llave, que vive en el entorno del servidor.
 *
 * AES-256-GCM y no CBC porque GCM es autenticado: si alguien modifica el texto
 * cifrado en la base, descifrar FALLA en vez de devolver basura silenciosamente.
 */

const ALGORITMO = "aes-256-gcm";
const LARGO_IV = 12; // 96 bits, el recomendado para GCM
const LARGO_TAG = 16;

function llave(): Buffer {
  const base64 = process.env.TOKEN_CIFRADO_KEY;
  if (!base64) {
    throw new Error(
      "Falta TOKEN_CIFRADO_KEY en las variables de entorno. " + "Generala con: openssl rand -base64 32",
    );
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== 32) {
    throw new Error(
      `TOKEN_CIFRADO_KEY tiene ${bytes.length} bytes decodificados y AES-256 necesita 32. ` +
        "Generala con: openssl rand -base64 32",
    );
  }
  return bytes;
}

/**
 * Devuelve "iv.tag.cifrado", todo en base64url.
 *
 * El IV va en el resultado porque tiene que ser distinto en cada cifrado (si se
 * repite con la misma llave, GCM deja de ser seguro) y no es secreto. El tag de
 * autenticación viaja al lado para poder verificar la integridad al descifrar.
 */
export function cifrar(texto: string): string {
  const iv = randomBytes(LARGO_IV);
  const cipher = createCipheriv(ALGORITMO, llave(), iv);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), cifrado.toString("base64url")].join(".");
}

/**
 * Descifra lo que produjo `cifrar`. Lanza si el texto fue alterado, si la llave
 * cambió o si el formato no es el esperado — nunca devuelve un valor dudoso.
 */
export function descifrar(paquete: string): string {
  const partes = paquete.split(".");
  if (partes.length !== 3) {
    throw new Error("El texto cifrado no tiene el formato iv.tag.cifrado esperado.");
  }
  const [ivB64, tagB64, cifradoB64] = partes;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  if (iv.length !== LARGO_IV || tag.length !== LARGO_TAG) {
    throw new Error("El IV o el tag de autenticación del texto cifrado tienen un largo inválido.");
  }

  const decipher = createDecipheriv(ALGORITMO, llave(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(cifradoB64, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}
