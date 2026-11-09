import Link from "next/link";
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsExchange,
  IconBuildingWarehouse,
  IconCertificate,
  IconCircleCheck,
  IconClockHour4,
  IconPackageExport,
  IconPackageImport,
  IconTableImport,
} from "@tabler/icons-react";
import { lineasDeValor, listarProductosConStock, reporteReabastecimiento, tablero } from "@/lib/inventario";
import {
  ETIQUETA_CERTIFICADO,
  ETIQUETA_CLASE,
  diasHasta,
  estadoCertificado,
  formatearCantidad,
  formatearMonto,
  resumirValorizacion,
} from "@/lib/inventario-modelo";
import { SOMBRA_CALIDA, TARJETA } from "@/lib/estilos";
import { ChipEstado, IconoClase } from "@/components/inventario/Visual";

export const dynamic = "force-dynamic";

const COLORES_BODEGA = ["#c85217", "#0f766e", "#b08419", "#4f46e5", "#0284c7", "#be185d"];

const ACCIONES = [
  { href: "/inventario/operaciones/nueva?clase=recepcion", titulo: "Recepción", detalle: "Entra mercadería", Icono: IconPackageImport, tono: "bg-emerald-500/10 text-emerald-600" },
  { href: "/inventario/operaciones/nueva?clase=entrega", titulo: "Entrega", detalle: "Sale a faena o cliente", Icono: IconPackageExport, tono: "bg-sky-500/10 text-sky-600" },
  { href: "/inventario/operaciones/nueva?clase=interna", titulo: "Transferencia", detalle: "Mover entre ubicaciones", Icono: IconArrowsExchange, tono: "bg-violet-500/10 text-violet-600" },
  { href: "/inventario/ajustes", titulo: "Ajuste", detalle: "Corregir con un conteo", Icono: IconAdjustmentsHorizontal, tono: "bg-amber-500/10 text-amber-600" },
  { href: "/inventario/importar", titulo: "Carga masiva", detalle: "Desde Excel o CSV", Icono: IconTableImport, tono: "bg-naranjo/10 text-naranjo" },
];

