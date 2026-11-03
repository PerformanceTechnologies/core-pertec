import { normalizar } from "@/lib/valorizacion-historica-modelo";

/**
 * Marca en el texto las palabras buscadas (sin importar tildes ni mayúsculas). Las palabras con
 * comodines (* ?) no se marcan: no hay un pedazo exacto que pintar.
 */
export default function Resaltar({ texto, q }: { texto: string; q?: string }) {
  const palabras = normalizar(q ?? "").split(/\s+/).filter((p) => p.length >= 2 && !/[*?]/.test(p));
  const plano = normalizar(texto);
  // Con caracteres que cambian de largo al normalizar, las posiciones no calzan: se muestra tal cual.
  if (palabras.length === 0 || plano.length !== texto.length) return <>{texto}</>;

  const marcas = new Array<boolean>(texto.length).fill(false);
  for (const p of palabras) {
    for (let i = plano.indexOf(p); i !== -1; i = plano.indexOf(p, i + p.length)) {
      for (let j = i; j < i + p.length; j++) marcas[j] = true;
    }
  }
  const trozos: { t: string; m: boolean }[] = [];
  for (let i = 0; i < texto.length; i++) {
    const ultimo = trozos[trozos.length - 1];
    if (ultimo && ultimo.m === marcas[i]) ultimo.t += texto[i];
    else trozos.push({ t: texto[i], m: marcas[i] });
  }
  return (
    <>
      {trozos.map((x, i) =>
        x.m ? (
          <mark key={i} className="rounded-sm bg-naranjo/20 px-px text-inherit">
            {x.t}
          </mark>
        ) : (
          <span key={i}>{x.t}</span>
        ),
      )}
    </>
  );
}
