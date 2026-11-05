import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconCheck, IconPrinter } from "@tabler/icons-react";
import { RUTA_FIN, adjuntosDe, cargarComercial, cargarVista, contextoFin, historialDe, lineasDeCotizacion, productosInventario } from "@/lib/fin/datos";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { ETIQUETA_ESTADO_COTIZACION, ETIQUETA_TIPO_VENTA, lineaNeta } from "@/lib/fin/modelo";
import { TARJETA } from "@/lib/estilos";
import { aceptarCotizacionAction, cambiarEstadoCotizacionAction, nuevaVersionCotizacionAction } from "../../../acciones-ventas";
import { Chip, Deshabilitado, Seccion } from "@/components/fin/piezas";
import { BotonAccion, Campo, ConVentana, FormAccion, SubirAdjunto } from "@/components/fin/ui";
import { BOTON, BOTON_SEC, CAMPO } from "@/components/fin/estilos";
import EditorCotizacion from "@/components/fin/EditorCotizacion";
import EnlaceAdjunto from "@/components/fin/EnlaceAdjunto";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [v, com, ctx] = await Promise.all([cargarVista(), cargarComercial(), contextoFin()]);
  const c = com.cotizaciones.find((x) => x.id === id);
  if (!c) notFound();
  const [lineas, adjuntos, historial, productos] = await Promise.all([lineasDeCotizacion(id), adjuntosDe("cotizacion", id), historialDe(ctx.empresa.id, id), productosInventario()]);
  const editable = ["borrador", "enviada"].includes(c.estado);
  const hitos = v.hitos.filter((h) => h.cotizacionId === id);
  const cliente = c.clienteId ? v.nombreDe.get(c.clienteId) : null;

  return (
    <div className="space-y-5">
      <Link href={`${RUTA_FIN}/comercial?ver=cotizaciones`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo"><IconArrowLeft size={14} /> Cotizaciones</Link>
      <header className={`${TARJETA} flex flex-wrap items-start gap-4 p-5`}>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gris">{c.numero}{c.version > 1 ? ` · versión ${c.version}` : ""} · {ETIQUETA_TIPO_VENTA[c.tipo]}</p>
          <h2 className="text-lg font-extrabold text-tinta">{c.titulo}</h2>
          <p className="text-sm text-gris">{cliente ?? "Sin cliente"} · {fechaCl(c.fecha)} · válida {c.validezDias} días{c.fechaAceptacion ? ` · aceptada el ${fechaCl(c.fechaAceptacion)}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Chip texto={ETIQUETA_ESTADO_COTIZACION[c.estado]} tono={c.estado === "aceptada" ? "bg-emerald-500/12 text-ok" : "bg-slate-500/10 text-gris"} />{c.motivo && <span className="text-xs text-gris">Motivo: {c.motivo}</span>}</div>
        </div>
        <div className="text-right">
          <p className="font-condensed text-3xl font-bold tabular-nums text-tinta">{clp(c.total)}</p>
          <p className="text-xs text-gris">neto {clp(c.neto)} · IVA {clp(c.iva)}</p>
        </div>
      </header>

      {/* Acciones (cadena del documento) */}
      <div className="flex flex-wrap items-center gap-2">
        {c.estado === "borrador" && <BotonAccion accion={cambiarEstadoCotizacionAction.bind(null, id, "enviada")} className={BOTON_SEC}>Marcar enviada</BotonAccion>}
        {editable && (
          <ConVentana boton={<><IconCheck size={15} /> Aceptar cotización</>} titulo={`Aceptar ${c.numero}`} descripcion="Crea el proyecto (si hace falta) y los hitos a facturar, en un solo paso." ancho="max-w-2xl" className={BOTON}>
            {(
              <FormAccion accion={aceptarCotizacionAction.bind(null, id)} textoBoton="Aceptar y generar hitos">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Fecha de aceptación *"><input name="fechaAceptacion" type="date" required defaultValue={v.hoy} className={CAMPO} /></Campo>
                  <Campo etiqueta="N° OC del cliente" ayuda="Vacío = camino «sin OC»: llegará después y es requisito para facturar"><input name="ocCliente" className={CAMPO} /></Campo>
                </div>
                {!c.proyectoId && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo etiqueta="Proyecto">
                      <select name="proyectoId" className={CAMPO} defaultValue=""><option value="">Crear uno nuevo</option>{v.proyectos.filter((p) => p.estado === "activo" && !p.esGeneral).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
                    </Campo>
                    <Campo etiqueta="Nombre del proyecto nuevo"><input name="nombreProyecto" defaultValue={c.titulo} className={CAMPO} /></Campo>
                    <Campo etiqueta="Tipo de proyecto"><select name="tipoProyecto" defaultValue={c.tipo === "arriendo" ? "arriendo" : "contrato"} className={CAMPO}><option value="contrato">Contrato</option><option value="spot">Spot</option><option value="arriendo">Arriendo</option></select></Campo>
                  </div>
                )}
                <fieldset className="space-y-2 rounded-xl border border-borde p-3">
                  <legend className="px-1 text-xs font-semibold text-gris">¿Cómo se factura?</legend>
                  <label className="flex items-center gap-2 text-sm"><input type="radio" name="modo" value="unica" defaultChecked={c.tipo !== "arriendo"} /> Un solo hito («Única»)</label>
                  <label className="flex flex-wrap items-center gap-2 text-sm"><input type="radio" name="modo" value="partes" /> En <input name="partes" defaultValue={3} className="w-14 rounded border border-borde px-1.5 py-0.5 text-center" /> hitos iguales</label>
                  <label className="flex flex-wrap items-center gap-2 text-sm"><input type="radio" name="modo" value="mensual" defaultChecked={c.tipo === "arriendo"} /> {c.tipo === "arriendo" ? "Un hito por mes de arriendo" : "EDP mensuales"} del <input name="desde" type="date" defaultValue={v.hoy} className="rounded border border-borde px-1.5 py-0.5" /> al <input name="hasta" type="date" className="rounded border border-borde px-1.5 py-0.5" /></label>
                  <label className="ml-6 flex items-center gap-2 text-xs text-gris">Monto por mes (opcional; vacío = repartir el neto) <input name="montoMensual" className="w-32 rounded border border-borde px-1.5 py-0.5" /></label>
                </fieldset>
                <p className="text-[11px] text-gris">Adjunta la evidencia de aceptación (correo o firma del cliente) en «Respaldos» después de aceptar.</p>
              </FormAccion>
            )}
          </ConVentana>
        )}
        {editable && <BotonAccion accion={cambiarEstadoCotizacionAction.bind(null, id, "rechazada")} motivo="¿Por qué la rechazó el cliente?">Rechazada</BotonAccion>}
        {c.estado !== "aceptada" && c.estado !== "reemplazada" && <BotonAccion accion={nuevaVersionCotizacionAction.bind(null, id)} irA={`${RUTA_FIN}/comercial/cotizaciones/`} confirmar="Se crea una nueva versión (V+1) y esta queda reemplazada.">Nueva versión</BotonAccion>}
        {editable && <BotonAccion accion={cambiarEstadoCotizacionAction.bind(null, id, "anulada")} motivo="¿Por qué se anula?">Anular</BotonAccion>}
        <Deshabilitado motivo="Formato en diseño" clase={BOTON_SEC}><IconPrinter size={14} /> Imprimir</Deshabilitado>
        <span className="flex-1" />
        <SubirAdjunto entidadTipo="cotizacion" entidadId={id} tipo="cotizacion_cliente" texto="Adjuntar respaldo" />
      </div>

      {/* Cadena: oportunidad · proyecto · hitos */}
      {(c.oportunidadId || hitos.length > 0 || c.proyectoId) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {c.oportunidadId && <span className="rounded-full border border-borde px-3 py-1">Oportunidad: {com.oportunidades.find((o) => o.id === c.oportunidadId)?.nombre}</span>}
          {c.proyectoId && <Link href={`${RUTA_FIN}/proyectos/${c.proyectoId}`} className="rounded-full border border-borde px-3 py-1 hover:border-naranjo/50">Proyecto: {v.proyectos.find((p) => p.id === c.proyectoId)?.nombre}</Link>}
          {hitos.length > 0 && <Link href={`${RUTA_FIN}/ventas`} className="rounded-full border border-borde px-3 py-1 hover:border-naranjo/50">{hitos.length} hito(s): {hitos.map((h) => h.codigo).join(", ")}</Link>}
        </div>
      )}

      {editable ? (
        <EditorCotizacion
          inicial={{ id, titulo: c.titulo, clienteId: c.clienteId, oportunidadId: c.oportunidadId, proyectoId: c.proyectoId, tipo: c.tipo, fecha: c.fecha, validezDias: c.validezDias, condicionPagoDias: c.condicionPagoDias, requiereOc: c.requiereOc, requiereEdp: c.requiereEdp, requiereHes: c.requiereHes, notas: c.notas, lineas }}
          clientes={v.contrapartes.map((x) => ({ id: x.id, nombre: x.nombre, rut: x.rut }))}
          perfiles={Object.fromEntries([...v.perfiles.values()].map((p) => [p.contactoId, { condicion: p.condicionVentaDias, oc: p.requiereOc, edp: p.requiereEdp, hes: p.requiereHes }]))}
          productos={productos}
          proyectos={v.proyectos.filter((p) => p.estado === "activo" && !p.esGeneral).map((p) => ({ id: p.id, nombre: p.nombre }))}
          oportunidades={com.oportunidades.map((o) => ({ id: o.id, nombre: o.nombre }))}
          tasaIva={v.p.tasaIva}
        />
      ) : (
        <div className={`${TARJETA} overflow-x-auto`}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead><tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris"><th className="px-4 py-2.5">Descripción</th><th className="px-3 py-2.5 text-right">Cantidad</th><th className="px-3 py-2.5 text-right">Precio</th><th className="px-4 py-2.5 text-right">Neto</th></tr></thead>
            <tbody className="divide-y divide-borde">{lineas.map((l, i) => <tr key={i}><td className="px-4 py-2">{l.descripcion}{l.exento ? " (exento)" : ""}</td><td className="px-3 py-2 text-right tabular-nums">{l.cantidad} {l.unidad}{l.meses ? ` × ${l.meses} meses` : ""}</td><td className="px-3 py-2 text-right tabular-nums">{clp(l.precioUnitario)}</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{clp(lineaNeta(l))}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Seccion titulo="Respaldos">
          <ul className={`${TARJETA} divide-y divide-borde text-sm`}>
            {adjuntos.map((a) => <li key={a.id} className="px-4 py-2"><EnlaceAdjunto id={a.id} nombre={a.nombre} /></li>)}
            {adjuntos.length === 0 && <li className="px-4 py-3 text-xs text-gris">Sin respaldos.</li>}
          </ul>
        </Seccion>
        <Seccion titulo="Historial">
          <ul className={`${TARJETA} max-h-64 divide-y divide-borde overflow-auto text-xs`}>
            {historial.map((x) => <li key={x.id} className="px-4 py-2"><span className="font-semibold text-tinta">{x.detalle ?? x.accion}</span>{x.motivo && <span className="block text-gris">Motivo: {x.motivo}</span>}<span className="block text-gris-suave">{new Date(x.creadoEn).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · {x.usuario?.split("@")[0]}</span></li>)}
          </ul>
        </Seccion>
      </div>
    </div>
  );
}
