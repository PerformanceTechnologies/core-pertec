"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { firmaDe, type Inconsistencia, type OfertaCanonica } from "@/lib/ofertas/tipos";
import type { ImagenGuardada } from "@/lib/ofertas/imagenes";
import type { RegistroEmision } from "@/lib/ofertas/datos";
import { calcularTotales, detectarInconsistencias } from "@/lib/ofertas/verificar";
import { fechaCl, money } from "@/lib/cotizador/formato";
import { BOTON_PRIMARIO, TARJETA } from "@/lib/estilos";
import RuedaCarga from "@/components/RuedaCarga";
import DocumentoEditable from "@/components/ofertas/DocumentoEditable";
import CajonDeFotos from "@/components/ofertas/CajonDeFotos";
import ModalEmitir from "@/components/ofertas/ModalEmitir";
import { duplicarOfertaAction, marcarRevisadaAction } from "@/app/(protegido)/ofertas/acciones";
import { conLaMarca, conRevision, cuantasPendientes } from "@/lib/ofertas/revisiones";

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
  imagenes,
  urlsImagenes,
  emision,
  revisadas: revisadasGuardadas,
  empresa,
}: {
  id: string;
  inicial: OfertaCanonica;
  estado: "borrador" | "emitida";
  archivoOrigen: string | null;
  /** Qué se hizo al emitir, si ya se emitió. */
  emision: RegistroEmision | null;
  /** El inventario de la oferta: el cajón de fotos del documento sale de acá. */
  imagenes: ImagenGuardada[];
  urlsImagenes: Record<number, string>;
  /** Los avisos que ya se marcaron como revisados. Ver lib/ofertas/revisiones.ts. */
  revisadas: string[];
  /**
   * La empresa emisora.
   *
   * Viaja hasta el documento porque el logo de la casa se guarda por empresa, no por
   * oferta: para poder ponerlo arrastrándolo sobre el encabezado hay que saber de
   * quién es el hueco.
   */
  empresa: string;
}) {
  const router = useRouter();
  const [oferta, setOferta] = useState<OfertaCanonica>(inicial);
  const [vista, setVista] = useState<"documento" | "formulario">("documento");
  const [emitiendo, setEmitiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emitida = estado === "emitida";
  // Las marcas se llevan acá y se guardan al toque: la lista tiene que responder al
  // instante —es un interruptor— y la marca no viaja con "Guardar cambios", que es lo
  // que guarda el texto del documento.
  const [revisadas, setRevisadas] = useState<string[]>(revisadasGuardadas);

  /**
   * Pone o saca la marca de un aviso.
   *
   * Se pinta primero y se guarda después: es un interruptor, y esperar la ida y vuelta
   * para tacharlo lo haría sentir roto. Si el guardado falla, la marca vuelve atrás y
   * se dice — una marca que se ve puesta y no quedó guardada es peor que no poder
   * marcar.
   */
  const marcar = (clave: string, revisada: boolean) => {
    const previas = revisadas;
    setRevisadas((actuales) => conLaMarca(actuales, clave, revisada));
    void marcarRevisadaAction(id, clave, revisada).catch(() => {
      setRevisadas(previas);
      setError("No se pudo guardar la marca de revisado.");
    });
  };

  const { totales, problemas } = useMemo(() => {
    const t = calcularTotales(oferta);
    return { totales: t, problemas: detectarInconsistencias(oferta, t, archivoOrigen ?? "") };
  }, [oferta, archivoOrigen]);

  // Los avisos se recalculan en cada tecla; las marcas se cruzan por su clave, así que
  // un aviso cuyo dato cambió deja de calzar y vuelve a contar como pendiente. Es lo
  // correcto: lo que se revisó fue el problema anterior.
  const pendientes = cuantasPendientes(problemas, revisadas);

  // Las filas nuevas nacen vacías a propósito: una fila con datos de ejemplo se
  // emite tal cual si alguien no la completa, y eso ya pasó en otros formularios.
  const filaPrecio = () => ({
    cantidad: 1,
    cargo: "",
    unidad: "",
    valorUnitario: 0,
    valorTotalImpreso: null,
  });
  const filaDotacion = () => ({ cargo: "", dotacion: 1, regimen: null });
  const filaTurno = () => ({ turno: "", jornada: "", horas: 0 });
  const filaEspecificacion = () => ({ parametro: "", especificacion: "" });
  const filaResponsabilidad = () => ({ cargo: "", descripcion: "" });
  const filaFirmante = () => ({ nombre: "", cargo: "", empresa: null, firmaImagen: null });

  // Qué secciones no están en esta oferta y se pueden crear vacías.
  const faltantes = [
    {
      titulo: "Precio del servicio",
      falta: !oferta.precio,
      crear: (b: OfertaCanonica) => {
        b.precio = { lineas: [filaPrecio()], totalNetoImpreso: null, nota: null };
      },
    },
    {
      titulo: "Especificaciones técnicas",
      falta: !oferta.especificaciones,
      crear: (b: OfertaCanonica) => {
        b.especificaciones = [filaEspecificacion()];
      },
    },
    {
      titulo: "Dotación y organización",
      falta: !oferta.organizacion,
      crear: (b: OfertaCanonica) => {
        b.organizacion = { cuadroPersonal: [filaDotacion()], responsabilidades: [], nota: null };
      },
    },
    {
      titulo: "Programa y plazos",
      falta: !oferta.programa,
      crear: (b: OfertaCanonica) => {
        b.programa = { introduccion: null, turnos: [filaTurno()], nota: null };
      },
    },
    {
      titulo: "Cierre y firma",
      falta: !oferta.cierre,
      crear: (b: OfertaCanonica) => {
        b.cierre = { texto: null, firmantes: [filaFirmante()], cc: null, firmaImagen: null };
      },
    },
  ].filter((seccion) => seccion.falta);

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
    <>
      {/* El diálogo va ACÁ y no dentro de una columna ni de una pestaña. Estaba
          adentro del fragmento de la pestaña Formulario, así que con el Documento a
          la vista —que es lo normal— apretar Emitir cambiaba el estado y no se
          dibujaba nada: el botón parecía muerto. Un modal es de la pantalla, no de
          la parte de la pantalla donde quedó el reemplazo. */}
      {emitiendo && (
        <ModalEmitir
          id={id}
          numeroOferta={oferta.identificacion.numeroOferta}
          cliente={oferta.identificacion.cliente}
          titulo={oferta.titulo}
          atencion={oferta.identificacion.atencion}
          onCerrar={() => setEmitiendo(false)}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* min-w-0: sin esto, una columna 1fr no se achica más allá del ancho mínimo
          de su contenido, y el cajón de fotos —once miniaturas de 104px en una tira
          horizontal— la estiraba a 1250px. La rejilla pasaba a medir 1614 y se salía
          de los 1300 del contenedor: la columna de controles y el borde derecho del
          documento quedaban fuera de la pantalla, cortados. Es el mismo defecto que
          el layout del área protegida ya documenta para el Gantt de Proyectos. */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* El documento primero: es donde se corrige mirando el resultado. El
            formulario queda para lo que cambia la estructura —agregar una fila,
            crear una sección— que en el documento no se puede hacer sin volver a
            armarlo entero. */}
          <div className="flex w-fit items-center gap-1 rounded-lg border border-borde bg-crema/40 p-1">
            {(
              [
                ["documento", "Documento"],
                ["formulario", "Formulario"],
              ] as const
            ).map(([clave, rotulo]) => (
              <button
                key={clave}
                type="button"
                onClick={() => setVista(clave)}
                aria-pressed={vista === clave}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo ${
                  vista === clave ? "bg-superficie text-tinta shadow-sm" : "text-tinta/50 hover:text-naranjo"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {vista === "documento" ? (
            <DocumentoEditable
              id={id}
              oferta={oferta}
              empresa={empresa}
              editable={!emitida}
              onCambio={cambiar}
            />
          ) : (
            <>
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
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <p className="text-[11px] text-tinta/45">
                            Total de la línea{" "}
                            <span className="font-semibold tabular-nums text-tinta">
                              {money(linea.cantidad * linea.valorUnitario)}
                            </span>
                            {linea.valorTotalImpreso != null && (
                              <>
                                {" · impreso en el borrador "}
                                <span className="tabular-nums">{money(linea.valorTotalImpreso)}</span>
                              </>
                            )}
                          </p>
                          <ControlesDeFila
                            deshabilitado={emitida}
                            indice={i}
                            total={oferta.precio!.lineas.length}
                            lista={(b) => b.precio!.lineas}
                            cambiar={cambiar}
                          />
                        </div>
                      </div>
                    ))}
                    {oferta.precio.lineas.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        El borrador no traía líneas de precio. Agregá las que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar línea"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.precio!.lineas.push(filaPrecio());
                      })
                    }
                  />

                  <Campo
                    className="mt-3 max-w-[220px]"
                    rotulo="Total neto impreso en el borrador"
                    valor={
                      oferta.precio.totalNetoImpreso == null ? "" : String(oferta.precio.totalNetoImpreso)
                    }
                    numerico
                    deshabilitado={emitida}
                    onChange={(v) =>
                      cambiar((b) => {
                        b.precio!.totalNetoImpreso = v === "" ? null : Number(v) || 0;
                      })
                    }
                  />
                  <p className="mt-1.5 text-[11px] text-pretty text-tinta/45">
                    Este campo no sale en el PDF: es el control. El total que se imprime es el que suman las
                    líneas.
                  </p>
                </section>
              )}

              {/* ── Dotación ───────────────────────────────────────────────── */}
              {oferta.organizacion && (
                <section className={`${TARJETA} p-5`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                      Cuadro de personal
                    </h2>
                    <span className="text-xs text-tinta/45">
                      Total{" "}
                      <span className="font-semibold tabular-nums text-tinta">{totales.dotacionTotal}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {oferta.organizacion.cuadroPersonal.map((fila, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_80px_1fr_auto]">
                        <Campo
                          rotulo="Cargo"
                          repetido={i > 0}
                          valor={fila.cargo}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.organizacion!.cuadroPersonal[i].cargo = v;
                            })
                          }
                        />
                        <Campo
                          rotulo="Dotación"
                          repetido={i > 0}
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
                          rotulo="Régimen"
                          repetido={i > 0}
                          valor={fila.regimen ?? ""}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.organizacion!.cuadroPersonal[i].regimen = v || null;
                            })
                          }
                        />
                        <ControlesDeFila
                          deshabilitado={emitida}
                          indice={i}
                          total={oferta.organizacion!.cuadroPersonal.length}
                          lista={(b) => b.organizacion!.cuadroPersonal}
                          cambiar={cambiar}
                        />
                      </div>
                    ))}
                    {oferta.organizacion.cuadroPersonal.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        El borrador no traía cuadro de personal. Agregá los cargos que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar cargo"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.organizacion!.cuadroPersonal.push(filaDotacion());
                      })
                    }
                  />
                </section>
              )}

              {/* ── Programa ───────────────────────────────────────────────── */}
              {oferta.programa && (
                <section className={`${TARJETA} p-5`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                      Programa y plazos
                    </h2>
                    <span className="text-xs text-tinta/45">
                      {totales.cantidadTurnos} turno{totales.cantidadTurnos === 1 ? "" : "s"} ·{" "}
                      <span className="font-semibold tabular-nums text-tinta">{totales.horasPrograma} h</span>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-col gap-2">
                    {oferta.programa.turnos.map((turno, i) => (
                      <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[90px_1fr_90px_auto]">
                        <Campo
                          rotulo="Turno"
                          repetido={i > 0}
                          valor={turno.turno}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.programa!.turnos[i].turno = v;
                            })
                          }
                        />
                        <Campo
                          rotulo="Jornada"
                          repetido={i > 0}
                          valor={turno.jornada}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.programa!.turnos[i].jornada = v;
                            })
                          }
                        />
                        <Campo
                          rotulo="Horas"
                          repetido={i > 0}
                          valor={String(turno.horas)}
                          numerico
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.programa!.turnos[i].horas = Number(v) || 0;
                            })
                          }
                        />
                        <ControlesDeFila
                          deshabilitado={emitida}
                          indice={i}
                          total={oferta.programa!.turnos.length}
                          lista={(b) => b.programa!.turnos}
                          cambiar={cambiar}
                        />
                      </div>
                    ))}
                    {oferta.programa.turnos.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        El borrador no traía turnos. Agregá los que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar turno"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.programa!.turnos.push(filaTurno());
                      })
                    }
                  />
                  <p className="mt-2 text-[11px] text-tinta/45">
                    La barra de avance del PDF se calcula sola con estas horas.
                  </p>
                </section>
              )}

              {/* ── Especificaciones técnicas ───────────────────────────────── */}
              {oferta.especificaciones && (
                <section className={`${TARJETA} p-5`}>
                  <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                    Especificaciones técnicas
                  </h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {oferta.especificaciones.map((e, i) => (
                      <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                        <Campo
                          rotulo="Parámetro"
                          repetido={i > 0}
                          valor={e.parametro}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.especificaciones![i].parametro = v;
                            })
                          }
                        />
                        <Campo
                          rotulo="Especificación"
                          repetido={i > 0}
                          valor={e.especificacion}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.especificaciones![i].especificacion = v;
                            })
                          }
                        />
                        <ControlesDeFila
                          deshabilitado={emitida}
                          indice={i}
                          total={oferta.especificaciones!.length}
                          lista={(b) => b.especificaciones!}
                          cambiar={cambiar}
                        />
                      </div>
                    ))}
                    {oferta.especificaciones.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        El borrador no traía especificaciones. Agregá las que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar especificación"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.especificaciones!.push(filaEspecificacion());
                      })
                    }
                  />
                </section>
              )}

              {/* ── Responsabilidades por cargo ─────────────────────────────── */}
              {oferta.organizacion && (
                <section className={`${TARJETA} p-5`}>
                  <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                    Organización del servicio
                  </h2>
                  <p className="mt-0.5 text-[11px] text-tinta/45">
                    Vaciá el cargo para sacar la tarjeta: es la forma de quitar una que quedó de otra oferta.
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {oferta.organizacion.responsabilidades.map((r, i) => (
                      <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
                        <Campo
                          rotulo="Cargo"
                          repetido={i > 0}
                          valor={r.cargo}
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.organizacion!.responsabilidades[i].cargo = v;
                            })
                          }
                        />
                        <Campo
                          rotulo="Qué hace"
                          repetido={i > 0}
                          valor={r.descripcion}
                          multilinea
                          deshabilitado={emitida}
                          onChange={(v) =>
                            cambiar((b) => {
                              b.organizacion!.responsabilidades[i].descripcion = v;
                            })
                          }
                        />
                        <ControlesDeFila
                          deshabilitado={emitida}
                          indice={i}
                          total={oferta.organizacion!.responsabilidades.length}
                          lista={(b) => b.organizacion!.responsabilidades}
                          cambiar={cambiar}
                        />
                      </div>
                    ))}
                    {oferta.organizacion.responsabilidades.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        No hay responsabilidades por cargo. Agregá las que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar cargo"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.organizacion!.responsabilidades.push(filaResponsabilidad());
                      })
                    }
                  />
                </section>
              )}

              {/* ── Firmantes ──────────────────────────────────────────────── */}
              {oferta.cierre && (
                <section className={`${TARJETA} p-5`}>
                  <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                    Cierre y firma
                  </h2>
                  <Campo
                    className="mt-3"
                    rotulo="Texto de cierre"
                    valor={oferta.cierre.texto ?? ""}
                    multilinea
                    deshabilitado={emitida}
                    onChange={(v) =>
                      cambiar((b) => {
                        b.cierre!.texto = v || null;
                      })
                    }
                  />
                  <div className="mt-3 flex flex-col gap-2">
                    {oferta.cierre.firmantes.map((f, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                          <Campo
                            rotulo="Nombre"
                            repetido={i > 0}
                            valor={f.nombre}
                            deshabilitado={emitida}
                            onChange={(v) =>
                              cambiar((b) => {
                                b.cierre!.firmantes[i].nombre = v;
                              })
                            }
                          />
                          <Campo
                            rotulo="Cargo"
                            repetido={i > 0}
                            valor={f.cargo}
                            deshabilitado={emitida}
                            onChange={(v) =>
                              cambiar((b) => {
                                b.cierre!.firmantes[i].cargo = v;
                              })
                            }
                          />
                          <Campo
                            rotulo="Empresa"
                            repetido={i > 0}
                            valor={f.empresa ?? ""}
                            deshabilitado={emitida}
                            onChange={(v) =>
                              cambiar((b) => {
                                b.cierre!.firmantes[i].empresa = v || null;
                              })
                            }
                          />
                          <ControlesDeFila
                            deshabilitado={emitida}
                            indice={i}
                            total={oferta.cierre!.firmantes.length}
                            lista={(b) => b.cierre!.firmantes}
                            cambiar={cambiar}
                          />
                        </div>
                        {/* La rúbrica se elige arriba, en Imágenes del documento: acá
                          solo se dice si la tiene, que es lo que no se podía saber. */}
                        <p className="text-[10px] text-tinta/40">
                          {firmaDe(oferta.cierre!, i) !== null
                            ? `Firma con la imagen n° ${firmaDe(oferta.cierre!, i)}`
                            : "Sin rúbrica: sale solo la línea y el nombre"}
                        </p>
                      </div>
                    ))}
                    {oferta.cierre.firmantes.length === 0 && (
                      <p className="text-xs text-tinta/45">
                        El borrador no traía firmantes. Agregá los que correspondan.
                      </p>
                    )}
                  </div>
                  <BotonAgregar
                    texto="Agregar firmante"
                    deshabilitado={emitida}
                    onClick={() =>
                      cambiar((b) => {
                        b.cierre!.firmantes.push(filaFirmante());
                      })
                    }
                  />
                </section>
              )}

              {/* ── Secciones que el borrador no traía ────────────────────── */}
              {/*
            Sin esto no se puede "agregar" donde no hay nada: una sección ausente no
            dibuja tarjeta, así que no había dónde apretar. El sistema omite lo que
            el borrador no trae —eso está bien— pero una oferta se completa a mano
            tanto como se transcribe.
         */}
              {!emitida && faltantes.length > 0 && (
                <section className={`${TARJETA} p-4`}>
                  <p className="font-condensed text-sm font-bold uppercase tracking-wide text-tinta">
                    Agregar una sección que no está
                  </p>
                  <p className="mt-0.5 text-[11px] text-pretty text-tinta/45">
                    El borrador no las traía, así que el documento no las imprime. Se pueden agregar y
                    completar a mano.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {faltantes.map((falta) => (
                      <button
                        key={falta.titulo}
                        type="button"
                        onClick={() => cambiar(falta.crear)}
                        className="rounded-lg border border-borde px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                      >
                        + {falta.titulo}
                      </button>
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
                titulo="Trabajos previos considerados"
                items={oferta.alcance?.trabajosPrevios ?? null}
                deshabilitado={emitida}
                onChange={(items) =>
                  cambiar((b) => {
                    if (b.alcance) b.alcance.trabajosPrevios = items;
                  })
                }
              />
              <ListaEditable
                titulo="Metodología · antes de la detención"
                items={oferta.metodologia?.antesDeLaDetencion ?? null}
                deshabilitado={emitida}
                onChange={(items) =>
                  cambiar((b) => {
                    if (b.metodologia) b.metodologia.antesDeLaDetencion = items;
                  })
                }
              />
              <ListaEditable
                titulo="Metodología · durante la detención"
                items={oferta.metodologia?.duranteLaDetencion ?? null}
                deshabilitado={emitida}
                onChange={(items) =>
                  cambiar((b) => {
                    if (b.metodologia) b.metodologia.duranteLaDetencion = items;
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
              <ListaEditable
                titulo="Anexo · respaldo institucional"
                items={oferta.anexo?.respaldoInstitucional ?? null}
                deshabilitado={emitida}
                onChange={(items) =>
                  cambiar((b) => {
                    if (b.anexo) b.anexo.respaldoInstitucional = items;
                  })
                }
              />
              <ListaEditable
                titulo="Anexo · principales mandantes"
                items={oferta.anexo?.mandantes ?? null}
                deshabilitado={emitida}
                onChange={(items) =>
                  cambiar((b) => {
                    if (b.anexo) b.anexo.mandantes = items;
                  })
                }
              />
            </>
          )}
        </div>

        {/* ── Columna derecha: controles y acciones ──────────────────────
          En pantalla chica va PRIMERO: apilada debajo, "Guardar cambios" quedaba al
          final de un documento de varias páginas, que es justo lo que nadie va a
          buscar scrolleando. En grande vuelve a su lugar, a la derecha y sticky. */}
        <div className="order-first flex flex-col gap-4 lg:order-none lg:sticky lg:top-6 lg:self-start">
          {/* ── Las acciones, primeras y con peso propio ──────────────────
            Estaban al pie de la columna, debajo de las fotos, los avisos y los
            totales: había que scrollear la columna entera para encontrar "Guardar
            cambios", que es lo que más se busca de esta pantalla. Acá arriba y en su
            propia tarjeta se ven al entrar, y los tres se leen como botones: el que
            guarda pintado, el del PDF con fondo, y emitir en teal, que es el color
            con el que este core marca lo que cierra un proceso. */}
          <section className={`${TARJETA} flex flex-col gap-2 p-4`}>
            {!emitida && (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className={`${BOTON_PRIMARIO} inline-flex w-full items-center justify-center gap-2 py-3 text-sm disabled:opacity-40`}
              >
                {guardando && <RuedaCarga />}
                {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            )}

            {/* Ya no está la "vista rápida": abría en otra pestaña la misma maqueta que
              ahora se ve —y se edita— en la pestaña Documento. Dos botones para lo
              mismo es de lo que hace que una pantalla no se entienda. */}
            <a
              href={`/api/ofertas/${id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-borde bg-crema/70 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:bg-crema hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M8 2v8m0 0L5 7m3 3 3-3M3 12.5h10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Ver el PDF
            </a>

            {!emitida && (
              <>
                {/* Ya no es un link a la ruta del PDF con ?emitir=1: emitir es un paso
                  con destinos —descargar, guardar en el workspace, mandar por
                  correo— y el registro de lo que se hizo. Ver ModalEmitir. */}
                <button
                  type="button"
                  onClick={() => setEmitiendo(true)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-teal/60 bg-teal/[0.09] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-teal transition hover:bg-teal/[0.16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                >
                  <svg
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M3 8.5l3.5 3.5L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Emitir
                </button>
                <p className="text-[10px] text-pretty text-tinta/40">
                  Al emitir se elige qué hacer con el PDF: descargarlo, guardarlo en el workspace o enviarlo
                  por correo. La oferta queda de solo lectura, así que guardá antes: se emite lo último
                  guardado.
                </p>
              </>
            )}

            {mensaje && <p className="text-xs font-medium text-teal">{mensaje}</p>}
            {error && <p className="text-xs font-medium text-red-600">{error}</p>}
            {emitida && (
              <>
                <a
                  href={`/api/ofertas/${id}/pdf?descargar=1`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-borde bg-crema/70 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-tinta transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                >
                  Descargar el PDF
                </a>
                {/* La salida del callejón: una emitida no se toca, así que la
                    siguiente parecida se hace duplicándola. Es su caso principal. */}
                <form action={duplicarOfertaAction}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-borde px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
                  >
                    Duplicar para una nueva
                  </button>
                </form>
                <p className="text-[11px] text-pretty text-tinta/45">
                  Esta oferta está emitida, así que quedó de solo lectura. El PDF que se descarga es el que se
                  emitió, no una reimpresión.
                </p>
                {/* Qué se hizo al emitirla. Sin esto, "emitida" es un estado que no se
                  puede verificar: nadie sabe si el documento llegó a alguien. */}
                {emision && (
                  <dl className="flex flex-col gap-1 border-t border-borde pt-2 text-[11px]">
                    <Linea rotulo="Emitida" valor={fechaCl(emision.emitidaEn)} />
                    {emision.enviadoA.length > 0 && (
                      <Linea rotulo="Enviada a" valor={emision.enviadoA.join(", ")} />
                    )}
                    {emision.enWorkspace && (
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="shrink-0 text-tinta/55">Workspace</dt>
                        <dd className="min-w-0 truncate text-right font-medium">
                          {emision.enWorkspace.startsWith("http") ? (
                            <a
                              href={emision.enWorkspace}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-naranjo underline"
                            >
                              Abrir el archivo
                            </a>
                          ) : (
                            emision.enWorkspace
                          )}
                        </dd>
                      </div>
                    )}
                    {emision.problemas.length > 0 && (
                      <p className="mt-1 text-pretty text-red-600">{emision.problemas.join(" · ")}</p>
                    )}
                  </dl>
                )}
              </>
            )}
          </section>

          {/* Las fotos, después de las acciones y solo con el documento a la vista: es
            al lado del papel donde sirven, porque se arrastran hasta él. En el
            formulario no aparecen — ahí se ubican con el desplegable del panel. */}
          {vista === "documento" && !emitida && (
            <CajonDeFotos
              ofertaId={id}
              imagenes={imagenes}
              urls={urlsImagenes}
              // De lo GUARDADO y no del estado de esta pantalla: la ubicación de una
              // foto se guarda sola al soltarla, y no viaja en "Guardar cambios".
              porSeccion={inicial.imagenesPorSeccion ?? {}}
            />
          )}
          <section className={`${TARJETA} p-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-condensed text-base font-bold uppercase tracking-wide text-tinta">
                Por revisar
              </h2>
              {/* La cuenta que importa es la de pendientes, y se dice sobre el total
                  para que marcar no parezca hacer desaparecer avisos. */}
              {problemas.length > 0 && (
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    pendientes > 0 ? "text-naranjo" : "text-teal"
                  }`}
                >
                  {pendientes} de {problemas.length} pendiente{pendientes === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {problemas.length === 0 ? (
              <p className="mt-2 text-sm text-teal">
                Nada pendiente: los totales cuadran y no hay datos sin confirmar.
              </p>
            ) : (
              <>
                {pendientes === 0 && (
                  <p className="mt-2 text-sm text-teal">
                    Todo revisado: los {problemas.length} avisos quedaron mirados.
                  </p>
                )}
                {/* Los revisados no se esconden: quedan al final, apagados. Esconderlos
                    haría dudar de si el aviso se revisó o si el sistema dejó de verlo,
                    y son dos cosas muy distintas cuando lo que está en juego es un
                    precio. */}
                <ul className="mt-2 flex flex-col gap-2.5">
                  {conRevision(problemas, revisadas).map((p) => (
                    <li
                      key={p.clave}
                      className={`border-l-2 pl-2.5 transition-colors ${
                        p.revisada ? "border-borde" : "border-naranjo/60"
                      }`}
                    >
                      <span
                        className={`block text-[10px] font-semibold uppercase tracking-wide ${
                          p.revisada ? "text-tinta/35" : "text-naranjo"
                        }`}
                      >
                        {ROTULOS[p.tipo]}
                        {p.origen === "lectura" && " · lectura"}
                      </span>
                      <span
                        className={`block text-xs text-pretty ${
                          p.revisada ? "text-tinta/35" : "text-tinta/70"
                        }`}
                      >
                        {p.detalle}
                      </span>
                      {!emitida && (
                        <label className="mt-1 inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-tinta/40 transition-colors hover:text-naranjo">
                          <input
                            type="checkbox"
                            checked={p.revisada}
                            onChange={(e) => marcar(p.clave, e.target.checked)}
                            className="h-3 w-3 accent-naranjo"
                          />
                          {p.revisada ? "Revisada" : "Marcar como revisada"}
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <dl className="mt-4 flex flex-col gap-1 border-t border-borde pt-3 text-xs">
              <Linea rotulo="Dotación total" valor={String(totales.dotacionTotal)} />
              <Linea
                rotulo="Programa"
                valor={`${totales.cantidadTurnos} turno${totales.cantidadTurnos === 1 ? "" : "s"} · ${totales.horasPrograma} h`}
              />
              <Linea rotulo="Total neto" valor={money(totales.totalNetoCalculado)} />
            </dl>
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
    </>
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
  repetido = false,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  numerico?: boolean;
  multilinea?: boolean;
  deshabilitado?: boolean;
  className?: string;
  /**
   * Esta celda repite el rótulo de la fila de arriba.
   *
   * En una tabla ancha el rótulo va UNA vez, en la primera fila, y las de abajo se
   * leen por su columna. Apiladas en un teléfono no hay columna que las explique,
   * así que el rótulo se dibuja siempre y se esconde recién cuando la tabla vuelve
   * a ser tabla.
   */
  repetido?: boolean;
}) {
  const clases =
    "mt-1 w-full rounded-lg border border-borde bg-superficie px-2.5 py-1.5 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema/60 disabled:text-tinta/60";
  return (
    <label className={`block ${className}`}>
      {rotulo && (
        <span
          className={`block text-[10px] font-semibold uppercase tracking-wide text-tinta/45 ${
            repetido ? "sm:hidden" : ""
          }`}
        >
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
 * Los controles de una fila: subirla, bajarla y sacarla.
 *
 * Discretos y sin color hasta que se pasa el mouse por encima. Sacar una fila es
 * frecuente y correcto —una línea de precio que quedó de otra oferta— pero tres
 * botones marcados al lado de cada fila convierten la tabla en un campo minado.
 *
 * El orden importa de verdad y no es decoración: las actividades, los turnos y las
 * líneas de precio se leen como una secuencia, así que una fila agregada al final
 * casi nunca va al final. Antes, para moverla, había que reescribir las dos.
 *
 * `lista` devuelve el arreglo DENTRO del borrador que se está por modificar, y no
 * el arreglo actual: `cambiar` trabaja sobre una copia profunda, y mover elementos
 * en el original no cambiaría nada de lo que se guarda.
 */
function ControlesDeFila({
  lista,
  cambiar,
  indice,
  total,
  deshabilitado,
}: {
  lista: (borrador: OfertaCanonica) => unknown[];
  cambiar: (fn: (borrador: OfertaCanonica) => void) => void;
  indice: number;
  total: number;
  deshabilitado: boolean;
}) {
  if (deshabilitado) return <span />;

  const mover = (salto: number) =>
    cambiar((borrador) => {
      const filas = lista(borrador);
      const destino = indice + salto;
      if (destino < 0 || destino >= filas.length) return;
      [filas[indice], filas[destino]] = [filas[destino], filas[indice]];
    });

  const clases =
    "rounded-md px-1.5 py-1.5 text-tinta/30 transition-colors hover:bg-crema hover:text-naranjo disabled:pointer-events-none disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo";

  return (
    <span className="flex shrink-0 items-center justify-self-end self-end">
      <button
        type="button"
        onClick={() => mover(-1)}
        disabled={indice === 0}
        title="Subir esta fila"
        aria-label="Subir esta fila"
        className={clases}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 12.5v-9M4 7.5 8 3.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => mover(1)}
        disabled={indice >= total - 1}
        title="Bajar esta fila"
        aria-label="Bajar esta fila"
        className={clases}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M8 3.5v9M4 8.5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() =>
          cambiar((borrador) => {
            lista(borrador).splice(indice, 1);
          })
        }
        title="Quitar esta fila"
        aria-label="Quitar esta fila"
        className={`${clases} hover:text-red-600 focus-visible:outline-red-600`}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 4h10M6.5 4V2.8h3V4M5 4l.6 9h4.8L11 4" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

/** Agregar una fila al final de una tabla. */
function BotonAgregar({
  onClick,
  texto,
  deshabilitado,
}: {
  onClick: () => void;
  texto: string;
  deshabilitado: boolean;
}) {
  if (deshabilitado) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-borde px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tinta/70 transition hover:border-naranjo/50 hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
      </svg>
      {texto}
    </button>
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
