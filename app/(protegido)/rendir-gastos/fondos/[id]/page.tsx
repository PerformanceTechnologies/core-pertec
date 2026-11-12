import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconHistory, IconNotebook, IconReceipt2, IconWallet } from "@tabler/icons-react";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import { contextoDeEmpresa } from "@/lib/empresas";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { listarRendiciones } from "@/lib/rendidor/datos";
import { historialDe, leerParametros, movimientosDe, obtenerFondo, rolesDe } from "@/lib/rendidor/fondos";
import { ETIQUETA_ESTADO_FONDO, ETIQUETA_MOVIMIENTO, estaVencido, pesos } from "@/lib/rendidor/fondos-modelo";
import { BarraUso, ChipFondo, Vacio } from "@/components/rendidor/fondos/Vistas";
import { BotonAccion } from "@/components/rendidor/fondos/ControlesFondo";
import ListaRendiciones from "@/components/rendidor/ListaRendiciones";
import NuevaRendicion from "@/components/rendidor/NuevaRendicion";
import {
  anularFondoAction,
  cerrarConAjusteAction,
  confirmarDevolucionAction,
  dejarSaldoAFavorAction,
  informarDevolucionAction,
  reponerFondoAction,
  transferirFondoAction,
  validarFondoAction,
  eliminarFondoAction,
} from "../../acciones-fondos";
import { eliminarRendicionAction } from "../../acciones";

export const dynamic = "force-dynamic";

const fecha = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Santiago" }) : "—");

