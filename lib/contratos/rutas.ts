// Las direcciones dentro de un contrato. Sin "server-only": lo usan componentes cliente y servidor.

/**
 * Pone el contrato en una dirección escrita como en core-ih.
 *
 * core-ih tenía un solo contrato y sus direcciones son «/contratos/acreditacion», «/contratos»…
 * Acá cada contrato vive en «/contratos/<contrato>/…», así que esas mismas direcciones se
 * traducen: «/contratos» → «/contratos/<contrato>», «/contratos/x» → «/contratos/<contrato>/x».
 *
 * Una dirección que ya trae el contrato, o que no es de Contratos, se deja como está.
 */
export function enContrato(slug: string, href: string): string {
  if (href === "/contratos") return `/contratos/${slug}`;
  if (!href.startsWith("/contratos/") && !href.startsWith("/contratos?")) return href;
  if (href.startsWith(`/contratos/${slug}/`) || href === `/contratos/${slug}` || href.startsWith(`/contratos/${slug}?`)) {
    return href;
  }
  return `/contratos/${slug}${href.slice("/contratos".length)}`;
}
