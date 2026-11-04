import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconCheck, IconCircleDashed, IconHistory, IconMessage2, IconPaperclip } from "@tabler/icons-react";
import { RUTA_FIN, actividadesDe, adjuntosDe, cargarVista, contextoFin, historialDe } from "@/lib/fin/datos";
import { ACCION_ETAPA, clp, fechaCl } from "@/lib/fin/reglas";
import { ETIQUETA_TRABAJO } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { agregarActividadAction } from "../../../acciones-config";
import { anularHitoAction, guardarHitoAction } from "../../../acciones-ventas";
import { Chip, Monto, Seccion, TONO_ETAPA } from "@/components/fin/piezas";
import { BotonAccion, CAMPO, Campo, ComboContacto, ConVentana, FormAccion, SubirAdjunto, BOTON_SEC } from "@/components/fin/ui";
import EnlaceAdjunto from "@/components/fin/EnlaceAdjunto";

export const dynamic = "force-dynamic";

export default async function HitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, ctx] = await Promise.all([cargarVista(), contextoFin()]);
  const h = v.hitos.find((x) => x.id === id);
  if (!h) notFound();
  const [actividades, adjuntos, historial] = await Promise.all([actividadesDe("hito", id), adjuntosDe("hito", id), historialDe(ctx.empresa.id, id)]);
  const cesion = h.factura ? v.cesiones.find((c) => c.documentoId === h.factura!.documentoId) : null;
  const cobros = h.factura ? v.cobros.filter((c) => c.aplicaciones.some((a) => a.documentoId === h.factura!.documentoId)) : [];
  const req = [
    { ok: Boolean(h.fechaAceptacion), texto: "Cotización aceptada", detalle: fechaCl(h.fechaAceptacion) },
    { ok: h.estadoTrabajo === "terminado", texto: "Trabajo terminado", detalle: ETIQUETA_TRABAJO[h.estadoTrabajo ?? ""] ?? "Sin iniciar" },
    ...(h.requiereEdp ? [{ ok: Boolean(h.edpFechaAprobacion), texto: "EDP aprobado", detalle: fechaCl(h.edpFechaAprobacion) }] : []),
    { ok: Boolean(h.ocClienteNumero), texto: "OC del cliente", detalle: h.ocClienteNumero ?? "Pendiente" },
    ...(h.requiereHes ? [{ ok: Boolean(h.hesNumero), texto: "HES", detalle: h.hesNumero ?? "Pendiente" }] : []),
    { ok: Boolean(h.factura), texto: "Factura", detalle: h.factura ? `N° ${h.factura.folio} · ${fechaCl(h.factura.fechaEmision)}` : "—" },
    { ok: h.etapa === "Cobrada", texto: "Cobrada", detalle: h.factura?.fechaPagoReal ? fechaCl(h.factura.fechaPagoReal) : "—" },
  ];
  const clientes = v.contrapartes.map((c) => ({ id: c.id, nombre: c.nombre, rut: c.rut }));

  return (
    <div className="space-y-6">
      <Link href={`${RUTA_FIN}/ventas`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Ventas y cobranza</Link>

      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{h.codigo} · {h.tipo}</p>
          <h2 className="text-lg font-extrabold text-tinta">{h.descripcion}{h.periodo ? ` · ${h.periodo}` : ""}</h2>
          <p className="text-sm text-gris">{h.clienteNombre ?? "Sin cliente"} · {h.proyectoId ? <Link href={`${RUTA_FIN}/proyectos/${h.proyectoId}`} className="hover:text-naranjo">{h.proyectoNombre}</Link> : "Sin proyecto"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip texto={h.anulado ? "Anulado" : h.etapa} tono={TONO_ETAPA[h.etapa]} />
            {!h.anulado && <span className="text-xs font-semibold text-naranjo">→ {ACCION_ETAPA[h.etapa]}</span>}
          </div>
        </div>
        <div className="text-right">
          <p className="font-condensed text-3xl font-bold tabular-nums text-tinta">{clp(h.neto)}</p>
          <p className="text-xs text-gris">neto · {clp(h.totalConIva)} con IVA</p>
          {h.saldo !== null && <p className="mt-1 text-sm font-semibold">Saldo <Monto valor={h.saldo} /></p>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Seccion titulo="Requisitos para facturar y cobrar">
            <ol className={`${TARJETA} divide-y divide-borde`}>
              {req.map((r) => (
                <li key={r.texto} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {r.ok ? <IconCheck size={17} className="text-ok" /> : <IconCircleDashed size={17} className="text-gris-suave" />}
                  <span className={`flex-1 ${r.ok ? "text-tinta" : "text-gris"}`}>{r.texto}</span>
                  <span className="text-xs text-gris">{r.detalle}</span>
                </li>
              ))}
            </ol>
            {h.factura && (
              <div className={`${TARJETA} mt-3 space-y-1 p-4 text-sm`}>
                <p>Vence el <strong>{fechaCl(h.vence)}</strong> ({h.condicion} días){h.diasVencida ? <span className="text-alerta"> · {h.diasVencida} días vencida</span> : null}</p>
                {cobros.map((c) => <p key={c.id} className="text-xs text-gris">Cobro {c.numero} · {fechaCl(c.fecha)} · {clp(c.aplicaciones.find((a) => a.documentoId === h.factura!.documentoId)?.monto ?? 0)}</p>)}
                {cesion && <p className="text-xs text-violet-700">Cedida a {cesion.factorNombre} (op. {cesion.operacionNumero}) · {cesion.estado}</p>}
              </div>
            )}
          </Seccion>

          <Seccion titulo="Gestión y comentarios" icono={<IconMessage2 size={15} />}>
            <div className={`${TARJETA} p-4`}>
              <FormAccion accion={agregarActividadAction.bind(null, "hito", h.id)} textoBoton="Anotar">
                <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <select name="tipo" className={CAMPO} defaultValue="llamada"><option value="llamada">Llamada</option><option value="correo">Correo</option><option value="reunion">Reunión</option><option value="nota">Nota</option></select>
                  <input name="texto" required placeholder="Con quién hablaste y qué dijo…" className={CAMPO} />
                </div>
                <Campo etiqueta="Fecha prometida de pago (opcional)" ayuda="Actualiza la fecha estimada del hito y entra así al flujo de caja"><input name="fechaPrometida" type="date" className={`${CAMPO} max-w-xs`} /></Campo>
              </FormAccion>
              <ul className="mt-4 space-y-2 border-t border-borde pt-3">
                {actividades.map((a) => (
                  <li key={a.id} className="text-sm"><span className="text-[11px] font-semibold uppercase text-gris">{a.tipo} · {fechaCl(a.fecha)} · {a.creadoPor?.split("@")[0]}</span><p className="text-tinta">{a.texto}</p></li>
                ))}
                {actividades.length === 0 && <li className="text-xs text-gris">Sin gestiones anotadas.</li>}
              </ul>
            </div>
          </Seccion>
        </div>

        <aside className="space-y-6">
          <Seccion titulo="Respaldos" icono={<IconPaperclip size={15} />} accion={<SubirAdjunto entidadTipo="hito" entidadId={h.id} tipo="edp" />}>
            <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
              {adjuntos.map((a) => <li key={a.id} className="px-4 py-2"><EnlaceAdjunto id={a.id} nombre={a.nombre} /></li>)}
              {adjuntos.length === 0 && <li className="px-4 py-3 text-xs text-gris">OC del cliente, EDP, HES, guía… súbelos aquí.</li>}
            </ul>
          </Seccion>
          <div className="flex flex-wrap gap-2">
            <ConVentana boton="Editar hito" titulo={`Editar ${h.codigo}`} className={BOTON_SEC}>
              {(cerrar) => (
                <FormAccion accion={guardarHitoAction.bind(null, h.id)} textoBoton="Guardar" alOk={cerrar}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Cliente"><ComboContacto name="clienteId" opciones={clientes} inicial={h.clienteId} /></Campo>
                    <Campo etiqueta="Proyecto"><select name="proyectoId" defaultValue={h.proyectoId ?? ""} className={CAMPO}><option value="">—</option>{v.proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>
                    <Campo etiqueta="Descripción" className="sm:col-span-2"><input name="descripcion" defaultValue={h.descripcion} className={CAMPO} /></Campo>
                    <Campo etiqueta="Período"><input name="periodo" defaultValue={h.periodo ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="Neto"><input name="neto" defaultValue={h.neto} className={CAMPO} /></Campo>
                    <Campo etiqueta="Tipo"><select name="tipo" defaultValue={h.tipo} className={CAMPO}><option value="servicio">Servicio</option><option value="arriendo">Arriendo</option><option value="venta">Venta</option></select></Campo>
                    <Campo etiqueta="Aceptado el"><input name="fechaAceptacion" type="date" defaultValue={h.fechaAceptacion ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="N° OC cliente"><input name="ocClienteNumero" defaultValue={h.ocClienteNumero ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="Trabajo"><select name="estadoTrabajo" defaultValue={h.estadoTrabajo ?? ""} className={CAMPO}><option value="">—</option><option value="pendiente">Pendiente</option><option value="en_curso">En curso</option><option value="terminado">Terminado</option></select></Campo>
                    <Campo etiqueta="EDP aprobado"><input name="edpFechaAprobacion" type="date" defaultValue={h.edpFechaAprobacion ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="N° HES"><input name="hesNumero" defaultValue={h.hesNumero ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="Guía de despacho"><input name="guiaDespacho" defaultValue={h.guiaDespacho ?? ""} className={CAMPO} /></Campo>
                    <Campo etiqueta="Fecha estimada de pago"><input name="fechaEstimadaPago" type="date" defaultValue={h.fechaEstimadaPago ?? ""} className={CAMPO} /></Campo>
                  </div>
                  <div className="flex gap-4 text-sm"><label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereEdp" defaultChecked={h.requiereEdp} /> Requiere EDP</label><label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereHes" defaultChecked={h.requiereHes} /> Requiere HES</label></div>
                  <Campo etiqueta="Motivo (obligatorio si cambias el monto)"><input name="motivo" className={CAMPO} /></Campo>
                </FormAccion>
              )}
            </ConVentana>
            {!h.anulado && !h.factura && <BotonAccion accion={anularHitoAction.bind(null, h.id)} motivo={`¿Por qué se anula ${h.codigo}?`}>Anular hito</BotonAccion>}
          </div>
          <Seccion titulo="Historial" icono={<IconHistory size={15} />}>
            <ul className={`${TARJETA} max-h-80 divide-y divide-borde overflow-auto text-xs`}>
              {historial.map((x) => (
                <li key={x.id} className="px-4 py-2"><span className="font-semibold text-tinta">{x.detalle ?? x.accion}</span>{x.motivo && <span className="block text-gris">Motivo: {x.motivo}</span>}<span className="block text-gris-suave">{new Date(x.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · {x.usuario?.split("@")[0]}</span></li>
              ))}
              {historial.length === 0 && <li className="px-4 py-3 text-gris">Sin cambios registrados.</li>}
            </ul>
          </Seccion>
        </aside>
      </div>
    </div>
  );
}
