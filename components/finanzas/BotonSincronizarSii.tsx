"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  probarAvisoAction,
  reenviarAvisoReclamosAction,
  sincronizarSiiAction,
} from "@/app/(protegido)/finanzas/sii/acciones";
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
 * De ahí los dos botones: uno para un mes puntual, y "Poner al día" para dejar parejo el
 * historial — que es una tarea de una vez, no de todos los días.
 *
 * TODO en UNA llamada, aunque sean varios meses. La primera versión hacía una llamada por
 * mes desde acá, y no aguanta: a partir del tercer Chromium la instancia de Vercel se
 * queda sin recursos y el navegador se muere antes del login. Reintentar desde el cliente
 * no lo arregla, porque la instancia sigue caliente. El servidor abre un navegador, hace
 * un login y recorre los meses adentro, guardando mes por mes.
 */

const CUANTOS_MESES = 4;

/** Los últimos meses, del más nuevo al más viejo. */
function ultimosPeriodos(
  cuantos = CUANTOS_MESES,
): { valor: string; rotulo: string }[] {
  const hoy = new Date();
  return Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      rotulo: new Intl.DateTimeFormat("es-CL", {
        month: "long",
        year: "numeric",
      }).format(d),
    };
  });
}

export default function BotonSincronizarSii() {
  const router = useRouter();
  const periodos = ultimosPeriodos();
  const rotuloDe = (valor: string) =>
    periodos.find((p) => p.valor === valor)?.rotulo ?? valor;
  const [periodo, setPeriodo] = useState(periodos[0].valor);
  const [pendiente, iniciarTransicion] = useTransition();
  const [paso, setPaso] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{
    texto: string;
    error?: boolean;
  } | null>(null);
  // Las columnas que trajo el CSV de ventas cuando NINGUNA sirve para derivar el estado.
  // Se muestran porque es el dato con el que se arregla, no un detalle de adorno.
  const [columnas, setColumnas] = useState<string[] | null>(null);

  const releer = (cuales: string[]) =>
    iniciarTransicion(async () => {
      setMensaje(null);
      setColumnas(null);
      setPaso(
        cuales.length === 1
          ? rotuloDe(cuales[0])
          : `${cuales.length} meses (${rotuloDe(cuales[cuales.length - 1])} a ${rotuloDe(cuales[0])})`,
      );
      try {
        const r = await sincronizarSiiAction(cuales);
        // La acción hace revalidatePath, pero eso invalida la caché del servidor: lo que
        // vuelve a pedir la tabla es esto. Sin el refresh se lee "9 ventas reclamadas" al
        // lado de una tabla que sigue diciendo "Registro" en todas, y el dato correcto ya
        // está en la base —pasó, y parecía que el arreglo no había servido—.
        router.refresh();
        if (r.columnasVenta) setColumnas(r.columnasVenta);
        const donde =
          r.leidos.length === cuales.length
            ? `${cuales.length === 1 ? rotuloDe(cuales[0]) : `${cuales.length} meses`}`
            : `${r.leidos.length} de ${cuales.length} meses`;
        if (!r.ok) {
          // El motivo REAL, en pantalla: una Server Action que lanza llega enmascarada, y
          // el mensaje había que ir a buscarlo a la base. Ahora viaja como dato.
          setMensaje({
            texto:
              `${r.error ?? "No se pudo consultar el SII."}` +
              (r.leidos.length > 0 ? ` Se alcanzó a guardar ${donde}.` : ""),
            error: true,
          });
          return;
        }
        setMensaje({
          texto:
            r.reclamos.length > 0
              ? `${donde}: ${r.reclamos.length} venta(s) reclamada(s) o rechazada(s) ` +
                `—folio ${r.reclamos.join(", ")}—. ` +
                // Se dice si el correo SALIÓ, no que se mandó. Antes decía "avisadas por
                // correo a Finanzas" siempre, supiera o no: el envío va por Graph y su
                // fallo se atrapaba en un console.error que nadie mira.
                (r.avisoEnviado
                  ? "Avisadas por correo a Finanzas."
                  : `EL CORREO A FINANZAS NO SALIÓ (${r.avisoError ?? "motivo desconocido"}). ` +
                    "Se avisó a soporte; las facturas están acá igual.")
              : // Se dice CUÁNTAS ventas se miraron: "ninguna reclamada" sobre cero ventas
                // no dice nada, y era lo que pasaba al releer solo el mes en curso.
                `${donde}: ${r.ventas} venta(s) leída(s), ninguna reclamada ni rechazada.`,
          error: r.reclamos.length > 0 && !r.avisoEnviado,
        });
      } finally {
        setPaso(null);
      }
    });

  /**
   * Reenviar el aviso de las reclamadas que ya están guardadas.
   *
   * El aviso automático manda solo los reclamos NUEVOS, así que si el correo falla una
   * vez, releer no lo reintenta: ya no hay nada nuevo. Pasó —nueve facturas por $121
   * millones que la pantalla dio por avisadas y a Finanzas no llegaron— y sin esto la
   * única salida era borrar el estado guardado para que volvieran a parecer nuevas.
   *
   * Con confirmación porque manda un correo de verdad a Finanzas.
   */
  const reenviar = (aPrueba = false) =>
    iniciarTransicion(async () => {
      setMensaje(null);
      setColumnas(null);
      setPaso(aPrueba ? "la prueba del aviso" : "el aviso a Finanzas");
      try {
        const r = aPrueba ? await probarAvisoAction() : await reenviarAvisoReclamosAction();
        setMensaje({
          texto: r.ok
            ? r.folios.length > 0
              ? `Aviso enviado a ${r.destinatario} con ${r.folios.length} factura(s): folio ` +
                `${r.folios.join(", ")}.`
              : (r.error ?? "No había nada que avisar.")
            : `El correo a ${r.destinatario} NO salió: ${r.error ?? "motivo desconocido"}`,
          error: !r.ok,
        });
      } finally {
        setPaso(null);
      }
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
      <button
        type="button"
        disabled={pendiente}
        onClick={() => releer([periodo])}
        className={claseBoton}
      >
        {pendiente && <RuedaCarga />}
        {pendiente ? "Consultando al SII…" : "↻ Releer período"}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => releer(periodos.map((p) => p.valor))}
        className={claseBoton}
        title={`Relee los últimos ${CUANTOS_MESES} meses en una sola pasada. Tarda varios minutos.`}
      >
        Poner al día {CUANTOS_MESES} meses
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => {
          if (
            window.confirm(
              "Se le va a enviar a Finanzas un correo con todas las ventas que hoy figuran " +
                "reclamadas o rechazadas. ¿Enviarlo?",
            )
          ) {
            reenviar();
          }
        }}
        className={claseBoton}
        title="Reenvía el aviso de las reclamadas ya guardadas. Sirve cuando el correo automático no salió."
      >
        Reenviar aviso a Finanzas
      </button>
      {/* Manda el MISMO correo a la dirección de prueba, para poder revisar la plantilla
          —y cómo llega fuera del tenant— sin escribirle a Finanzas. Sin confirmación: no
          le llega a nadie del trabajo. */}
      <button
        type="button"
        disabled={pendiente}
        onClick={() => reenviar(true)}
        className={claseBoton}
        title="Manda el mismo aviso, con las mismas facturas, a la dirección de prueba."
      >
        Probar aviso (a mi correo)
      </button>
      {/* Se dice cuánto tarda ANTES de apretar: son minutos y el botón parece colgado. */}
      <span
        className={`text-xs ${mensaje?.error ? "text-red-600" : "text-tinta/50"}`}
      >
        {paso === "el aviso a Finanzas" || paso === "la prueba del aviso"
          ? "Enviando el aviso…"
          : paso
            ? `Leyendo ${paso}… abre el navegador del SII y baja los CSV: un par de minutos por mes.`
            : mensaje
              ? mensaje.texto
              : "La corrida diaria cubre los últimos 15 días. Para los meses anteriores, ponelos al día una vez."}
      </span>
      {columnas && (
        <details className="basis-full text-xs text-tinta/60">
          <summary className="cursor-pointer">
            El CSV de ventas no trajo ninguna columna de acuse ni de reclamo.
            Trajo estas:
          </summary>
          <p className="mt-1 font-mono leading-relaxed break-words">
            {columnas.join(" · ")}
          </p>
        </details>
      )}
    </div>
  );
}
