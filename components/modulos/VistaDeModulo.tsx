import Link from "next/link";
import { IconArrowUpRight, IconClock, IconTools, type Icon } from "@tabler/icons-react";
import { SECCIONES_DE_MODULO, type GrupoDelMenu, type ItemDelMenu } from "@/lib/menu-modelo";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";

/** Una cartilla: un submódulo del módulo abierto, con sus atajos a lo que tiene adentro. */
interface Cartilla {
  clave: string;
  nombre: string;
  descripcion: string | null;
  icono: Icon;
  /** null: todavía no se puede abrir (próximamente, en mantención). */
  href: string | null;
  externo: boolean;
  /** Lo que se dice en la insignia de la cartilla; null: nada que decir. */
  etiqueta: { texto: string; clases: string; icono?: "reloj" | "herramienta" } | null;
  secciones: { href: string; nombre: string }[];
}

function aCartilla(item: ItemDelMenu, contratos: { slug: string; nombre: string }[]): Cartilla {
  if (item.tipo === "pronto") {
    return {
      clave: `pronto-${item.nombre}`,
      nombre: item.nombre,
      descripcion: null,
      icono: obtenerIcono(item.icono),
      href: null,
      externo: false,
      etiqueta: { texto: "Próximamente", clases: "bg-gris/15 text-gris", icono: "reloj" },
      secciones: [],
    };
  }
  if (item.tipo === "enlace") {
    return {
      clave: item.href,
      nombre: item.nombre,
      descripcion: item.descripcion ?? null,
      icono: obtenerIcono(item.icono),
      href: item.href,
      externo: false,
      etiqueta: null,
      secciones: [],
    };
  }

  const { app } = item;
  const externo = app.tipo !== "interna";
  const href = !externo ? app.url : app.url.startsWith("http") ? app.url : `https://${app.url}`;
  const enMantencion = app.estado === "mantenimiento";
  // Las pantallas de adentro: las del catálogo del módulo, o —en Contratos— cada contrato.
  const secciones =
    app.url === "/contratos"
      ? contratos.map((c) => ({ href: `/contratos/${c.slug}`, nombre: c.nombre }))
      : (SECCIONES_DE_MODULO[app.url] ?? []);

  return {
    clave: app.id,
    nombre: item.nombre,
    descripcion: app.descripcion,
    icono: obtenerIcono(app.icono),
    href: enMantencion ? null : href,
    externo,
    etiqueta:
      app.estado === "activa"
        ? null
        : {
            texto: etiquetaEstado(app.estado),
            clases: clasesInsigniaEstado(app.estado),
            icono: enMantencion ? "herramienta" : undefined,
          },
    secciones: enMantencion ? [] : secciones,
  };
}

/**
 * Lo que se dibuja en la página de un módulo: encabezado y sus submódulos como cartillas.
 *
 * Solo dibuja: de qué módulo se trata y qué ve la persona lo resuelve la página
 * (app/(protegido)/modulos/[grupo]/page.tsx). Los `contratos` son los de «Contratos», que se
 * muestran como atajos dentro de su cartilla.
 */
export default function VistaDeModulo({
  grupo,
  contratos = [],
}: {
  grupo: GrupoDelMenu;
  contratos?: { slug: string; nombre: string }[];
}) {
  const cartillas = grupo.items.map((item) => aCartilla(item, contratos));
  const abribles = cartillas.filter((c) => c.href).length;

  return (
    <div>
      <nav aria-label="Ruta" className="flex items-center gap-1.5 text-xs text-tinta/50">
        <Link href="/" className="transition hover:text-naranjo">
          Inicio
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-tinta/70">{grupo.titulo}</span>
      </nav>

      <span className="etiqueta-seccion mt-4">Módulo</span>
      <h1 className="mt-2 font-condensed text-4xl font-bold uppercase leading-none text-tinta sm:text-5xl">
        {grupo.titulo}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-tinta/60">{grupo.descripcion}</p>

      <ul
        aria-label={`Submódulos de ${grupo.titulo}`}
        className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cartillas.map((c) => (
          <li key={c.clave}>
            <CartillaDeSubmodulo cartilla={c} />
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs text-tinta/40">
        {abribles === 1 ? "1 submódulo disponible" : `${abribles} submódulos disponibles`}
      </p>
    </div>
  );
}

function CartillaDeSubmodulo({ cartilla }: { cartilla: Cartilla }) {
  const { icono: Icono } = cartilla;
  const abierta = cartilla.href !== null;

  const cuerpo = (
    <>
      <div className="flex items-start gap-3.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            abierta ? "bg-naranjo/10 text-naranjo" : "bg-gris/10 text-gris"
          }`}
        >
          <Icono size={22} stroke={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-condensed text-lg font-bold uppercase leading-tight text-tinta">
              {abierta ? (
                // El enlace se estira sobre toda la cartilla (after:inset-0): así la cartilla entera
                // es clicable y, a la vez, los atajos de abajo pueden ser enlaces propios sin
                // anidar un <a> dentro de otro.
                cartilla.externo ? (
                  <a
                    href={cartilla.href!}
                    className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-naranjo"
                  >
                    {cartilla.nombre}
                  </a>
                ) : (
                  <Link
                    href={cartilla.href!}
                    className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-naranjo"
                  >
                    {cartilla.nombre}
                  </Link>
                )
              ) : (
                cartilla.nombre
              )}
            </h2>
            {cartilla.etiqueta && (
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cartilla.etiqueta.clases}`}
              >
                {cartilla.etiqueta.icono === "reloj" && <IconClock size={11} stroke={2} aria-hidden />}
                {cartilla.etiqueta.icono === "herramienta" && <IconTools size={11} stroke={2} aria-hidden />}
                {cartilla.etiqueta.texto}
              </span>
            )}
          </div>
          {cartilla.descripcion && (
            <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-tinta/60">{cartilla.descripcion}</p>
          )}
        </div>
        {abierta && (
          <IconArrowUpRight
            size={18}
            stroke={1.75}
            aria-hidden
            className="shrink-0 text-tinta/25 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-naranjo"
          />
        )}
      </div>

      {cartilla.secciones.length > 0 && (
        <div className="relative z-10 mt-4 flex flex-wrap gap-1.5 border-t border-borde pt-3.5">
          {cartilla.secciones.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-full border border-borde bg-crema/60 px-2.5 py-1 text-[12px] text-tinta/65 transition hover:border-naranjo/40 hover:bg-naranjo/10 hover:text-naranjo"
            >
              {s.nombre}
            </Link>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      className={`group relative flex h-full flex-col rounded-2xl border border-borde p-5 transition ${
        abierta
          ? "bg-superficie hover:-translate-y-0.5 hover:border-naranjo/30 hover:shadow-md"
          : "cursor-default bg-superficie/60 opacity-70"
      }`}
    >
      {cuerpo}
    </div>
  );
}
