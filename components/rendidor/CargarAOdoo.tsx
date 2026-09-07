"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProveedorOdoo } from "@/lib/rendidor/odoo";
import type { FondoOdoo } from "@/lib/rendidor/fondos";
import type { GastoRendicion, Rendicion } from "@/lib/rendidor/tipos";
import { desgloseDeGasto } from "@/lib/rendidor/iva";
import { leerRespuesta, mapaConTope } from "@/lib/rendidor/red";
import { SOMBRA_CALIDA } from "@/lib/estilos";
import RuedaCarga from "@/components/RuedaCarga";
import Avisos, { type Aviso } from "@/components/rendidor/Avisos";

/**
 * Los dos pasos que van entre "revisar los gastos" y "quedar cargado en Odoo".
 *
 * 1 · PROVEEDOR de cada gasto, obligatorio: `pertec_proveedor_id` no puede quedar vacío,
 *     así que ninguno pasa sin decisión. Solo se piden los que tienen algo que decidir
 *     —varios candidatos parecidos en Odoo—; los que se resolvieron solos y los que se
 *     van a crear se cuentan en una línea, porque no hay nada que hacer con ellos.
 * 2 · FONDO POR RENDIR, opcional: agrupa los gastos de una misma entrega de fondos. Una
 *     rendición puede no venir de ningún fondo, así que "sin fondo" es una respuesta
 *     válida y es la que viene marcada.
 *
 * Vive en su propia página (../rendir-gastos/[id]/odoo). Los candidatos y los fondos
 * llegan resueltos desde el servidor: acá no hay ningún botón de "buscar" que apretar ni
 * estado que se pierda al recargar.
 */

/** Un adjunto a la vez es lento y cinco saturan Odoo: cada uno hace dos llamadas XML-RPC. */
const ADJUNTOS_EN_PARALELO = 2;

const money = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

/** Lo que se decidió para el proveedor de un gasto. */
interface Decision {
  candidatos: ProveedorOdoo[];
  /** El partner de Odoo elegido, o null si todavía no se eligió. */
  elegido: number | null;
  /** No existe en Odoo: se crea al cargar. */
  crear: boolean;
  esPersonaNatural: boolean;
}

/** El total que va a quedar en Odoo: neto + IVA, no el impreso. Ver adjuntar. */
function totalEnOdoo(gasto: GastoRendicion): number {
  try {
    const d = desgloseDeGasto(gasto);
    if (d) return d.neto + d.iva;
  } catch {
    // Un gasto al que le falta un dato para el desglose no se puede verificar contra
    // Odoo, y no es acá donde se avisa: la carga lo rechaza antes con su motivo.
  }
  return 0;
}

