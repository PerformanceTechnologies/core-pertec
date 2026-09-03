"use client";

import { useState, useTransition } from "react";
import { sincronizarSiiAction } from "@/app/(protegido)/finanzas/sii/acciones";
import RuedaCarga from "@/components/RuedaCarga";

/**
 * Releer el SII sin pasar por el cron.
 *
 * La corrida diaria mira los últimos 15 días, y eso alcanza para siempre: el cliente
 * tiene 8 días corridos para reclamar una factura, así que un documento más viejo que la
 * ventana ya no puede cambiar de estado. Lo que NO alcanza es el historial: las facturas
 * que se leyeron antes de que el panel supiera derivar el estado quedaron con el dato
 * viejo, y la corrida diaria nunca vuelve a mirarlas.
 *
 * De ahí los dos botones. "Releer período" es para un mes puntual. "Poner al día" pasa
 * por los últimos meses una vez y deja el historial parejo — que es una tarea de una vez,
 * no de todos los días.
 *
 * El recorrido va desde el navegador, un mes por llamada, y NO en una sola llamada con
 * varios períodos: el scraper abre un navegador, se loguea y baja un CSV por sub-pestaña,
 * así que un mes son minutos y la función tiene tope de 300 s. Tres meses juntos se
 * cortan a la mitad sin dejar registro de qué alcanzó a guardarse; así, cada mes es su
 * propia invocación con su propio tope y lo que se guardó queda guardado.
 *
 * Con una pausa entre meses y un reintento por mes, porque tres Chromium en treinta
 * segundos no los aguanta una instancia: el tercero murió con "Target page, context or
 * browser has been closed". La pausa le da lugar a la instancia para soltar el anterior,
 * y el reintento suele caer en otra. Un mes que falla dos veces NO corta el recorrido: se
 * anota y se sigue con los demás, que es lo contrario de lo que hacía antes.
 */

const CUANTOS_MESES = 6;
/** Aire entre meses para que la instancia suelte el Chromium anterior. */
const PAUSA_ENTRE_MESES = 8_000;
/** Antes de reintentar, más aire todavía: lo que se busca es caer en otra instancia. */
const PAUSA_ANTES_DE_REINTENTAR = 20_000;

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/** Los últimos meses, del más nuevo al más viejo. */
function ultimosPeriodos(cuantos = CUANTOS_MESES): { valor: string; rotulo: string }[] {
  const hoy = new Date();
  return Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(d),
    };
  });
}

interface Fallido {
  periodo: string;
  error: string;
}

/** Lo que se cuenta al terminar. Un texto armado a mano se vuelve inconsistente solo. */
function resumen(
  leidos: string[],
  ventas: number,
  reclamos: number[],
  fallidos: Fallido[],
  rotuloDe: (valor: string) => string,
): string {
  const donde =
    leidos.length === 0
      ? "Ningún mes"
      : leidos.length === 1
        ? rotuloDe(leidos[0])
        : `${leidos.length} meses (${rotuloDe(leidos[leidos.length - 1])} a ${rotuloDe(leidos[0])})`;
  const bien =
    reclamos.length > 0
      ? `${donde}: ${reclamos.length} venta(s) reclamada(s) —folio ${reclamos.join(", ")}—, ` +
        "avisadas por correo a Finanzas."
      : // Se dice CUÁNTAS ventas se miraron: "ninguna reclamada" sobre cero ventas no
        // dice nada, y era lo que pasaba —se releía el mes en curso, que tenía una sola—.
        `${donde}: ${ventas} venta(s) leída(s), ninguna reclamada.`;
  if (fallidos.length === 0) return bien;
  // El motivo REAL, en pantalla. Antes llegaba el error genérico de Server Components y
  // había que ir a buscar el mensaje a la base para saber qué había pasado.
  const detalle = fallidos.map((f) => `${rotuloDe(f.periodo)} (${f.error})`).join("; ");
  return `${bien} No se pudo leer: ${detalle}. Se puede reintentar solo ese mes.`;
}

