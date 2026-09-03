"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sincronizarSiiAction } from "@/app/(protegido)/finanzas/sii/acciones";
import RuedaCarga from "@/components/RuedaCarga";
import { MESES_QUE_SE_RELEEN, ultimosPeriodos } from "@/lib/finanzas-periodos";

/**
 * Releer el SII sin pasar por el cron.
 *
 * Las corridas automáticas ya releen los últimos MESES_QUE_SE_RELEEN meses completos,
 * cada dos horas durante el día, así que estos botones no son la vía normal: son para
 * pedirlo AHORA y ver el resultado sin esperar la próxima corrida. El del período suelto
 * sirve además para un mes que quedó fuera de esa ventana.
 *
 * TODO en UNA llamada, aunque sean varios meses. La primera versión hacía una llamada por
 * mes desde acá, y no aguanta: a partir del tercer Chromium la instancia de Vercel se
 * queda sin recursos y el navegador se muere antes del login. Reintentar desde el cliente
 * no lo arregla, porque la instancia sigue caliente. El servidor abre un navegador, hace
 * un login y recorre los meses adentro, guardando mes por mes.
 */

/**
 * Los MISMOS meses que releen las corridas, del más nuevo al más viejo para el selector.
 *
 * Salen de lib/finanzas-periodos.ts y no de un cálculo propio: con su propia cuenta, el
 * selector ofrecía cuatro meses el día que el cron pasara a leer tres.
 */
function paraElSelector(): { valor: string; rotulo: string }[] {
  return ultimosPeriodos(new Date())
    .map((valor) => {
      const [anio, mes] = valor.split("-").map(Number);
      return {
        valor,
        rotulo: new Intl.DateTimeFormat("es-CL", {
          month: "long",
          year: "numeric",
        }).format(new Date(anio, mes - 1, 1)),
      };
    })
    .reverse();
}

export default function BotonSincronizarSii() {
  const router = useRouter();
  const periodos = paraElSelector();
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
              ? `${donde}: ${r.reclamos.length} venta(s) reclamada(s) o rechazada(s) sin ` +
                `avisar —folio ${r.reclamos.join(", ")}—. ` +
                // Se dice si el correo SALIÓ, no que se mandó. Antes decía "avisadas por
                // correo a Finanzas" siempre, supiera o no: el envío va por Graph y su
                // fallo se atrapaba en un console.error que nadie mira.
                (r.avisoEnviado
                  ? "Avisadas por correo a Finanzas."
                  : `EL CORREO A FINANZAS NO SALIÓ (${r.avisoError ?? "motivo desconocido"}). ` +
                    "Se avisó a soporte; las facturas están acá igual.")
              : // Se dice CUÁNTAS ventas se miraron: "ninguna reclamada" sobre cero ventas
                // no dice nada, y era lo que pasaba al releer solo el mes en curso.
                `${donde}: ${r.ventas} venta(s) leída(s). Sin rechazos nuevos por avisar.`,
          error: r.reclamos.length > 0 && !r.avisoEnviado,
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
        title={`Relee los últimos ${MESES_QUE_SE_RELEEN} meses ahora, sin esperar la próxima corrida. Tarda un par de minutos.`}
      >
        Releer {MESES_QUE_SE_RELEEN} meses ahora
      </button>
      {/* Se dice cuánto tarda ANTES de apretar: son minutos y el botón parece colgado. */}
      <span
        className={`text-xs ${mensaje?.error ? "text-red-600" : "text-tinta/50"}`}
      >
        {paso
          ? `Leyendo ${paso}… abre el navegador del SII y baja los CSV: un par de minutos por mes.`
          : mensaje
            ? mensaje.texto
            : `El SII se relee solo cada dos horas, los últimos ${MESES_QUE_SE_RELEEN} meses completos. Estos botones son para pedirlo ahora.`}
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