export default function CargarAOdoo({
  rendicion,
  candidatos,
  fondos,
  errorFondos,
}: {
  rendicion: Rendicion;
  candidatos: { gastoId: string; candidatos: ProveedorOdoo[] }[];
  fondos: FondoOdoo[];
  errorFondos: string | null;
}) {
  const router = useRouter();

  const [decisiones, setDecisiones] = useState<Record<string, Decision>>(() => {
    const inicial: Record<string, Decision> = {};
    for (const c of candidatos) {
      inicial[c.gastoId] = {
        candidatos: c.candidatos,
        // Un solo candidato se autoselecciona; varios los elige quien rinde.
        elegido: c.candidatos.length === 1 ? c.candidatos[0].id : null,
        crear: c.candidatos.length === 0,
        esPersonaNatural: false,
      };
    }
    return inicial;
  });

  const [fondoElegido, setFondoElegido] = useState<number | null>(null);
  const [creandoFondo, setCreandoFondo] = useState(false);
  const [nombreFondo, setNombreFondo] = useState("");
  const [listaFondos, setListaFondos] = useState(fondos);
  const [cargando, setCargando] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  const avisar = (aviso: Omit<Aviso, "id"> & { clave?: string }) => {
    const id = aviso.clave ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAvisos((prev) => [{ ...aviso, id }, ...prev.filter((a) => a.id !== id)]);
  };
  const cerrarAviso = (id: string) => setAvisos((prev) => prev.filter((a) => a.id !== id));

  const gastoDe = (gastoId: string) => rendicion.gastos.find((g) => g.id === gastoId);

  // Los tres grupos. Solo el primero se dibuja: los otros dos se cuentan.
  const porDecidir = rendicion.gastos.filter((g) => {
    const d = decisiones[g.id];
    return d && d.candidatos.length > 0 && d.elegido === null;
  });
  const resueltos = rendicion.gastos.filter((g) => decisiones[g.id]?.elegido !== null && decisiones[g.id]);
  const aCrear = rendicion.gastos.filter((g) => decisiones[g.id]?.crear && !decisiones[g.id]?.elegido);

  const total = useMemo(
    () => rendicion.gastos.reduce((suma, g) => suma + totalEnOdoo(g), 0),
    [rendicion.gastos],
  );

  const elegir = (gastoId: string, partnerId: number | null) =>
    setDecisiones((prev) => ({
      ...prev,
      [gastoId]: { ...prev[gastoId], elegido: partnerId, crear: partnerId === null && prev[gastoId].candidatos.length === 0 },
    }));

  const crearFondo = async () => {
    const nombre = nombreFondo.trim();
    if (!nombre) {
      avisar({ tono: "error", clave: "fondo", titulo: "Ponele un nombre al fondo" });
      return;
    }
    setCreandoFondo(true);
    try {
      const resp = await fetch("/api/rendidor/fondos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: rendicion.odooEmployeeId,
          companyId: rendicion.empresaCompanyId,
          descripcion: nombre,
          monto: rendicion.montoAsignado,
        }),
      });
      const { fondo } = (await leerRespuesta(resp)) as unknown as { fondo: FondoOdoo };
      // Se agrega a la lista y queda elegido: crear uno y tener que buscarlo en el
      // desplegable sería un paso de más sobre algo que se acaba de hacer.
      setListaFondos((prev) => [fondo, ...prev]);
      setFondoElegido(fondo.id);
      setNombreFondo("");
      avisar({ tono: "ok", clave: "fondo", titulo: "Fondo creado", detalle: fondo.nombre });
    } catch (e) {
      avisar({
        tono: "error",
        clave: "fondo",
        titulo: "No se pudo crear el fondo",
        detalle: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCreandoFondo(false);
    }
  };

  const cargar = async () => {
    if (!rendicion.odooEmployeeId) {
      avisar({
        tono: "error",
        clave: "faltan",
        titulo: "Esta rendición no tiene empleado de Odoo",
        detalle: "Se elige al crearla. Sin empleado, Odoo rechaza el gasto.",
      });
      return;
    }
    if (porDecidir.length > 0) {
      avisar({
        tono: "error",
        clave: "faltan",
        titulo: `Falta elegir el proveedor de ${porDecidir.length} gasto(s)`,
        detalle: "Es obligatorio: Odoo no acepta un gasto sin proveedor.",
      });
      return;
    }

    setCargando(true);
    try {
      const proveedores = rendicion.gastos.map((g) => {
        const d = decisiones[g.id];
        return d.elegido
          ? { gastoId: g.id, partnerId: d.elegido }
          : {
              gastoId: g.id,
              crear: {
                nombre: g.proveedor ?? "",
                rut: g.rutProveedor,
                esPersonaNatural: d.esPersonaNatural,
              },
            };
      });

      const resp = await fetch(`/api/rendidor/${rendicion.id}/cargar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: rendicion.odooEmployeeId,
          proveedores,
          advanceId: fondoElegido,
        }),
      });
      const json = (await leerRespuesta(resp)) as unknown as {
        creados: { gastoId: string; expenseId: number }[];
      };

      // Los respaldos, de a dos: cada uno adjunta y además verifica contra Odoo, así que
      // en fila son 2N round-trips encadenados. Lo que falle se junta y se avisa; los
      // gastos YA están creados, así que esto no se reintenta solo.
      const problemas: string[] = [];
      const adjuntos = await mapaConTope(json.creados, ADJUNTOS_EN_PARALELO, async (c) => {
        const gasto = gastoDe(c.gastoId);
        if (!gasto?.archivoPath) {
          return [`El gasto ${c.expenseId} no tiene comprobante guardado. Subilo a mano en Odoo.`];
        }
        const r = await fetch("/api/rendidor/adjuntar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expenseId: c.expenseId,
            archivoPath: gasto.archivoPath,
            nombre: gasto.archivoNombre,
            totalEsperado: totalEnOdoo(gasto),
          }),
        });
        const j = (await leerRespuesta(r)) as unknown as { problemas?: string[] };
        return (j.problemas ?? []).map((p) => `Gasto ${c.expenseId}: ${p}`);
      });
      adjuntos.forEach((r, i) => {
        const expenseId = json.creados[i].expenseId;
        problemas.push(
          ...(r.ok
            ? r.valor
            : [`Gasto ${expenseId}: ${r.error instanceof Error ? r.error.message : "falló el adjunto."}`]),
        );
      });

      // La planilla se cuelga del PRIMER gasto: es un documento de toda la rendición, y
      // duplicarlo en los N gastos sería ruido para quien revisa en Odoo.
      const primero = json.creados[0];
      if (primero) {
        try {
          const r = await fetch(`/api/rendidor/${rendicion.id}/excel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expenseId: primero.expenseId }),
          });
          await leerRespuesta(r);
        } catch (e) {
          problemas.push(
            `La planilla no se pudo adjuntar a Odoo: ${e instanceof Error ? e.message : "error"}. ` +
              "Descargala desde la rendición y súbila a mano.",
          );
        }
      }

      // Se vuelve al detalle, que es donde vive el resultado de la carga: la rendición ya
      // quedó "cargada a Odoo" y esta página no tiene nada más que hacer.
      const cola = problemas.length > 0 ? `?revisar=${encodeURIComponent(problemas.join("\n"))}` : "";
      router.push(`/rendir-gastos/${rendicion.id}${cola}`);
    } catch (e) {
      avisar({
        tono: "error",
        clave: "odoo",
        titulo: "No se pudo cargar a Odoo",
        detalle: e instanceof Error ? e.message : undefined,
      });
      setCargando(false);
    }
  };

  return (
    <div className="animar-entrada max-w-[820px]">
      <span className="etiqueta-seccion">Rendir Gastos</span>
      <h1 className="mt-2 font-condensed text-3xl font-bold uppercase leading-none tracking-tight text-tinta sm:text-4xl">
        Cargar a Odoo
      </h1>
      <p className="mt-2 text-sm text-tinta/60">
        {rendicion.tituloRendicion} · {rendicion.gastos.length} gasto(s)
        {/* El total solo si se pudo calcular: a un gasto al que le falta el tipo de
            documento no se le puede sacar el desglose, y un "$0" en el encabezado se lee
            como que la rendición no tiene monto. El motivo lo dice la carga al
            rechazarla. */}
        {total > 0 && ` · ${money(total)}`}
      </p>

      {/* PASO 1 — el proveedor de cada gasto */}
      <div className={`mt-6 rounded-2xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
        <p className="font-condensed text-lg font-bold tracking-tight text-tinta">1 · Proveedor</p>

        {porDecidir.length === 0 ? (
          <p className="mt-1 text-sm text-teal">Todos resueltos. No hay nada que elegir.</p>
        ) : (
          <p className="mt-1 max-w-[70ch] text-xs text-pretty text-tinta/55">
            {/* Se dice POR QUÉ hay que elegir: sin esto, la pregunta se lee como un trámite
                y quien la responde no sabe qué está decidiendo. */}
            {porDecidir.length === 1
              ? "Este gasto tiene más de un proveedor parecido en Odoo. Elegí cuál es: el gasto queda colgado de ese proveedor."
              : `Estos ${porDecidir.length} gastos tienen más de un proveedor parecido en Odoo. Elegí cuál es en cada uno: el gasto queda colgado de ese proveedor.`}
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-2">
          {porDecidir.map((g) => {
            const d = decisiones[g.id];
            return (
              <li key={g.id} id={`proveedor-${g.id}`} className="rounded-lg border border-red-600/45 bg-red-50 px-3 py-2.5">
                <p className="text-sm font-medium text-tinta">
                  {g.orden}. {g.proveedor?.trim() || "(sin proveedor)"}{" "}
                  <span className="text-xs text-tinta/45">{g.rutProveedor ?? "sin RUT"}</span>
                </p>
                <select
                  value={d.elegido ?? ""}
                  onChange={(e) => elegir(g.id, Number(e.target.value) || null)}
                  aria-invalid={d.elegido === null}
                  aria-label={`Proveedor del gasto ${g.orden}`}
                  className="mt-1.5 w-full rounded border border-red-600/60 bg-superficie px-2 py-1.5 text-sm ring-1 ring-red-600/25"
                >
                  <option value="">— elegir proveedor —</option>
                  {d.candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.vat ? ` · ${c.vat}` : ""}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>

        {/* Los que no piden nada se CUENTAN, no se listan: dieciséis filas que solo dicen
            "está bien" esconden las tres que hay que mirar. El detalle queda a un clic. */}
        {(resueltos.length > 0 || aCrear.length > 0) && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-tinta/50 hover:text-naranjo">
              {resueltos.length > 0 && `${resueltos.length} ya resuelto(s)`}
              {resueltos.length > 0 && aCrear.length > 0 && " · "}
              {aCrear.length > 0 && `${aCrear.length} se van a crear en Odoo`}
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {[...resueltos, ...aCrear].map((g) => {
                const d = decisiones[g.id];
                const elegido = d.candidatos.find((c) => c.id === d.elegido);
                return (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tinta/70">
                    <span className="text-tinta/40">{g.orden}.</span>
                    <span>{g.proveedor?.trim() || "(sin proveedor)"}</span>
                    {elegido ? (
                      <span className="text-teal">→ {elegido.name}</span>
                    ) : (
                      <>
                        <span className="text-naranjo">→ se crea</span>
                        <label className="flex items-center gap-1.5 text-tinta/60">
                          <input
                            type="checkbox"
                            checked={d.esPersonaNatural}
                            onChange={(e) =>
                              setDecisiones((prev) => ({
                                ...prev,
                                [g.id]: { ...prev[g.id], esPersonaNatural: e.target.checked },
                              }))
                            }
                          />
                          Es persona natural
                        </label>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>

      {/* PASO 2 — el fondo, opcional */}
      <div className={`mt-4 rounded-2xl border border-borde bg-superficie p-5 ${SOMBRA_CALIDA}`}>
        <p className="font-condensed text-lg font-bold tracking-tight text-tinta">
          2 · Fondo por rendir <span className="text-sm font-normal text-tinta/45">· opcional</span>
        </p>
        <p className="mt-1 max-w-[70ch] text-xs text-pretty text-tinta/55">
          Si estos gastos salen de un fondo entregado, elegilo y quedan agrupados ahí en Odoo. Si no, dejalo
          sin fondo.
        </p>

        {errorFondos ? (
          <p className="mt-3 rounded-lg border border-naranjo/25 bg-naranjo/5 px-3 py-2 text-xs text-naranjo">
            No se pudieron leer los fondos de Odoo ({errorFondos}). Se puede cargar sin fondo y asociarlo
            después en Odoo.
          </p>
        ) : (
          <>
            <select
              value={fondoElegido ?? ""}
              onChange={(e) => setFondoElegido(Number(e.target.value) || null)}
              aria-label="Fondo por rendir"
              className="mt-3 w-full rounded-md border border-borde bg-superficie px-2.5 py-2 text-sm"
            >
              <option value="">Sin fondo</option>
              {listaFondos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>

            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-borde pt-3">
              <div className="min-w-[14rem] flex-1">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
                  O creá uno nuevo
                </label>
                <input
                  value={nombreFondo}
                  onChange={(e) => setNombreFondo(e.target.value)}
                  placeholder={rendicion.tituloRendicion}
                  className="mt-1 w-full rounded-md border border-borde bg-superficie px-2.5 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={crearFondo}
                disabled={creandoFondo || !nombreFondo.trim()}
                aria-busy={creandoFondo}
                className="inline-flex items-center gap-2 rounded-md border border-borde bg-superficie px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo disabled:opacity-40"
              >
                {creandoFondo && <RuedaCarga />}
                Crear fondo
              </button>
            </div>
          </>
        )}
      </div>

      {/* La acción, sola al final: es la única que escribe en Odoo. */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        {porDecidir.length > 0 && (
          <span className="mr-auto text-xs font-semibold text-red-700">
            Falta elegir {porDecidir.length} proveedor(es)
          </span>
        )}
        <button
          type="button"
          onClick={cargar}
          disabled={cargando || porDecidir.length > 0}
          aria-busy={cargando}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-teal px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-teal/85 disabled:opacity-40 sm:w-auto"
        >
          {cargando && <RuedaCarga />}
          {cargando ? "Cargando a Odoo..." : `Crear ${rendicion.gastos.length} gasto(s) en Odoo`}
        </button>
      </div>

      <Avisos avisos={avisos} alCerrar={cerrarAviso} />
    </div>
  );
}
