"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Inconsistencia, OfertaCanonica } from "@/lib/ofertas/tipos";
import { calcularTotales, detectarInconsistencias } from "@/lib/ofertas/verificar";
import { money } from "@/lib/cotizador/formato";
import { BOTON_PRIMARIO, TARJETA } from "@/lib/estilos";
import RuedaCarga from "@/components/RuedaCarga";

/**
 * Paso 2: revisar y corregir antes de emitir.
 *
 * Los controles se recalculan EN EL NAVEGADOR mientras se escribe, con la misma
 * función que corre el servidor (lib/ofertas/verificar.ts, sin "server-only"
 * justo para esto). Así corregir el número de oferta hace desaparecer su aviso al
 * instante, en vez de después de guardar: un aviso que no reacciona se aprende a
 * ignorar.
 *
 * Al guardar, el servidor los vuelve a calcular por su cuenta. Lo del navegador
 * es para la persona; lo que queda registrado lo decide el servidor.
 */

const ROTULOS: Record<Inconsistencia["tipo"], string> = {
  numero_oferta: "Número de oferta",
  suma_precios: "Suma de precios",
  linea_precio: "Línea de precio",
  dotacion: "Dotación",
  programa: "Programa",
  contenido_ajeno: "Contenido de otra oferta",
  falta_dato: "Falta un dato",
};

