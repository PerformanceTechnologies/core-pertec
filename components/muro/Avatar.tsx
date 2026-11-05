// La cara de una persona en el Muro: sus iniciales sobre un degradado que sale de su correo
// (la misma persona tiene siempre el mismo color).

const COLORES = [
  "from-sky-400 to-blue-600",
  "from-emerald-400 to-teal-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-violet-400 to-purple-600",
  "from-cyan-400 to-sky-600",
  "from-lime-400 to-green-600",
  "from-fuchsia-400 to-violet-600",
];

function colorDe(correo: string): string {
  let h = 0;
  for (const c of correo) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES[h % COLORES.length];
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function Avatar({ correo, nombre, tamano = "h-11 w-11 text-sm" }: { correo: string; nombre: string; tamano?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-linear-to-br font-bold text-white shadow-sm ring-2 ring-superficie ${colorDe(correo)} ${tamano}`} title={nombre}>
      {iniciales(nombre)}
    </span>
  );
}