export default function BotonSincronizarSii() {
  const periodos = ultimosPeriodos();
  const rotuloDe = (valor: string) => periodos.find((p) => p.valor === valor)?.rotulo ?? valor;
  const [periodo, setPeriodo] = useState(periodos[0].valor);
  const [pendiente, iniciarTransicion] = useTransition();
  const [paso, setPaso] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null);
  // Las columnas que trajo el CSV de ventas cuando NINGUNA sirve para derivar el estado.
  // Se muestran porque es el dato con el que se arregla, no un detalle de adorno.
  const [columnas, setColumnas] = useState<string[] | null>(null);

  /** Recorre los períodos en orden, uno por llamada, y cuenta lo que encontró. */
  const releer = (cuales: string[]) =>
    iniciarTransicion(async () => {
      setMensaje(null);
      setColumnas(null);
      let ventas = 0;
      const reclamos: number[] = [];
      const leidos: string[] = [];
      const fallidos: Fallido[] = [];
      const donde = (i: number, cual: string) =>
        cuales.length > 1 ? `${i + 1} de ${cuales.length} · ${rotuloDe(cual)}` : rotuloDe(cual);

      for (const [i, cual] of cuales.entries()) {
        if (i > 0) await esperar(PAUSA_ENTRE_MESES);
        setPaso(donde(i, cual));
        let r = await sincronizarSiiAction(cual);
        if (!r.ok) {
          // Un reintento, con pausa: el fallo típico es que la instancia no aguantó otro
          // Chromium, y el segundo intento suele caer en otra.
          setPaso(`${donde(i, cual)} · reintentando`);
          await esperar(PAUSA_ANTES_DE_REINTENTAR);
          r = await sincronizarSiiAction(cual);
        }
        if (r.ok) {
          leidos.push(cual);
          ventas += r.ventas;
          reclamos.push(...r.reclamos);
          if (r.columnasVenta) setColumnas(r.columnasVenta);
        } else {
          // Se ANOTA y se sigue: un mes que no salió no puede dejar sin leer a los demás.
          fallidos.push({ periodo: cual, error: r.error ?? "no se pudo consultar el SII" });
        }
      }
      setPaso(null);
      setMensaje({
        texto: resumen(leidos, ventas, reclamos, fallidos, rotuloDe),
        error: fallidos.length > 0 && leidos.length === 0,
      });
    });

  const claseBoton =
    "inline-flex h-9 items-center gap-2 rounded-lg border border-borde bg-superficie px-3 " +
    "text-xs font-semibold uppercase tracking-wide text-tinta transition " +
    "hover:border-naranjo/50 hover:text-naranjo disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={periodo}
        onChange={(e) => setPeriodo(e.target.value)}
        disabled={pendiente}
        className="h-9 rounded-lg border border-borde bg-superficie px-3 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:opacity-50"
      >
        {periodos.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.rotulo}
          </option>
        ))}
      </select>
      <button type="button" disabled={pendiente} onClick={() => releer([periodo])} className={claseBoton}>
        {pendiente && <RuedaCarga />}
        {pendiente ? "Consultando al SII…" : "↻ Releer período"}
      </button>
      <button
        type="button"
        disabled={pendiente}
        // Del más viejo al más nuevo: si se corta a la mitad, lo que quedó al día es lo
        // más viejo, que es justamente lo que la corrida diaria no vuelve a mirar.
        onClick={() => releer(periodos.map((p) => p.valor).reverse())}
        className={claseBoton}
        title={`Relee los últimos ${CUANTOS_MESES} meses, uno por uno. Tarda varios minutos.`}
      >
        Poner al día {CUANTOS_MESES} meses
      </button>
      {/* Se dice cuánto tarda ANTES de apretar: son minutos y el botón parece colgado. */}
      <span className={`text-xs ${mensaje?.error ? "text-red-600" : "text-tinta/50"}`}>
        {paso
          ? `Leyendo ${paso}… abre el navegador del SII y baja los CSV: un par de minutos por mes.`
          : mensaje
            ? mensaje.texto
            : "La corrida diaria cubre los últimos 15 días. Para los meses anteriores, ponelos al día una vez."}
      </span>
      {columnas && (
        <details className="basis-full text-xs text-tinta/60">
          <summary className="cursor-pointer">
            El CSV de ventas no trajo ninguna columna de acuse ni de reclamo. Trajo estas:
          </summary>
          <p className="mt-1 font-mono leading-relaxed break-words">{columnas.join(" · ")}</p>
        </details>
      )}
    </div>
  );
}
