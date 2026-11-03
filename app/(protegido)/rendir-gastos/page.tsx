import Link from "next/link";
import { IconCash, IconClipboardCheck, IconFileSpreadsheet, IconReceipt2 } from "@tabler/icons-react";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import { puedeVerRendicionesAjenas, saldoRendicion } from "@/lib/permisos-rendidor";
import { listarPersonas, listarRendiciones } from "@/lib/rendidor/datos";
import ListaRendiciones from "@/components/rendidor/ListaRendiciones";
import NuevaRendicion from "@/components/rendidor/NuevaRendicion";
import { money } from "@/components/rendidor/Visual";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import { eliminarRendicionAction } from "./acciones";

export const dynamic = "force-dynamic";

export default async function RendirGastosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { usuario, rol } = await exigirAccesoRendidor();
  const { ver } = await searchParams;
  // Quien administra gastos ve las de todos: es quien las revisa, aprueba y paga.
  const revisa = puedeVerRendicionesAjenas(usuario.rol, rol);
  const [rendiciones, personas] = await Promise.all([
    listarRendiciones({ usuarioId: usuario.id, correo: usuario.correo, verTodas: revisa }),
    revisa ? listarPersonas() : Promise.resolve(undefined),
  ]);
  const yo = { correo: usuario.correo.toLowerCase(), nombre: usuario.nombre || usuario.correo.split("@")[0] };

  const de = (e: string) => rendiciones.filter((r) => r.estado === e);
  const suma = (rs: typeof rendiciones) => rs.reduce((s, r) => s + r.totalGastos, 0);
  const mias = rendiciones.filter((r) => r.esMia);
  const enMano = mias.filter((r) => r.estado === "borrador" || r.estado === "rechazada");
  const porRevisar = de("enviada");
  const porPagar = de("aprobada");
  const anio = String(new Date().getFullYear());
  const pagadoAnio = suma(de("pagada").filter((r) => r.pagadaEn?.startsWith(anio)));
  // Lo que la empresa le debe a quien rinde, de lo ya aprobado y sin pagar.
  const aReembolsar = porPagar.reduce((s, r) => s + Math.max(0, saldoRendicion(r.totalGastos, r.montoAsignado)), 0);
  const faltaApiKey = !process.env.ANTHROPIC_API_KEY;

  return (
    <div className="animar-entrada space-y-7">
      <header className="mb-1 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconReceipt2 size={23} stroke={1.75} />
        </span>
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Rendir gastos</h1>
          <p className="text-sm text-gris">Boletas y facturas, revisión, aprobación y reembolso</p>
        </div>
      </header>

      {/* ── Banda principal ── */}
      <section className="banda-contraste overflow-hidden rounded-2xl px-6 py-7 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <span className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-naranjo">
              <span className="h-px w-6 bg-naranjo" /> {revisa ? "Gastos de la empresa" : "Mis gastos"}
            </span>
            <p className="texto-banda mt-3 font-condensed text-5xl font-bold leading-none tracking-tight tabular-nums sm:text-6xl">
              {money(revisa ? suma(porRevisar) + suma(porPagar) : suma(enMano) + suma(mias.filter((r) => r.estado === "enviada" || r.estado === "aprobada")))}
            </p>
            <p className="texto-banda-65 mt-3 max-w-xl text-sm">
              {revisa
                ? `Por resolver: ${porRevisar.length} ${porRevisar.length === 1 ? "rendición" : "rendiciones"} en revisión y ${porPagar.length} aprobada${porPagar.length === 1 ? "" : "s"} por pagar.`
                : "Lo que tienes rendido y todavía no se paga: en borrador, en revisión o aprobado."}
            </p>
          </div>
          <dl className="borde-banda grid grid-cols-2 gap-x-8 gap-y-5 rounded-xl border px-5 py-4 sm:grid-cols-4 lg:min-w-[34rem]">
            <Cifra etiqueta={revisa ? "Mis borradores" : "Borradores"} valor={String(enMano.length)} />
            <Cifra etiqueta="En revisión" valor={String(porRevisar.length)} alerta={revisa && porRevisar.length > 0} />
            <Cifra etiqueta="Por reembolsar" valor={money(aReembolsar)} />
            <Cifra etiqueta={`Pagado ${anio}`} valor={money(pagadoAnio)} />
          </dl>
        </div>
      </section>

      {faltaApiKey && (
        <p className="rounded-xl border-l-[3px] border-naranjo bg-naranjo/[0.06] px-4 py-3 text-xs text-naranjo">
          Falta configurar <code className="font-mono">ANTHROPIC_API_KEY</code>: los comprobantes no se van a leer solos, pero se pueden completar a mano.
        </p>
      )}

      {/* ── Accesos rápidos ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <NuevaRendicion yo={yo} personas={personas} comoTarjeta />
        {revisa ? (
          <Acceso href="/rendir-gastos?ver=enviada" titulo="Por revisar" detalle={`${porRevisar.length} esperando tu aprobación`} Icono={IconClipboardCheck} tono="bg-sky-500/10 text-sky-600" destacado={porRevisar.length > 0} />
        ) : (
          <Acceso href="/rendir-gastos?ver=rechazada" titulo="Rechazadas" detalle="Corrige y vuelve a enviar" Icono={IconClipboardCheck} tono="bg-rose-500/10 text-rose-600" destacado={de("rechazada").length > 0} />
        )}
        {revisa ? (
          <Acceso href="/rendir-gastos?ver=aprobada" titulo="Por pagar" detalle={`${porPagar.length} aprobada${porPagar.length === 1 ? "" : "s"} · ${money(aReembolsar)}`} Icono={IconCash} tono="bg-emerald-500/10 text-emerald-600" />
        ) : (
          <Acceso href="/rendir-gastos?ver=pagada" titulo="Pagadas" detalle="Lo que ya te reembolsaron" Icono={IconFileSpreadsheet} tono="bg-emerald-500/10 text-emerald-600" />
        )}
      </div>

      {/* ── Cómo funciona ── */}
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gris">
        {["Crea la rendición y sube las boletas", "Revisa lo que se leyó de cada una", "Envíala a revisión", "Se aprueba y se te reembolsa"].map((t, i) => (
          <li key={t} className="flex items-center gap-1.5">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-naranjo/12 text-[10px] font-bold text-naranjo">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>

      <ListaRendiciones
        key={ver ?? "todas"}
        rendiciones={rendiciones}
        revisa={revisa}
        filtroInicial={(["borrador", "enviada", "rechazada", "aprobada", "pagada", "cargada_odoo"] as const).find((e) => e === ver) ?? "todas"}
        borrar={eliminarRendicionAction}
      />
    </div>
  );
}

function Cifra({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className={`mt-1 font-condensed text-3xl font-bold tabular-nums ${alerta ? "text-naranjo" : "texto-banda"}`}>{valor}</dd>
    </div>
  );
}

function Acceso({
  href, titulo, detalle, Icono, tono, destacado = false,
}: {
  href: string; titulo: string; detalle: string; Icono: typeof IconCash; tono: string; destacado?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`group flex items-center gap-3 rounded-2xl border bg-superficie p-3.5 transition hover:-translate-y-0.5 hover:border-naranjo/40 ${destacado ? "border-naranjo/50" : "border-borde"} ${SOMBRA_CALIDA}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tono}`}>
        <Icono size={20} stroke={1.75} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-tinta">{titulo}</span>
        <span className="block truncate text-[11px] text-gris">{detalle}</span>
      </span>
    </Link>
  );
}
