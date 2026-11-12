import Link from "next/link";

/**
 * Para quien administra gastos: junto al título de «Mis gastos», «Mis informes» o «Mis fondos», el botón
 * que cambia a la vista de TODOS (y de vuelta). Son enlaces: no guardan nada en el navegador.
 */
export default function ConmutadorTodos({
  activa,
  mias,
  todas,
}: {
  activa: "mias" | "todas";
  mias: { href: string; texto: string };
  todas: { href: string; texto: string };
}) {
  const base = "rounded-md px-2.5 py-1 transition";
  return (
    <div className="inline-flex rounded-lg border border-borde bg-superficie p-0.5 text-xs font-semibold">
      <Link href={mias.href} scroll={false} aria-current={activa === "mias" ? "page" : undefined} className={`${base} ${activa === "mias" ? "bg-tinta text-superficie" : "text-gris hover:text-tinta"}`}>{mias.texto}</Link>
      <Link href={todas.href} scroll={false} aria-current={activa === "todas" ? "page" : undefined} className={`${base} ${activa === "todas" ? "bg-naranjo text-white" : "text-gris hover:text-tinta"}`}>{todas.texto}</Link>
    </div>
  );
}