export default async function TableroInventarioPage() {
  const [t, productos, reab, lineas] = await Promise.all([tablero(), listarProductosConStock(), reporteReabastecimiento(), lineasDeValor()]);
  const valor = resumirValorizacion(lineas);

  // Lo que pide atención: bajo mínimo, certificados y productos vencidos o por vencer.
  const certificados = productos
    .map((p) => ({ p, estado: estadoCertificado(p) }))
    .filter(({ estado }) => estado === "falta" || estado === "vencido" || estado === "por_vencer" || estado === "sin_fecha");
  const vencimientos = productos
    .map((p) => ({ p, dias: diasHasta(p.fechaVencimiento) }))
    .filter((x): x is { p: (typeof productos)[number]; dias: number } => x.dias !== null && x.dias <= 30)
    .sort((a, b) => a.dias - b.dias);
  const alertas = reab.length + certificados.length + vencimientos.length;

  return (
    <div className="space-y-7">
      {/* ── Banda principal ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> Inventario hoy
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
              {formatearMonto(t.valorInventario)}
            </p>
            <p className="texto-banda-65 mt-3 text-sm">
              Valor a costo de {valor.productos.length} {valor.productos.length === 1 ? "producto con stock" : "productos con stock"} en{" "}
              {valor.porBodega.length} {valor.porBodega.length === 1 ? "bodega" : "bodegas"}.
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border px-5 py-4 sm:grid-cols-4 lg:min-w-[34rem]">
            <Cifra etiqueta="Productos" valor={String(t.productos)} href="/inventario/productos" />
            <Cifra etiqueta="Unidades" valor={formatearCantidad(valor.unidades)} href="/inventario/valorizacion" />
            <Cifra etiqueta="Pendientes" valor={String(t.transferenciasPendientes)} href="/inventario/operaciones" />
            <Cifra etiqueta="Alertas" valor={String(alertas)} alerta={alertas > 0} href="#alertas" />
          </dl>
        </div>
      </header>

      {/* ── Acciones rápidas ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ACCIONES.map(({ href, titulo, detalle, Icono, tono }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 transition hover:-translate-y-0.5 hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tono}`}>
              <Icono size={20} stroke={1.75} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-tinta">{titulo}</span>
              <span className="line-clamp-2 block text-[11px] leading-snug text-gris">{detalle}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-7">
          {/* ── Bodegas ── */}
          <Seccion titulo="Bodegas" icono={<IconBuildingWarehouse size={15} />} enlace={{ href: "/inventario/valorizacion", texto: "Ver valorización" }}>
            {valor.porBodega.length === 0 ? (
              <Vacio>Sin stock cargado todavía. Empieza con una recepción o con la carga masiva.</Vacio>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {valor.porBodega.map((b, i) => {
                  const color = COLORES_BODEGA[i % COLORES_BODEGA.length];
                  return (
                    <Link
                      key={b.id}
                      href={`/inventario/valorizacion?bodega=${b.id}`}
                      className={`group relative overflow-hidden rounded-2xl border border-borde bg-superficie p-4 transition hover:-translate-y-0.5 hover:border-naranjo/40 ${SOMBRA_CALIDA}`}
                    >
                      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                      <p className="truncate text-sm font-bold text-tinta">{b.nombre}</p>
                      <p className="mt-2 font-condensed text-2xl font-bold tabular-nums text-tinta">{formatearMonto(b.valor)}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-tinta/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${b.participacion * 100}%`, background: color }} />
                      </div>
                      <p className="mt-2 text-[11px] text-gris">
                        {b.productos} {b.productos === 1 ? "producto" : "productos"} · {formatearCantidad(b.unidades)} un. ·{" "}
                        {(b.participacion * 100).toLocaleString("es-CL", { maximumFractionDigits: 0 })}%
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </Seccion>

          {/* ── Últimas operaciones ── */}
          <Seccion titulo="Últimas operaciones" icono={<IconClockHour4 size={15} />} enlace={{ href: "/inventario/operaciones", texto: "Ver todas" }}>
            {t.recientes.length === 0 ? (
              <Vacio>Todavía no hay operaciones. Crea una recepción o entrega con los botones de arriba.</Vacio>
            ) : (
              <ul className={`${TARJETA} divide-y divide-borde overflow-hidden`}>
                {t.recientes.map((r) => (
                  <li key={r.id}>
                    <Link href={`/inventario/operaciones/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-tinta/[0.02]">
                      <IconoClase clase={r.clase} chico />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="font-mono font-bold text-tinta">{r.referencia}</span>
                          <span className="ml-2 text-gris">{ETIQUETA_CLASE[r.clase]}</span>
                        </p>
                        <p className="truncate text-xs text-gris">
                          {r.contraparte ? `${r.contraparte} · ` : ""}
                          {r.nLineas} {r.nLineas === 1 ? "línea" : "líneas"} · {new Date(r.creadoEn).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <ChipEstado estado={r.estado} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </div>

        {/* ── Alertas ── */}
        <div id="alertas">
          <Seccion titulo="Requiere atención" icono={<IconAlertTriangle size={15} />}>
            {alertas === 0 ? (
              <div className={`${TARJETA} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
                <IconCircleCheck size={34} stroke={1.5} className="text-emerald-500" />
                <p className="text-sm font-semibold text-tinta">Todo en orden</p>
                <p className="text-xs text-gris">Nada bajo mínimo, sin certificados pendientes ni productos por vencer.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reab.length > 0 && (
                  <GrupoAlerta titulo="Bajo el mínimo" cuenta={reab.length} tono="text-rose-600" href="/inventario/reabastecimiento">
                    {reab.slice(0, 5).map((f) => (
                      <FilaAlerta
                        key={`${f.producto.id}-${f.ubicacion?.id ?? "general"}`}
                        href={`/inventario/productos/${f.producto.id}`}
                        titulo={f.producto.nombre}
                        detalle={`${f.ubicacion?.nombre ?? "Todas las bodegas"} · hay ${formatearCantidad(f.disponible)} de ${formatearCantidad(f.minimo)}`}
                        etiqueta={`Reponer ${formatearCantidad(f.sugerido)}`}
                        tono="bg-rose-500/10 text-rose-600"
                      />
                    ))}
                  </GrupoAlerta>
                )}
                {certificados.length > 0 && (
                  <GrupoAlerta titulo="Certificados" cuenta={certificados.length} tono="text-amber-600" icono={<IconCertificate size={14} />}>
                    {certificados.slice(0, 5).map(({ p, estado }) => (
                      <FilaAlerta
                        key={p.id}
                        href={`/inventario/productos/${p.id}`}
                        titulo={p.nombre}
                        detalle={p.certificadoVence ? `Vence el ${new Date(`${p.certificadoVence}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}` : "Sin documento o sin fecha"}
                        etiqueta={ETIQUETA_CERTIFICADO[estado]!.texto}
                        tono={ETIQUETA_CERTIFICADO[estado]!.tono}
                      />
                    ))}
                  </GrupoAlerta>
                )}
                {vencimientos.length > 0 && (
                  <GrupoAlerta titulo="Productos por vencer" cuenta={vencimientos.length} tono="text-amber-600">
                    {vencimientos.slice(0, 5).map(({ p, dias }) => (
                      <FilaAlerta
                        key={p.id}
                        href={`/inventario/productos/${p.id}`}
                        titulo={p.nombre}
                        detalle={`${formatearCantidad(p.aMano)} a mano`}
                        etiqueta={dias < 0 ? "Vencido" : dias === 0 ? "Vence hoy" : `En ${dias} d`}
                        tono={dias < 0 ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-700"}
                      />
                    ))}
                  </GrupoAlerta>
                )}
              </div>
            )}
          </Seccion>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── piezas ─────────────────────────────

function Cifra({ etiqueta, valor, href, alerta = false }: { etiqueta: string; valor: string; href: string; alerta?: boolean }) {
  return (
    <Link href={href} className="group">
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className={`mt-1 font-condensed text-3xl font-bold tabular-nums transition group-hover:text-naranjo ${alerta ? "text-naranjo" : "texto-banda"}`}>{valor}</dd>
    </Link>
  );
}

function Seccion({
  titulo,
  icono,
  enlace,
  children,
}: {
  titulo: string;
  icono: React.ReactNode;
  enlace?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
          {icono} {titulo}
        </h2>
        <span className="h-px flex-1 bg-borde" />
        {enlace && (
          <Link href={enlace.href} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gris transition hover:text-naranjo">
            {enlace.texto} <IconArrowRight size={13} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-borde px-4 py-8 text-center text-sm text-gris">{children}</p>;
}

function GrupoAlerta({
  titulo,
  cuenta,
  tono,
  href,
  icono,
  children,
}: {
  titulo: string;
  cuenta: number;
  tono: string;
  href?: string;
  icono?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`${TARJETA} overflow-hidden`}>
      <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
        <p className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${tono}`}>
          {icono} {titulo} · {cuenta}
        </p>
        {href && (
          <Link href={href} className="text-[11px] font-semibold text-gris hover:text-naranjo">
            Ver todo
          </Link>
        )}
      </div>
      <ul className="divide-y divide-borde">{children}</ul>
    </div>
  );
}

function FilaAlerta({ href, titulo, detalle, etiqueta, tono }: { href: string; titulo: string; detalle: string; etiqueta: string; tono: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-tinta/[0.02]">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-tinta">{titulo}</p>
          <p className="truncate text-[11px] text-gris">{detalle}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tono}`}>{etiqueta}</span>
      </Link>
    </li>
  );
}
