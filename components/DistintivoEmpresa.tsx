import { inicialesDe, logoDe, type Empresa } from "@/lib/empresas-modelo";

// El chip de cada empresa: PERTEC naranjo, Zeus dorado, Performance Service gris.
const TONO: Record<string, string> = {
  naranjo: "bg-[#c85217]/15 text-[#c85217]",
  dorado: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  gris: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
};

const TAMANO = {
  chico: { caja: "h-[22px] w-[22px] text-[10px]", px: 22 },
  medio: { caja: "h-7 w-7 text-[11px]", px: 28 },
} as const;

/**
 * El logo de la empresa; si no tiene, sus iniciales en su color. Decorativo: el nombre
 * siempre va al lado o en el `title` de quien lo usa. Lo comparten el selector de empresa
 * del menú y Administración › Usuarios.
 */
export default function DistintivoEmpresa({ empresa, tamano = "chico" }: { empresa: Pick<Empresa, "slug" | "logo" | "nombre" | "color">; tamano?: keyof typeof TAMANO }) {
  const t = TAMANO[tamano];
  const logo = logoDe(empresa);
  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- ícono chico servido por el propio core
      <img src={logo} alt="" width={t.px} height={t.px} className={`${t.caja} shrink-0 object-contain`} aria-hidden />
    );
  }
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md font-bold tracking-tight ${t.caja} ${TONO[empresa.color] ?? TONO.gris}`} aria-hidden>
      {inicialesDe(empresa.nombre)}
    </span>
  );
}