export default function EditorOferta({
  id,
  inicial,
  estado,
  archivoOrigen,
}: {
  id: string;
  inicial: OfertaCanonica;
  estado: "borrador" | "emitida";
  archivoOrigen: string | null;
}) {
  const router = useRouter();
  const [oferta, setOferta] = useState<OfertaCanonica>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emitida = estado === "emitida";

  const { totales, problemas } = useMemo(() => {
    const t = calcularTotales(oferta);
    return { totales: t, problemas: detectarInconsistencias(oferta, t, archivoOrigen ?? "") };
  }, [oferta, archivoOrigen]);

  const cambiar = (fn: (borrador: OfertaCanonica) => void) => {
    setOferta((previa) => {
      // Copia profunda: hay ediciones que tocan arrays anidados (las líneas de
      // precio), y mutar la referencia previa deja a React sin ver el cambio.
      const copia = structuredClone(previa) as OfertaCanonica;
      fn(copia);
      return copia;
    });
    setMensaje(null);
  };

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      const respuesta = await fetch(`/api/ofertas/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contenido: oferta }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo guardar.");
      setMensaje("Guardado.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const id_ = oferta.identificacion;

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        {/* ── Identificación ─────────────────────────────────────────── */}
        <section className={`${TARJETA} p-5`}>
          <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            Identificación
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ["numeroOferta", "Oferta N°"],
                ["fecha", "Fecha"],
                ["validez", "Validez"],
                ["cliente", "Cliente"],
                ["atencion", "Atención"],
                ["copia", "Copia"],
                ["faena", "Faena"],
              ] as const
            ).map(([campo, rotulo]) => (
              <Campo
                key={campo}
                rotulo={rotulo}
                valor={id_[campo] ?? ""}
                deshabilitado={emitida}
                onChange={(v) =>
                  cambiar((b) => {
                    b.identificacion[campo] = v || null;
                  })
                }
              />
            ))}
          </div>
          <Campo
            className="mt-3"
            rotulo="Referencia"
            valor={id_.referencia ?? ""}
            deshabilitado={emitida}
            multilinea
            onChange={(v) =>
              cambiar((b) => {
                b.identificacion.referencia = v || null;
              })
            }
          />
          <Campo
            className="mt-3"
            rotulo="Título del servicio"
            valor={oferta.titulo}
            deshabilitado={emitida}
            onChange={(v) =>
              cambiar((b) => {
                b.titulo = v;
              })
            }
          />
        </section>

        {/* ── Precio ─────────────────────────────────────────────────── */}
        {oferta.precio && (
          <section className={`${TARJETA} p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                Precio del servicio
              </h2>
              <span className="text-xs text-tinta/45">
                Total calculado{" "}
                <span className="font-semibold tabular-nums text-tinta">
                  {money(totales.totalNetoCalculado)}
                </span>
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {oferta.precio.lineas.map((linea, i) => (
                <div key={i} className="rounded-lg border border-borde bg-crema/40 p-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[70px_1fr_80px_130px]">
                    <Campo
                      rotulo="Cant"
                      valor={String(linea.cantidad)}
                      numerico
                      deshabilitado={emitida}
                      onChange={(v) =>
                        cambiar((b) => {
                          b.precio!.lineas[i].cantidad = Number(v) || 0;
                        })
                      }
                    />
                    <Campo
                      rotulo="Cargo"
                      valor={linea.cargo}
                      multilinea
                      deshabilitado={emitida}
                      onChange={(v) =>
                        cambiar((b) => {
                          b.precio!.lineas[i].cargo = v;
                        })
                      }
                    />
                    <Campo
                      rotulo="Un"
                      valor={linea.unidad}
                      deshabilitado={emitida}
                      onChange={(v) =>
                        cambiar((b) => {
                          b.precio!.lineas[i].unidad = v;
                        })
                      }
                    />
                    <Campo
                      rotulo="V. unitario"
                      valor={String(linea.valorUnitario)}
                      numerico
                      deshabilitado={emitida}
                      onChange={(v) =>
                        cambiar((b) => {
                          b.precio!.lineas[i].valorUnitario = Number(v) || 0;
                        })
                      }
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-tinta/45">
                    Total de la línea{" "}
                    <span className="font-semibold tabular-nums text-tinta">
                      {money(linea.cantidad * linea.valorUnitario)}
                    </span>
                    {linea.valorTotalImpreso !== null && (
                      <>
                        {" · impreso en el borrador "}
                        <span className="tabular-nums">{money(linea.valorTotalImpreso)}</span>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>

            <Campo
              className="mt-3 max-w-[220px]"
              rotulo="Total neto impreso en el borrador"
              valor={oferta.precio.totalNetoImpreso === null ? "" : String(oferta.precio.totalNetoImpreso)}
              numerico
              deshabilitado={emitida}
              onChange={(v) =>
                cambiar((b) => {
                  b.precio!.totalNetoImpreso = v === "" ? null : Number(v) || 0;
                })
              }
            />
            <p className="mt-1.5 text-[11px] text-pretty text-tinta/45">
              Este campo no sale en el PDF: es el control. El total que se imprime es el que suman las líneas.
            </p>
          </section>
        )}

        {/* ── Dotación ───────────────────────────────────────────────── */}
        {oferta.organizacion && oferta.organizacion.cuadroPersonal.length > 0 && (
          <section className={`${TARJETA} p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                Cuadro de personal
              </h2>
              <span className="text-xs text-tinta/45">
                Total <span className="font-semibold tabular-nums text-tinta">{totales.dotacionTotal}</span>
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {oferta.organizacion.cuadroPersonal.map((fila, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_1fr] gap-2">
                  <Campo
                    rotulo={i === 0 ? "Cargo" : ""}
                    valor={fila.cargo}
                    deshabilitado={emitida}
                    onChange={(v) =>
                      cambiar((b) => {
                        b.organizacion!.cuadroPersonal[i].cargo = v;
                      })
                    }
                  />
                  <Campo
                    rotulo={i === 0 ? "Dotación" : ""}
                    valor={String(fila.dotacion)}
                    numerico
                    deshabilitado={emitida}
                    onChange={(v) =>
                      cambiar((b) => {
                        b.organizacion!.cuadroPersonal[i].dotacion = Number(v) || 0;
                      })
                    }
                  />
                  <Campo
                    rotulo={i === 0 ? "Régimen" : ""}
                    valor={fila.regimen ?? ""}
                    deshabilitado={emitida}
                    onChange={(v) =>
                      cambiar((b) => {
                        b.organizacion!.cuadroPersonal[i].regimen = v || null;
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Listas de texto: una por línea ─────────────────────────── */}
        <ListaEditable
          titulo="Actividades comprendidas"
          items={oferta.alcance?.actividades ?? null}
          deshabilitado={emitida}
          onChange={(items) =>
            cambiar((b) => {
              if (b.alcance) b.alcance.actividades = items;
            })
          }
        />
        <ListaEditable
          titulo="Aportes de PERTEC"
          items={oferta.aportes?.pertec ?? null}
          deshabilitado={emitida}
          onChange={(items) =>
            cambiar((b) => {
              if (b.aportes) b.aportes.pertec = items;
            })
          }
        />
        <ListaEditable
          titulo="Aportes del cliente"
          items={oferta.aportes?.cliente ?? null}
          deshabilitado={emitida}
          onChange={(items) =>
            cambiar((b) => {
              if (b.aportes) b.aportes.cliente = items;
            })
          }
        />
        <ListaEditable
          titulo="Condiciones comerciales"
          items={oferta.condicionesComerciales}
          deshabilitado={emitida}
          onChange={(items) =>
            cambiar((b) => {
              b.condicionesComerciales = items;
            })
          }
        />
      </div>

      {/* ── Columna derecha: controles y acciones ────────────────────── */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <section className={`${TARJETA} p-4`}>
          <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
            Por revisar
          </h2>
          {problemas.length === 0 ? (
            <p className="mt-2 text-sm text-teal">
              Nada pendiente: los totales cuadran y no hay datos sin confirmar.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2.5">
              {problemas.map((p, i) => (
                <li key={i} className="border-l-2 border-naranjo/60 pl-2.5">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-naranjo">
                    {ROTULOS[p.tipo]}
                    {p.origen === "lectura" && " · lectura"}
                  </span>
                  <span className="block text-xs text-pretty text-tinta/70">{p.detalle}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${TARJETA} p-4`}>
          <dl className="flex flex-col gap-1 text-xs">
            <Linea rotulo="Dotación total" valor={String(totales.dotacionTotal)} />
            <Linea
              rotulo="Programa"
              valor={`${totales.cantidadTurnos} turno${totales.cantidadTurnos === 1 ? "" : "s"} · ${totales.horasPrograma} h`}
            />
            <Linea rotulo="Total neto" valor={money(totales.totalNetoCalculado)} />
          </dl>

          {!emitida && (
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className={`${BOTON_PRIMARIO} mt-4 inline-flex w-full items-center justify-center gap-2 disabled:opacity-40`}
            >
              {guardando && <RuedaCarga />}
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          )}

          <a
            href={`/api/ofertas/${id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-borde px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
          >
            Ver el PDF
          </a>

          {!emitida && (
            <a
              href={`/api/ofertas/${id}/pdf?emitir=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-teal/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-teal transition hover:bg-teal/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            >
              Emitir
            </a>
          )}

          {mensaje && <p className="mt-2 text-xs font-medium text-teal">{mensaje}</p>}
          {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
          {emitida && (
            <p className="mt-3 text-[11px] text-pretty text-tinta/45">
              Esta oferta está emitida, así que quedó de solo lectura. El PDF se puede volver a descargar
              cuando haga falta.
            </p>
          )}
        </section>

        {oferta.omitidas.length > 0 && (
          <section className={`${TARJETA} p-4`}>
            <h2 className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
              Secciones omitidas
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5">
              {oferta.omitidas.map((o, i) => (
                <li key={i} className="text-[11px] text-tinta/60">
                  <span className="font-semibold text-tinta/80">{o.seccion}</span> — {o.motivo}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Linea({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-tinta/55">{rotulo}</dt>
      <dd className="font-semibold tabular-nums text-tinta">{valor}</dd>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  numerico = false,
  multilinea = false,
  deshabilitado = false,
  className = "",
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  numerico?: boolean;
  multilinea?: boolean;
  deshabilitado?: boolean;
  className?: string;
}) {
  const clases =
    "mt-1 w-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema/60 disabled:text-tinta/60";
  return (
    <label className={`block ${className}`}>
      {rotulo && (
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-tinta/45">
          {rotulo}
        </span>
      )}
      {multilinea ? (
        <textarea
          rows={2}
          value={valor}
          disabled={deshabilitado}
          onChange={(e) => onChange(e.target.value)}
          className={`${clases} resize-y`}
        />
      ) : (
        <input
          type={numerico ? "number" : "text"}
          value={valor}
          disabled={deshabilitado}
          onChange={(e) => onChange(e.target.value)}
          className={`${clases} ${numerico ? "tabular-nums" : ""}`}
        />
      )}
    </label>
  );
}

/**
 * Una lista de texto como textarea, un ítem por línea.
 *
 * Es la forma más rápida de sacar un aporte heredado de otra oferta: se borra la
 * línea. Un editor con botones de agregar y quitar por ítem sería más prolijo y
 * más lento de usar justo en la tarea más frecuente.
 */
function ListaEditable({
  titulo,
  items,
  onChange,
  deshabilitado,
}: {
  titulo: string;
  items: string[] | null;
  onChange: (items: string[]) => void;
  deshabilitado: boolean;
}) {
  if (!items) return null;
  return (
    <section className={`${TARJETA} p-5`}>
      <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">{titulo}</h2>
      <p className="mt-0.5 text-[11px] text-tinta/45">Un ítem por línea. La numeración la pone el PDF.</p>
      <textarea
        rows={Math.min(Math.max(items.length + 1, 3), 14)}
        value={items.join("\n")}
        disabled={deshabilitado}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
          )
        }
        className="mt-2 w-full resize-y rounded-lg border border-borde bg-superficie px-3 py-2 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema/60 disabled:text-tinta/60"
      />
    </section>
  );
}
