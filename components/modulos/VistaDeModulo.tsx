import Link from "next/link";
import { Suspense } from "react";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBuildingSkyscraper,
  IconCircleCheck,
  IconClock,
  IconTools,
  type Icon,
} from "@tabler/icons-react";
import { SECCIONES_DE_MODULO, type GrupoDelMenu, type ItemDelMenu } from "@/lib/menu-modelo";
import { iconoDeModulo } from "@/lib/iconos-menu";
import { obtenerIcono } from "@/lib/iconos";
import { clasesInsigniaEstado, etiquetaEstado } from "@/lib/colores";
import { SOMBRA_CALIDA, TARJETA } from "@/lib/estilos";
import {
  claveDeResumen,
  type Aviso,
  type Metrica,
  type ResumenOpcional,
  type Tono,
} from "@/lib/modulos-resumen-modelo";

/**
 * Las cifras de cada submódulo, por la clave de claveDeResumen. Son PROMESAS a propósito: cada
 * panel se dibuja al instante con su encabezado y sus atajos, y sus cifras entran cuando
 * llegan (Suspense). Un submódulo lento —Microsoft Graph, el SII— no retiene a los demás ni a la
 * página. Ver lib/modulos-resumen.ts, que garantiza que ninguna promesa rechaza.
 */
export type Resumenes = ReadonlyMap<string, Promise<ResumenOpcional>>;