export default async function FondoPage({ params }: { params: Promise<{ id: string }> }) {
  const { usuario, rol } = await exigirAccesoRendidor();
  const { id } = await params;
  const f = await obtenerFondo(id);
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!f || f.empresaId !== activa?.id) notFound();
  const yo = usuario.correo.toLowerCase();
  const roles = await rolesDe(usuario, rol === "admin", f.empresaId);
  const mio = f.rendidorCorreo === yo;
  if (!mio && !roles.length) notFound();

  const hoy = hoyEnSantiago().iso;
  const [movs, historial, parametros, todos] = await Promise.all([
    movimientosDe({ fondoId: id }),
    historialDe("fondo", id),
    leerParametros(f.empresaId),
    listarRendiciones({ usuarioId: usuario.id, correo: usuario.correo, verTodas: true }),
  ]);
  const informes = todos.filter((r) => r.fondoId === id);
  const abiertos = informes.filter((r) => ["borrador", "enviada", "rechazada", "aprobada", "reembolso_pendiente"].includes(r.estado)).length;
  const vencido = estaVencido(f, hoy);

  // Qué puede hacer esta persona aquí y ahora.
  const otro = !mio;
  const acciones: React.ReactNode[] = [];
  if (f.estado === "en_validacion" && otro && roles.includes("validador")) {
    acciones.push(<BotonAccion key="v" accion={validarFondoAction.bind(null, id, "aprueba")}>Validar</BotonAccion>);
    acciones.push(<BotonAccion key="r" accion={validarFondoAction.bind(null, id, "rechaza")} pide="¿Por qué se rechaza la solicitud?" tono="peligro">Rechazar</BotonAccion>);
  }
  if (f.estado === "por_transferir" && otro && roles.includes("tesoreria")) {
    acciones.push(<BotonAccion key="t" accion={transferirFondoAction.bind(null, id)} comprobante={{ fondoId: id }} pide={`Referencia de la transferencia de ${pesos(f.montoPorTransferir ?? 0)}:`}>Transferí {pesos(f.montoPorTransferir ?? 0)}</BotonAccion>);
  }
  if (f.estado === "devolucion_pendiente" && otro && roles.includes("tesoreria")) {
    acciones.push(<BotonAccion key="c" accion={confirmarDevolucionAction.bind(null, id)} confirma={`¿Llegó el depósito de ${pesos(f.devolucionMonto ?? 0)}?`}>Confirmar devolución</BotonAccion>);
  }
  if (f.estado === "cerrado_con_saldo" && otro && roles.includes("asignador")) {
    const dif = Math.max(0, (f.montoFijo ?? 0) - f.saldo);
    acciones.push(<BotonAccion key="p" accion={reponerFondoAction.bind(null, id)} confirma={`Se transferirá solo la diferencia: ${pesos(dif)}. ¿Crear la reposición?`}>Reponer {pesos(dif)}</BotonAccion>);
  }
  if (f.estado === "activo" && f.saldo > 0 && !abiertos && (mio || roles.includes("asignador"))) {
    if (mio) acciones.push(<BotonAccion key="d" accion={informarDevolucionAction.bind(null, id)} pide={`Devuelve ${pesos(f.saldo)} a la empresa y escribe la referencia de la transferencia:`} tono="secundario">Devolver {pesos(f.saldo)}</BotonAccion>);
    if (f.esFijo) acciones.push(<BotonAccion key="s" accion={dejarSaldoAFavorAction.bind(null, id)} confirma={`El fondo queda cerrado con ${pesos(f.saldo)} a favor hasta la reposición. ¿Seguir?`} tono="secundario">Dejar saldo a favor</BotonAccion>);
  }
  if (f.estado === "activo" && !abiertos && roles.includes("administrador")) {
    acciones.push(<BotonAccion key="aj" accion={cerrarConAjusteAction.bind(null, id)} pide={`Se registra un ajuste de ${pesos(-f.saldo)} para dejar el saldo en cero y se cierra el fondo. Motivo:`} tono="peligro">Cerrar con ajuste</BotonAccion>);
  }
  if (["en_validacion", "validado", "por_transferir"].includes(f.estado) && (roles.includes("asignador") || roles.includes("administrador"))) {
    acciones.push(<BotonAccion key="a" accion={anularFondoAction.bind(null, id)} pide="¿Por qué se anula el fondo?" tono="peligro">Anular</BotonAccion>);
  }

  // Solo el administrador del Core: elimina el fondo con todo lo suyo (para limpiar pruebas).
  if (usuario.rol === "admin") {
    acciones.push(
      <BotonAccion key="del" accion={eliminarFondoAction.bind(null, id)} irA="/rendir-gastos?ver=fondos" confirma={`Se elimina para siempre ${f.codigo} con sus movimientos, informes, gastos y documentos. No se puede deshacer.`} pide={`Escribe «${f.codigo}» para confirmar:`} tono="peligro">Eliminar fondo</BotonAccion>,
    );
  }

  const fondosParaInforme = f.estado === "activo" && (mio || rol === "admin" || usuario.rol === "admin")
    ? [{ id: f.id, codigo: f.codigo, rendidorNombre: f.rendidorNombre, saldo: f.saldo, motivo: f.motivo, esMio: mio }]
    : [];

  return (
    <div className="animar-entrada space-y-5">
      <Link href="/rendir-gastos?ver=fondos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a fondos
      </Link>

      <header className="banda-contraste overflow-hidden rounded-2xl px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-naranjo/20 text-naranjo"><IconWallet size={24} /></span>
          <div className="min-w-[12rem] flex-1">
            <h1 className="texto-banda font-condensed text-2xl font-bold uppercase tracking-tight sm:text-3xl">Fondo {f.codigo}</h1>
            <p className="texto-banda-65 mt-1 text-sm">{f.rendidorNombre}{f.motivo ? ` · ${f.motivo}` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChipFondo estado={f.estado} />
            {f.esFijo && <span className="rounded-full bg-teal-500/20 px-2.5 py-1 text-[11px] font-bold text-teal-200">Fondo fijo</span>}
            {vencido && <span className="rounded-full bg-rose-500/25 px-2.5 py-1 text-[11px] font-bold text-rose-200">Vencido</span>}
          </div>
        </div>
        <dl className="borde-banda mt-5 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-4">
          <Dato etiqueta="Saldo" valor={pesos(f.saldo)} />
          <Dato etiqueta="Transferido" valor={pesos(f.transferido)} />
          <Dato etiqueta="Gastado" valor={pesos(f.gastado)} />
          <Dato etiqueta={f.estado === "activo" ? "Vence" : "Autorizado"} valor={f.estado === "activo" ? fecha(f.venceEn) : pesos(f.montoAutorizado ?? f.montoSolicitado ?? 0)} />
        </dl>
        {f.estado === "activo" && <div className="texto-banda mt-3"><BarraUso f={f} umbral={parametros.umbralAvisoLimite} /></div>}
        {acciones.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{acciones}</div>}
      </header>

      {f.estado === "rechazado" && f.motivoRechazo && <Nota tono="rose">Rechazado: {f.motivoRechazo}</Nota>}
      {f.estado === "anulado" && f.motivoAnulacion && <Nota tono="rose">Anulado: {f.motivoAnulacion}</Nota>}
      {f.estado === "activo" && f.saldo > 0 && abiertos === 0 && mio && (
        <Nota tono="emerald">Tienes {pesos(f.saldo)} a favor. Puedes seguir rindiendo con un nuevo informe{f.esFijo ? ", devolverlo o dejarlo a favor para la reposición" : " o devolverlo"}.</Nota>
      )}
      {f.estado === "devolucion_pendiente" && <Nota tono="amber">Devolución de {pesos(f.devolucionMonto ?? 0)} informada (ref. {f.devolucionReferencia}). Falta que Tesorería la confirme.</Nota>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconReceipt2 size={18} className="text-naranjo" />
              <h2 className="flex-1 text-base font-bold text-tinta">Informes</h2>
              {fondosParaInforme.length > 0 && <NuevaRendicion empresa={activa?.nombre} fondos={fondosParaInforme} />}
            </div>
            {informes.length === 0 ? <Vacio texto={f.estado === "activo" ? "Aún no hay informes: crea uno y sube tus boletas." : "Sin informes."} /> : (
              <ListaRendiciones rendiciones={informes} revisa={false} filtroInicial="todas" borrar={eliminarRendicionAction} />
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <IconNotebook size={18} className="text-naranjo" />
              <h2 className="text-base font-bold text-tinta">Movimientos</h2>
            </div>
            {movs.length === 0 ? <Vacio texto="Todavía no hay movimientos de dinero." /> : (
              <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
                {movs.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-3 text-sm">
                    <span className="min-w-[10rem] flex-1">
                      <span className="block font-semibold text-tinta">{ETIQUETA_MOVIMIENTO[m.tipo]}</span>
                      <span className="block text-[11px] text-gris">{fecha(m.fecha)}{m.referenciaBanco ? ` · ref. ${m.referenciaBanco}` : ""}{m.motivo ? ` · ${m.motivo}` : ""}{m.comprobante && <> · <a href={`/api/rendidor/comprobante/${m.id}`} target="_blank" rel="noopener" className="font-semibold text-naranjo hover:underline">Ver comprobante</a></>}</span>
                    </span>
                    <span className={`font-condensed text-lg font-bold tabular-nums ${m.signo > 0 ? "text-emerald-600" : "text-tinta"}`}>{m.signo > 0 ? "+" : "−"}{pesos(m.monto)}</span>
                    <span className="w-24 text-right text-[11px] text-gris">saldo {pesos(m.saldoResultante)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="h-fit rounded-2xl border border-borde bg-superficie p-4 xl:sticky xl:top-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60"><IconHistory size={14} /> Historial</h2>
          <ol className="relative space-y-3 border-l border-borde pl-4">
            {historial.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-superficie bg-naranjo" />
                <p className="text-sm text-tinta">{ETIQUETA_ESTADO_FONDO[h.hacia as keyof typeof ETIQUETA_ESTADO_FONDO] ?? h.hacia}</p>
                <p className="text-[11px] text-gris">{h.usuario.split("@")[0]} · {fecha(h.fecha)}</p>
                {h.comentario && <p className="text-[11px] text-gris-suave">{h.comentario}</p>}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className="texto-banda mt-1 font-condensed text-2xl font-bold tabular-nums">{valor}</dd>
    </div>
  );
}

function Nota({ tono, children }: { tono: "rose" | "emerald" | "amber"; children: React.ReactNode }) {
  const c = { rose: "border-rose-300/60 bg-rose-500/[0.06] text-rose-700", emerald: "border-emerald-300/60 bg-emerald-500/[0.06] text-emerald-800", amber: "border-amber-300/60 bg-amber-500/[0.06] text-amber-800" }[tono];
  return <p className={`rounded-2xl border px-5 py-3.5 text-sm ${c}`}>{children}</p>;
}
