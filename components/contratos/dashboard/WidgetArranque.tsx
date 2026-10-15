import Link from "@/components/contratos/Enlace";
import { IconCoin, IconTruck } from "@tabler/icons-react";
import CajaDeWidget, { VacioDeWidget } from "./CajaDeWidget";
import { Barrita, BarraPartida, BarrasHorizontales, ColumnasPorMes, Pastilla, type FilaDeBarra, type Tramo } from "./graficos";
import {
  pesosCompactos,
  tonoDePlazo,
  type PartidaDestacada,
  type ResumenDeArranqueDelTablero,
  type Tono,
} from "@/lib/contratos/dashboard-modelo";
import { MODULOS, faseDe, formatearPesos, type Fase } from "@/lib/contratos/arranque-modelo";
import { textoDePlazo, type LecturaDePlazo } from "@/lib/contratos/plazos-modelo";

/**
 * Cada estado toma un color de su fase —inicio, en curso, hecho, fuera de la cuenta—, y los que
 * comparten fase se distinguen por tono. Así el verde siempre es «hecho» y el gris siempre es
 * «cancelado», en Logística y en Gastos por igual.
 */
const PALETA_DE_FASE: Record<Fase, string[]> = {
  inicio: ["#a5b4fc", "#818cf8"],
  // Gastos tiene cuatro estados «en curso» (cotizando, con cotizaciones, aprobado, OC emitida):
  // con solo dos tonos se repetían y la barra no se podía leer.
  curso: [
    "var(--color-cian)",
    "color-mix(in srgb, var(--color-cian) 55%, var(--color-azul-suave))",
    "var(--color-azul-suave)",
    "var(--color-azul)",
  ],
  final: ["var(--etapa-validado)", "#34d399"],
  fuera: ["var(--color-borde)", "var(--color-gris-suave)"],
};

function tramosDeEstados(datos: ResumenDeArranqueDelTablero): Tramo[] {
  const usados: Record<Fase, number> = { inicio: 0, curso: 0, final: 0, fuera: 0 };
  return datos.porEstado.map((e) => {
    const fase = faseDe(datos.modulo, e.clave);
    const paleta = PALETA_DE_FASE[fase];
    const color = paleta[Math.min(usados[fase]++, paleta.length - 1)];
    return { clave: e.clave, etiqueta: e.etiqueta, valor: e.cantidad, color };
  });
}

function tonoDeDias(dias: number | null): Tono {
  if (dias === null) return "neutro";
  return dias < 0 ? "critico" : dias <= 7 ? "aviso" : "curso";
}

function textoDeDias(dias: number | null): string {
  if (dias === null) return "sin fecha";
  if (dias === 0) return "hoy";
  if (dias < 0) return `hace ${-dias} d`;
  return `en ${dias} d`;
}

/** «2026-10-15» → «15» y «oct», para el cuadrito de fecha de una lista. */
function diaYMes(fecha: string | null): { dia: string; mes: string } {
  if (!fecha) return { dia: "—", mes: "" };
  const [, m, d] = fecha.split("-");
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return { dia: String(Number(d)), mes: MESES[Number(m) - 1] ?? "" };
}