/** Un submódulo del módulo abierto, con sus atajos a lo que tiene adentro. */
interface Cartilla {
  clave: string;
  /** La clave para buscar sus cifras en `Resumenes`; null si no tiene (externo, próximamente). */
  claveResumen: string | null;
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
  const claveResumen = claveDeResumen(item);
  if (item.tipo === "pronto") {
    return {
      clave: `pronto-${item.nombre}`,
      claveResumen,
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
      claveResumen,
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
    claveResumen,
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

// ─── Estilos de los tonos ────────────────────────────────────────────────────

const CLASE_DE_TONO: Record<Tono, string> = {
  neutro: "text-tinta",
  ok: "text-tinta",
  aviso: "tono-aviso",
  alerta: "tono-alerta",
};

const TEXTO_DE_TONO: Record<Tono, string> = {
  neutro: "",
  ok: "En orden",
  aviso: "Conviene revisar",
  alerta: "Requiere atención",
};

/** El ícono que acompaña al tono: el color nunca va solo. */
function IconoDeTono({ tono, tamano = 16 }: { tono: Tono; tamano?: number }) {
  if (tono === "alerta") return <IconAlertTriangle size={tamano} stroke={2} aria-hidden />;
  if (tono === "aviso") return <IconClock size={tamano} stroke={2} aria-hidden />;
  if (tono === "ok") return <IconCircleCheck size={tamano} stroke={2} aria-hidden className="tono-ok" />;
  return null;
}

// ─── La página ───────────────────────────────────────────────────────────────

/**
 * La página de un módulo: una banda con lo esencial, lo que pide atención y un panel por submódulo
 * con sus cifras y sus atajos.
 *
 * Solo dibuja: de qué módulo se trata, qué ve la persona y de dónde salen los números lo resuelve
 * la página (app/(protegido)/modulos/[grupo]/page.tsx) y lib/modulos-resumen.ts. Los `contratos`
 * son los de «Contratos», que se muestran como atajos dentro de su panel.
 *
 * `empresaSinDatos`: la empresa activa todavía no tiene nada cargado en los módulos (ver
 * tieneDatosCargados). Los paneles se dibujan igual, con su descripción y sus atajos, pero sin
 * cifras: mostrar las de PERTEC parado en otra empresa sería mostrarle a Zeus los datos de PERTEC.
 */
export default function VistaDeModulo({
  grupo,
  contratos = [],
  resumenes,
  empresaSinDatos = null,
}: {
  grupo: GrupoDelMenu;
  contratos?: { slug: string; nombre: string }[];
  resumenes: Resumenes;
  empresaSinDatos?: string | null;
}) {
  const cartillas = grupo.items.map((item) => aCartilla(item, contratos));
  const abribles = cartillas.filter((c) => c.href).length;
  const conCifras = cartillas.some((c) => c.claveResumen && resumenes.has(c.claveResumen));
  // Un solo panel ocupa todo el ancho (y reparte sus cifras en fila); varios, de a dos.
  const ancho = cartillas.length === 1 ? "completo" : "mitad";

  return (
    <div className="animar-entrada space-y-4">
      <nav aria-label="Ruta" className="flex items-center gap-1.5 text-xs text-tinta/60">
        <Link href="/" className="transition hover:text-naranjo">
          Inicio
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-tinta/80">{grupo.titulo}</span>
      </nav>

      {/* ── Banda del módulo ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex items-start gap-4">
            <FichaDelModulo icono={iconoDeModulo(grupo.slug)} />
            <div className="min-w-0">
              <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo-suave">
                <span className="h-px w-6 bg-naranjo-suave" aria-hidden /> Módulo
              </span>
              <h1 className="texto-banda mt-2 font-condensed text-4xl font-bold uppercase leading-none tracking-tight sm:text-5xl">
                {grupo.titulo}
              </h1>
              <p className="texto-banda-65 mt-3 max-w-xl text-sm">{grupo.descripcion}</p>
            </div>
          </div>

          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-3 rounded-xl border px-5 py-4 lg:min-w-[17rem]">
            <div>
              <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Submódulos</dt>
              <dd className="texto-banda mt-1 font-condensed text-3xl font-bold tabular-nums">{abribles}</dd>
            </div>
            {conCifras && !empresaSinDatos && (
              <div>
                <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Con avisos</dt>
                <dd className="mt-1 font-condensed text-3xl font-bold tabular-nums">
                  <Suspense fallback={<span className="texto-banda-30">…</span>}>
                    <CifraDeAvisos cartillas={cartillas} resumenes={resumenes} />
                  </Suspense>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      {empresaSinDatos && <AvisoSinDatos empresa={empresaSinDatos} />}

      {/* ── Lo que pide atención, de todos los submódulos juntos ── */}
      {conCifras && !empresaSinDatos && (
        <section aria-labelledby="atencion">
          <Encabezado id="atencion" icono={<IconAlertTriangle size={15} aria-hidden />} titulo="Requiere atención" />
          <Suspense fallback={<div className={`${TARJETA} h-[76px] animate-pulse motion-reduce:animate-none`} aria-hidden />}>
            <FranjaDeAtencion cartillas={cartillas} resumenes={resumenes} />
          </Suspense>
        </section>
      )}

      {/* ── Un panel por submódulo ── */}
      <section aria-labelledby="submodulos">
        <Encabezado id="submodulos" titulo="Submódulos" />
        <ul className={`grid grid-cols-1 gap-4 ${ancho === "mitad" ? "lg:grid-cols-2" : ""}`}>
          {cartillas.map((c) => (
            <li key={c.clave}>
              <PanelDeSubmodulo
                cartilla={c}
                ancho={ancho}
                resumen={!empresaSinDatos && c.claveResumen ? resumenes.get(c.claveResumen) : undefined}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function FichaDelModulo({ icono: Icono }: { icono: Icon }) {
  return (
    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
      <Icono size={28} stroke={1.6} aria-hidden />
    </span>
  );
}

function Encabezado({ id, titulo, icono }: { id: string; titulo: string; icono?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 id={id} className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/70">
        {icono} {titulo}
      </h2>
      <span className="h-px flex-1 bg-borde" aria-hidden />
    </div>
  );
}

function AvisoSinDatos({ empresa }: { empresa: string }) {
  return (
    <div role="status" className={`${TARJETA} flex items-start gap-3.5 p-5`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tinta/5 text-tinta/50">
        <IconBuildingSkyscraper size={20} stroke={1.75} aria-hidden />
      </span>
      <div>
        <p className="text-sm font-semibold text-tinta">Sin cifras para {empresa}</p>
        <p className="mt-0.5 text-sm text-tinta/60">
          Los módulos todavía no tienen información de esta empresa. Cambia de empresa arriba del menú para ver la de otra.
        </p>
      </div>
    </div>
  );
}

// ─── Atención ────────────────────────────────────────────────────────────────

interface FilaDeAviso {
  aviso: Aviso;
  submodulo: string;
}

/** Los avisos de todos los submódulos, los urgentes primero. Espera a todas las promesas. */
async function reunirAvisos(cartillas: Cartilla[], resumenes: Resumenes): Promise<FilaDeAviso[]> {
  const porSubmodulo = await Promise.all(
    cartillas.map(async (c) => {
      const resumen = c.claveResumen ? await resumenes.get(c.claveResumen) : null;
      return (resumen?.avisos ?? []).map((aviso) => ({ aviso, submodulo: c.nombre }));
    }),
  );
  return porSubmodulo.flat().sort((a, b) => Number(b.aviso.tono === "alerta") - Number(a.aviso.tono === "alerta"));
}

/** El número de la banda: cuántos avisos hay. Sale en naranjo si hay alguno. */
async function CifraDeAvisos({ cartillas, resumenes }: { cartillas: Cartilla[]; resumenes: Resumenes }) {
  const avisos = await reunirAvisos(cartillas, resumenes);
  return <span className={avisos.length > 0 ? "text-naranjo" : "texto-banda"}>{avisos.length}</span>;
}

async function FranjaDeAtencion({ cartillas, resumenes }: { cartillas: Cartilla[]; resumenes: Resumenes }) {
  const avisos = await reunirAvisos(cartillas, resumenes);

  if (avisos.length === 0) {
    return (
      <div className={`${TARJETA} flex items-center gap-3.5 px-5 py-4`}>
        <span className="tono-ok fondo-tono grid h-10 w-10 shrink-0 place-items-center rounded-xl">
          <IconCircleCheck size={20} stroke={1.9} aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-tinta">Todo en orden</p>
          <p className="text-sm text-tinta/60">Ningún submódulo de este módulo tiene algo pendiente por ahora.</p>
        </div>
      </div>
    );
  }

  return (
    <ul className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
      {avisos.map(({ aviso, submodulo }, i) => {
        const clase = aviso.tono === "alerta" ? "tono-alerta" : "tono-aviso";
        return (
          <li key={`${aviso.href}-${i}`}>
            <Link
              href={aviso.href}
              className="group flex min-h-14 items-center gap-3.5 px-4 py-3 transition hover:bg-tinta/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-naranjo"
            >
              <span className={`${clase} fondo-tono grid h-9 w-9 shrink-0 place-items-center rounded-lg`}>
                <IconoDeTono tono={aviso.tono} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-tinta">{aviso.texto}</span>
                <span className="block text-xs text-tinta/60">
                  <span className={`${clase} font-semibold`}>{TEXTO_DE_TONO[aviso.tono]}</span> · {submodulo}
                </span>
              </span>
              <IconArrowRight
                size={16}
                stroke={1.9}
                aria-hidden
                className="shrink-0 text-tinta/30 transition group-hover:translate-x-0.5 group-hover:text-naranjo motion-reduce:transition-none"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Un submódulo ────────────────────────────────────────────────────────────

function PanelDeSubmodulo({
  cartilla,
  ancho,
  resumen,
}: {
  cartilla: Cartilla;
  ancho: "completo" | "mitad";
  /** Las cifras que van a llegar; undefined: este submódulo no tiene cifras que mostrar. */
  resumen: Promise<ResumenOpcional> | undefined;
}) {
  const { icono: Icono } = cartilla;
  const abierta = cartilla.href !== null;

  return (
    <article
      className={`flex h-full flex-col rounded-xl border border-borde p-5 sm:p-6 ${
        abierta ? `bg-superficie ${SOMBRA_CALIDA}` : "bg-superficie/60 opacity-75"
      }`}
    >
      <header className="flex items-start gap-3.5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            abierta ? "bg-naranjo/10 text-naranjo" : "bg-gris/10 text-gris"
          }`}
        >
          <Icono size={22} stroke={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3 className="font-condensed text-xl font-bold uppercase leading-tight tracking-wide text-tinta">
              {cartilla.nombre}
            </h3>
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
            <p className="mt-1 text-sm leading-relaxed text-tinta/65">{cartilla.descripcion}</p>
          )}
        </div>
        {abierta && <BotonAbrir cartilla={cartilla} />}
      </header>

      {resumen && (
        <Suspense fallback={<EsqueletoDeCifras ancho={ancho} />}>
          <CifrasDelSubmodulo resumen={resumen} ancho={ancho} />
        </Suspense>
      )}

      {cartilla.secciones.length > 0 && (
        <div className="mt-5 border-t border-borde pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-tinta/60">Ir directo a</p>
          <ul className="flex flex-wrap gap-1.5">
            {cartilla.secciones.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="inline-flex min-h-8 items-center rounded-full border border-borde bg-crema/60 px-3 py-1 text-[12px] text-tinta/75 transition hover:border-naranjo/40 hover:bg-naranjo/10 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                >
                  {s.nombre}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function BotonAbrir({ cartilla }: { cartilla: Cartilla }) {
  const clases =
    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-borde px-3 text-xs font-semibold text-tinta/75 transition hover:border-naranjo/40 hover:bg-naranjo/10 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";
  const contenido = (
    <>
      Abrir <span className="sr-only">{cartilla.nombre}</span>
      <IconArrowRight size={14} stroke={2} aria-hidden />
    </>
  );
  return cartilla.externo ? (
    <a href={cartilla.href!} className={clases}>
      {contenido}
    </a>
  ) : (
    <Link href={cartilla.href!} className={clases}>
      {contenido}
    </Link>
  );
}

// ─── Cifras ──────────────────────────────────────────────────────────────────

const REJILLA = {
  completo: "grid-cols-2 md:grid-cols-4",
  mitad: "grid-cols-2",
} as const;

/** Reserva el espacio de las cifras mientras llegan: la página no salta al cargarlas. */
function EsqueletoDeCifras({ ancho }: { ancho: "completo" | "mitad" }) {
  return (
    <div className={`mt-5 grid gap-3 ${REJILLA[ancho]}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[92px] animate-pulse rounded-xl border border-borde bg-tinta/[0.04] motion-reduce:animate-none" />
      ))}
    </div>
  );
}

async function CifrasDelSubmodulo({ resumen, ancho }: { resumen: Promise<ResumenOpcional>; ancho: "completo" | "mitad" }) {
  const datos = await resumen;
  if (!datos || datos.metricas.length === 0) return null;

  return (
    <div className="mt-5">
      <ul className={`grid gap-3 ${REJILLA[ancho]}`}>
        {datos.metricas.map((m) => (
          <li key={m.etiqueta}>
            <Cifra metrica={m} />
          </li>
        ))}
      </ul>
      {datos.pie && <p className="mt-3 text-xs text-tinta/60">{datos.pie}</p>}
    </div>
  );
}

function Cifra({ metrica: m }: { metrica: Metrica }) {
  const tono = m.tono ?? "neutro";
  const cuerpo = (
    <>
      <span className="block text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-tinta/65">{m.etiqueta}</span>
      <span className={`mt-1.5 flex items-center gap-1.5 font-condensed text-[1.85rem] font-bold leading-none tabular-nums ${CLASE_DE_TONO[tono]}`}>
        {m.valor}
        <IconoDeTono tono={tono} tamano={17} />
        {TEXTO_DE_TONO[tono] && <span className="sr-only">{TEXTO_DE_TONO[tono]}</span>}
      </span>
      {m.detalle && <span className="mt-1.5 block text-xs leading-snug text-tinta/60">{m.detalle}</span>}
    </>
  );
  const base = "block h-full min-h-[92px] rounded-xl border border-borde bg-crema/50 p-3.5";
  return m.href ? (
    <Link
      href={m.href}
      className={`${base} transition hover:border-naranjo/40 hover:bg-naranjo/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo`}
    >
      {cuerpo}
    </Link>
  ) : (
    <div className={base}>{cuerpo}</div>
  );
}