function ListaDePartidas({
  titulo,
  partidas,
  modulo,
  conFecha,
}: {
  titulo: string;
  partidas: PartidaDestacada[];
  modulo: "logistica" | "gastos";
  conFecha: boolean;
}) {
  if (partidas.length === 0) return null;
  const ruta = MODULOS[modulo].ruta;

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">{titulo}</h3>
      <ul className="-mx-2 space-y-0.5">
        {partidas.map((p) => {
          const { dia, mes } = diaYMes(p.fecha);
          const exceso = (p.real ?? 0) - (p.presupuestado ?? 0);
          return (
            <li key={p.id}>
              <Link href={`${ruta}/${p.id}`} className="dash-fila-enlace flex items-center gap-3 rounded-lg px-2 py-1.5 transition">
                {conFecha ? (
                  <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg bg-cian-lavado leading-none text-azul">
                    <span className="text-sm font-extrabold tabular-nums">{dia}</span>
                    <span className="text-[9px] font-bold uppercase">{mes}</span>
                  </span>
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cian-lavado text-[11px] font-extrabold tabular-nums text-azul">
                    {String(p.numero).padStart(2, "0")}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{p.descripcion}</span>
                  <span className="block truncate text-[11px] text-gris">{p.categoria}</span>
                </span>
                {conFecha ? (
                  <Pastilla tono={tonoDeDias(p.dias)}>{textoDeDias(p.dias)}</Pastilla>
                ) : (
                  <span className="shrink-0 text-right">
                    <span className="block text-xs font-bold tabular-nums text-tinta">{pesosCompactos(p.real ?? p.presupuestado)}</span>
                    {exceso > 0 && <span className="block text-[10px] font-bold text-red-600">+{pesosCompactos(exceso)}</span>}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Gastos: el presupuesto contra lo comprometido y lo pagado, y el reparto por ítem.
 *
 * Cuatro cifras, una barra partida (pagado · comprometido sin pagar · por comprometer · disponible)
 * y cada ítem contra su presupuesto. Es lo mismo que ve el módulo, en chico.
 */
function PresupuestoEnElTablero({ datos: p }: { datos: NonNullable<ResumenDeArranqueDelTablero["presupuesto"]> }) {
  const definido = p.total !== null;
  const tramos: Tramo[] = [
    { clave: "pagado", etiqueta: "Pagado", valor: p.pagado, color: "var(--etapa-validado)" },
    { clave: "comprometido", etiqueta: "Comprometido sin pagar", valor: Math.max(0, p.comprometido - p.pagado), color: "var(--color-azul-suave)" },
    { clave: "por", etiqueta: "Por comprometer", valor: p.porComprometer, color: "var(--color-cian)" },
    { clave: "queda", etiqueta: "Disponible", valor: p.total === null ? 0 : Math.max(0, p.total - p.proyectado), color: "var(--color-borde)" },
  ];

  const items: FilaDeBarra[] = p.items
    .filter((i) => i.presupuesto !== null || i.lineas > 0)
    .sort((a, b) => b.proyectado - a.proyectado)
    .slice(0, 6)
    .map((i) => ({
      clave: i.id,
      etiqueta: i.nombre,
      detalle: `${i.lineas} ${i.lineas === 1 ? "línea" : "líneas"}${i.sobre ? " · sobre presupuesto" : ""}`,
      valor: i.comprometido,
      referencia: i.presupuesto !== null && i.presupuesto > 0 ? i.presupuesto : undefined,
      texto: `${pesosCompactos(i.comprometido)}${i.presupuesto !== null ? ` / ${pesosCompactos(i.presupuesto)}` : ""}`,
      tono: i.sobre ? "critico" : "curso",
    }));

  const cifras = [
    { etiqueta: "Presupuesto", valor: p.total, ayuda: definido ? undefined : "sin definir" },
    { etiqueta: "Comprometido", valor: p.comprometido },
    { etiqueta: "Pagado", valor: p.pagado },
    { etiqueta: "Disponible", valor: p.disponible },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cifras.map((c) => (
          <div key={c.etiqueta} className="min-w-0 rounded-lg bg-fondo px-3 py-2" title={c.valor === null ? undefined : formatearPesos(c.valor)}>
            <span
              className={`block truncate text-lg font-extrabold leading-none tabular-nums ${
                c.etiqueta === "Disponible" && c.valor !== null && c.valor < 0 ? "text-red-600" : "text-tinta"
              }`}
            >
              {c.valor === null ? "—" : pesosCompactos(c.valor)}
            </span>
            <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-gris">{c.etiqueta}</span>
          </div>
        ))}
      </div>

      {(p.proyectado > 0 || definido) && (
        <div>
          <BarraPartida tramos={tramos} alto={12} titulo="Presupuesto, comprometido y pagado" />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {tramos.map((t) => (
              <span key={t.clave} className="flex items-center gap-1.5 text-[11px] text-gris">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.etiqueta}
              </span>
            ))}
          </div>
        </div>
      )}

      {p.enRiesgo && p.disponibleProyectado !== null && (
        <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Con las mejores cotizaciones, el gasto supera el presupuesto por {formatearPesos(-p.disponibleProyectado)}.
        </p>
      )}

      {items.length > 0 && (
        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">Por ítem · comprometido contra presupuesto</h3>
          <BarrasHorizontales filas={items} />
        </div>
      )}

      {(p.pendientes.esperandoRespuesta > 0 || p.ahorroLogrado > 0) && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gris">
          {p.pendientes.esperandoRespuesta > 0 && (
            <span>
              <b className="text-tinta">{p.pendientes.esperandoRespuesta}</b> cotizaciones esperando respuesta
              {p.pendientes.respuestaAtrasada > 0 && (
                <b className="text-amber-600"> ({p.pendientes.respuestaAtrasada} atrasadas)</b>
              )}
            </span>
          )}
          {p.ahorroLogrado > 0 && (
            <span>
              Ahorro por comparar: <b className="text-emerald-600">{pesosCompactos(p.ahorroLogrado)}</b>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * Logística o Gastos de arranque: el mismo widget con la mirada de cada uno.
 *
 * Los dos son una lista de partidas con estados, así que arrancan igual: una barra partida por
 * estado. Después se separan en lo que importa de cada uno: en Logística CUÁNDO (qué se necesita
 * pronto y qué ya se atrasó) y en Gastos CUÁNTO (lo presupuestado contra lo real, por mes y por
 * categoría).
 */
export default function WidgetArranque({
  datos,
  plazo,
}: {
  datos: ResumenDeArranqueDelTablero;
  plazo: LecturaDePlazo | null;
}) {
  const config = MODULOS[datos.modulo];
  const esGastos = datos.modulo === "gastos";
  const r = datos.resumen;
  // El presupuesto solo existe en Gastos y solo si se pudo leer: sin él cae al resumen de antes.
  const p = esGastos ? datos.presupuesto : undefined;
  const tramos = tramosDeEstados(datos);
  const icono = esGastos ? <IconCoin size={18} stroke={1.8} /> : <IconTruck size={18} stroke={1.8} />;

  const subtitulo =
    r.avance.total === 0
      ? `Sin ${config.plural} todavía`
      : p && p.total !== null
        ? `${pesosCompactos(p.comprometido)} comprometidos de ${pesosCompactos(p.total)} · ${r.avance.subidos} de ${r.avance.total} ${config.unidad}`
        : `${r.avance.subidos} de ${r.avance.total} ${config.unidad}${r.alertas > 0 ? ` · ${r.alertas} ${config.etiquetaAlerta}` : ""}`;

  if (datos.total === 0) {
    return (
      <CajaDeWidget titulo={config.titulo} subtitulo={subtitulo} icono={icono} href={config.ruta} derecha={plazo && <Pastilla tono={tonoDePlazo(plazo)}>{textoDePlazo(plazo)}</Pastilla>}>
        <VacioDeWidget
          icono={icono}
          titulo={`Todavía no hay ${config.plural}`}
          texto={config.descripcion}
          accion={
            <Link
              href={`${config.ruta}/nueva`}
              className="inline-flex min-h-10 items-center rounded-lg bg-azul px-4 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-azul-suave"
            >
              Crear {config.singular}
            </Link>
          }
        />
      </CajaDeWidget>
    );
  }

  // Gastos: lo real contra lo presupuestado, por categoría. La marca es el presupuesto.
  const filasDeCategoria: FilaDeBarra[] = datos.porCategoria.map((c) =>
    esGastos
      ? {
          clave: c.nombre,
          etiqueta: c.nombre,
          detalle: `${c.partidas} ${c.partidas === 1 ? config.singular : config.plural}`,
          valor: c.real,
          referencia: c.presupuestado > 0 ? c.presupuestado : undefined,
          texto: `${pesosCompactos(c.real)}${c.presupuestado > 0 ? ` / ${pesosCompactos(c.presupuestado)}` : ""}`,
          tono: c.presupuestado > 0 && c.real > c.presupuestado ? "critico" : "curso",
        }
      : {
          clave: c.nombre,
          etiqueta: c.nombre,
          valor: c.partidas,
          texto: String(c.partidas),
          tono: "curso",
        },
  );

  const ejecucion = r.presupuestado === 0 ? 0 : Math.round((r.real / r.presupuestado) * 100);

  return (
    <CajaDeWidget
      titulo={config.titulo}
      subtitulo={subtitulo}
      icono={icono}
      href={config.ruta}
      derecha={plazo && <Pastilla tono={tonoDePlazo(plazo)}>{textoDePlazo(plazo)}</Pastilla>}
    >
      <div className="space-y-5">
        {p && <PresupuestoEnElTablero datos={p} />}

        {esGastos && !p && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { etiqueta: "Presupuestado", valor: r.presupuestado, titulo: formatearPesos(r.presupuestado) },
              { etiqueta: "Registrado", valor: r.real, titulo: formatearPesos(r.real) },
              { etiqueta: "Pagado", valor: r.cerrado, titulo: formatearPesos(r.cerrado) },
            ].map((d) => (
              <div key={d.etiqueta} className="min-w-0 rounded-lg bg-fondo px-3 py-2" title={d.titulo}>
                <span className="block truncate text-lg font-extrabold leading-none tabular-nums text-tinta">
                  {pesosCompactos(d.valor)}
                </span>
                <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-gris">{d.etiqueta}</span>
              </div>
            ))}
            <div className="col-span-3">
              <div className="mb-1 flex items-baseline justify-between text-[11px]">
                <span className="font-semibold text-gris">Ejecución del presupuesto</span>
                <span className="font-bold tabular-nums text-tinta">{r.presupuestado === 0 ? "—" : `${ejecucion}%`}</span>
              </div>
              <Barrita valor={Math.min(ejecucion, 100)} tono={ejecucion > 100 ? "critico" : ejecucion >= 85 ? "aviso" : "curso"} />
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">Por estado</h3>
          <BarraPartida tramos={tramos} alto={12} titulo={`${config.plural} por estado`} />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {tramos.map((t) => (
              <span key={t.clave} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-gris">{t.etiqueta}</span>
                <span className="tabular-nums font-bold text-tinta">{t.valor}</span>
              </span>
            ))}
          </div>
        </div>

        {esGastos && !p && datos.porMes.length > 0 && (
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gris">Por mes</h3>
              <span className="flex items-center gap-3 text-[11px] text-gris">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "color-mix(in srgb, var(--color-cian) 60%, var(--color-superficie))" }} />
                  Presupuestado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-azul-suave" />
                  Real
                </span>
              </span>
            </div>
            <ColumnasPorMes
              meses={datos.porMes.map((m) => ({ etiqueta: m.etiqueta, a: m.presupuestado, b: m.real }))}
              formato={pesosCompactos}
              nombreA="Presupuestado"
              nombreB="Real"
            />
          </div>
        )}

        {filasDeCategoria.length > 0 && !p && (
          <div>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">
              {esGastos ? "Por categoría · real contra presupuesto" : "Por categoría"}
            </h3>
            <BarrasHorizontales filas={filasDeCategoria} />
          </div>
        )}

        {!esGastos && (
          <ListaDePartidas titulo="Próximos requerimientos" partidas={datos.proximas} modulo="logistica" conFecha />
        )}
        {esGastos && datos.enAlerta.length > 0 && (
          <ListaDePartidas titulo="Sobre presupuesto" partidas={datos.enAlerta} modulo="gastos" conFecha={false} />
        )}
        {esGastos && datos.enAlerta.length === 0 && (
          <ListaDePartidas titulo="Mayores gastos" partidas={datos.proximas.slice(0, 3)} modulo="gastos" conFecha={false} />
        )}
      </div>
    </CajaDeWidget>
  );
}
