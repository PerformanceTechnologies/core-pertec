import Link from "next/link";
import { notFound } from "next/navigation";
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconCircleCheck, IconHistory, IconReceipt2 } from "@tabler/icons-react";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import {
  PASOS_RENDICION,
  accionesPosibles,
  esEditable,
  problemasParaEnviar,
  puedeAbrirRendicion,
  puedeVerRendicionesAjenas,
  saldoRendicion,
} from "@/lib/permisos-rendidor";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { urlFirmadaDeRespaldo } from "@/lib/rendidor/almacenamiento";
import PanelRendicion from "@/components/rendidor/PanelRendicion";
import FlujoRendicion, { EditarCabecera } from "@/components/rendidor/FlujoRendicion";
import { ChipEstadoRendicion, money } from "@/components/rendidor/Visual";
import { leerParametros, obtenerFondo, rolesDe } from "@/lib/rendidor/fondos";
import { gastoRendido, pesos } from "@/lib/rendidor/fondos-modelo";
import { BotonAccion } from "@/components/rendidor/fondos/ControlesFondo";
import { pagarReembolsoAction } from "../acciones-fondos";
import type { AccionRendicion } from "@/lib/permisos-rendidor";

export const dynamic = "force-dynamic";

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });

export default async function RendicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { usuario, rol } = await exigirAccesoRendidor();
  const { id } = await params;

  const rendicion = await obtenerRendicion(id);
  if (!rendicion) notFound();
  // Informes con fondo: también los abren quienes revisan, transfieren o administran Fondos.
  const conFondo = Boolean(rendicion.fondoId && rendicion.empresaId);
  const rolesFondos = conFondo ? await rolesDe(usuario, rol === "admin", rendicion.empresaId!) : [];
  // Cada quien ve lo suyo (lo que creó o rinde); quien administra gastos, todas.
  if (!puedeAbrirRendicion(rendicion.creadoPor, usuario.id, usuario.rol, rol, rendicion.rindeCorreo, usuario.correo) && !rolesFondos.length) notFound();

  const esMia = rendicion.creadoPor === usuario.id || rendicion.rindeCorreo?.toLowerCase() === usuario.correo.toLowerCase();
  const rindeYo = rendicion.rindeCorreo?.toLowerCase() === usuario.correo.toLowerCase();
  const revisa = conFondo ? rolesFondos.includes("revisor") && !rindeYo : puedeVerRendicionesAjenas(usuario.rol, rol);
  const acciones: AccionRendicion[] = conFondo
    ? [
        ...(esMia && esEditable(rendicion.estado) ? (["enviar"] as const) : []),
        ...(esMia && rendicion.estado === "enviada" ? (["retirar"] as const) : []),
        ...(revisa && rendicion.estado === "enviada" ? (["aprobar", "rechazar"] as const) : []),
      ]
    : accionesPosibles({ estado: rendicion.estado, esMia }, revisa, usuario.rol === "admin");
  const editable = esEditable(rendicion.estado) && (conFondo ? esMia : esMia || revisa);
  const [fondo, parametros] = conFondo ? await Promise.all([obtenerFondo(rendicion.fondoId!), leerParametros(rendicion.empresaId!)]) : [null, null];
  const rendido = gastoRendido(rendicion.gastos);
  // Lo disponible del fondo antes de este informe (sus gastos entran al libro recién al aprobarse).
  const yaEnLibro = rendicion.estado === "cerrada" || rendicion.estado === "reembolso_pendiente" || rendicion.estado === "reembolsada";
  const disponible = fondo ? (yaEnLibro ? fondo.saldo + rendido : fondo.saldo) : 0;
  const usoPct = disponible > 0 ? Math.round((rendido / disponible) * 100) : rendido > 0 ? 100 : 0;
  const cercaDelLimite = Boolean(fondo && parametros && !yaEnLibro && usoPct >= parametros.umbralAvisoLimite * 100);
  const total = rendicion.gastos.reduce((s, g) => s + (Number(g.total) || 0), 0);
  const saldo = saldoRendicion(total, rendicion.montoAsignado);
  const problemas = problemasParaEnviar(rendicion.gastos);

  // URLs firmadas para ver cada comprobante, DESPUÉS del chequeo de acceso: son
  // credenciales portadoras. En paralelo: son N llamadas independientes.
  const conRespaldo = rendicion.gastos.filter((g) => g.archivoPath);
  const firmadas = await Promise.all(conRespaldo.map((g) => urlFirmadaDeRespaldo(g.archivoPath)));
  const urlsRespaldo: Record<string, string> = {};
  conRespaldo.forEach((g, i) => {
    if (firmadas[i]) urlsRespaldo[g.id] = firmadas[i]!;
  });

  // En qué paso va: rechazada se dibuja en el primero, con su aviso aparte.
  const indice =
    rendicion.estado === "rechazada" ? 0
    : rendicion.estado === "reembolso_pendiente" ? 2
    : rendicion.estado === "cerrada" || rendicion.estado === "reembolsada" ? 3
    : PASOS_RENDICION.findIndex((p) => p.estado === rendicion.estado);
  const terminado = rendicion.estado === "pagada" || rendicion.estado === "cerrada";
  const historica = rendicion.estado === "cargada_odoo";

  const historial = [
    { cuando: rendicion.creadoEn, que: "Creada" },
    rendicion.enviadaEn && { cuando: rendicion.enviadaEn, que: "Enviada a revisión" },
    rendicion.revisadaEn && {
      cuando: rendicion.revisadaEn,
      que: `${rendicion.estado === "rechazada" ? "Rechazada" : "Aprobada"} por ${rendicion.revisadaPor ?? "—"}`,
    },
    rendicion.pagadaEn && { cuando: rendicion.pagadaEn, que: `Pagada por ${rendicion.pagadaPor ?? "—"}${rendicion.notaPago ? ` · ${rendicion.notaPago}` : ""}` },
  ].filter(Boolean) as { cuando: string; que: string }[];

  return (
    <div className="animar-entrada space-y-5">
      <Link href="/rendir-gastos" className="inline-flex items-center gap-1 text-sm font-semibold text-gris transition hover:text-tinta">
        <IconArrowLeft size={16} /> Volver a rendiciones
      </Link>

      {/* ── Cabecera ── */}
      <header className="banda-contraste overflow-hidden rounded-2xl px-5 py-5 sm:px-8 sm:py-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-naranjo/20 text-naranjo">
            <IconReceipt2 size={24} stroke={1.75} />
          </span>
          <div className="min-w-[12rem] flex-1">
            <h1 className="texto-banda font-condensed text-2xl font-bold uppercase leading-tight tracking-tight sm:text-3xl">{rendicion.tituloRendicion}</h1>
            <p className="texto-banda-65 mt-1 text-sm">
              {rendicion.nombreQuienRinde} · {rendicion.empresaCompanyId === 2 ? "Performance Service SpA" : "Performance Technologies SpA"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ChipEstadoRendicion estado={rendicion.estado} />
            {editable && <EditarCabecera id={rendicion.id} titulo={rendicion.tituloRendicion} monto={rendicion.montoAsignado} />}
          </div>
        </div>

        {/* Los pasos del ciclo */}
        {!historica && (
          <ol className="mt-6 grid gap-2 sm:grid-cols-4">
            {PASOS_RENDICION.map((p, i) => {
              const hecho = i < indice || terminado;
              const actual = i === indice && !terminado;
              return (
                <li key={p.estado} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${actual ? "border-naranjo bg-naranjo/15" : "borde-banda"}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${hecho ? "bg-emerald-500 text-white" : actual ? "bg-naranjo text-white" : "texto-banda-45 border borde-banda"}`}>
                    {hecho ? <IconCheck size={15} /> : i + 1}
                  </span>
                  <span className={`text-sm font-bold ${actual || hecho ? "texto-banda" : "texto-banda-65"}`}>
                    {i === 0 && rendicion.estado === "rechazada" ? "Corregir" : i === 3 && conFondo ? (rendicion.estado === "reembolso_pendiente" ? "Reembolso" : "Cerrada") : p.etiqueta}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {fondo ? (
        <dl className="borde-banda mt-5 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-4">
          <div>
            <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">Fondo</dt>
            <dd className="mt-1"><Link href={`/rendir-gastos/fondos/${fondo.id}`} className="font-condensed text-2xl font-bold text-naranjo underline-offset-2 hover:underline">{fondo.codigo}</Link></dd>
          </div>
          <Dato etiqueta="Disponible" valor={pesos(disponible)} />
          <Dato etiqueta="Rendido aquí" valor={pesos(rendido)} />
          <Dato etiqueta={disponible - rendido >= 0 ? "Quedaría" : "Exceso"} valor={pesos(Math.abs(disponible - rendido))} tono={disponible - rendido < 0 ? "text-orange-400" : undefined} />
        </dl>
        ) : (
        <dl className="borde-banda mt-5 grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl border px-5 py-4 sm:grid-cols-4">
          <Dato etiqueta="Fondo entregado" valor={money(rendicion.montoAsignado)} />
          <Dato etiqueta="Total rendido" valor={money(total)} />
          <Dato
            etiqueta={saldo > 0 ? "A reembolsar" : saldo < 0 ? "A reintegrar" : "Saldo"}
            valor={money(Math.abs(saldo))}
            tono={saldo > 0 ? "text-emerald-400" : saldo < 0 ? "text-amber-400" : undefined}
          />
          <Dato etiqueta="Comprobantes" valor={String(rendicion.gastos.length)} />
        </dl>
        )}

        {acciones.length > 0 && (
          <div className="mt-5">
            <FlujoRendicion id={rendicion.id} acciones={acciones} problemasEnvio={problemas} saldo={saldo} nombre={rendicion.nombreQuienRinde} />
          </div>
        )}
      </header>

      {/* Avisos según el estado */}
      {cercaDelLimite && esMia && esEditable(rendicion.estado) && (
        <Aviso tono="rose" titulo={usoPct >= 100 ? "Te pasaste del fondo" : `Llevas el ${usoPct}% del fondo`} Icono={IconAlertTriangle}>
          {usoPct >= 100 ? "Lo que rindas sobre el fondo se te reembolsa al aprobarse. " : ""}Te conviene enviar este informe a revisión.
        </Aviso>
      )}
      {rendicion.estado === "reembolso_pendiente" && fondo && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-orange-300/60 bg-orange-500/[0.06] px-5 py-4 text-sm text-orange-800">
          <IconAlertTriangle size={20} className="shrink-0" />
          <p className="min-w-[12rem] flex-1"><b>Reembolso pendiente: {pesos(-fondo.saldo)}.</b> Se gastó más que el fondo; Tesorería lo paga y el fondo se cierra.</p>
          {rolesFondos.includes("tesoreria") && !rindeYo && (
            <BotonAccion accion={pagarReembolsoAction.bind(null, rendicion.id)} pide="Referencia de la transferencia del reembolso:">Pagué el reembolso</BotonAccion>
          )}
        </div>
      )}
      {rendicion.estado === "rechazada" && rendicion.motivoRechazo && (
        <Aviso tono="rose" titulo="Hay que corregir" Icono={IconAlertTriangle}>
          {rendicion.motivoRechazo}
          <span className="mt-1 block text-xs opacity-75">Corrige los comprobantes y vuelve a enviarla.</span>
        </Aviso>
      )}
      {rendicion.estado === "enviada" && (
        <Aviso tono="sky" titulo={esMia ? "En revisión" : "Esperando tu revisión"} Icono={IconHistory}>
          {esMia ? "Ya no se puede editar. Si necesitas corregir algo, retírala." : conFondo ? "Abre cada boleta y acéptala, obsérvala o recházala. Después aprueba el informe u obsérvalo para que lo corrijan." : "Revisa los comprobantes de abajo y apruébala o recházala con el motivo."}
        </Aviso>
      )}
      {rendicion.estado === "pagada" && (
        <Aviso tono="emerald" titulo="Pagada" Icono={IconCircleCheck}>
          {rendicion.notaPago ?? "La rendición está cerrada."}
        </Aviso>
      )}
      {historica && (
        <Aviso tono="violet" titulo="Rendición histórica" Icono={IconHistory}>
          Se cargó a Odoo antes de que Rendir Gastos quedara solo en el Core. Se conserva para consulta y para descargar su planilla.
        </Aviso>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
        <PanelRendicion rendicionInicial={rendicion} urlsRespaldo={urlsRespaldo} editable={editable} puedeEnviar={acciones.includes("enviar")} revisarBoletas={conFondo && revisa && rendicion.estado === "enviada"} />

        {/* Historial */}
        <aside className="h-fit rounded-2xl border border-borde bg-superficie p-4 xl:sticky xl:top-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-tinta/60">
            <IconHistory size={14} /> Historial
          </h2>
          <ol className="relative space-y-3 border-l border-borde pl-4">
            {historial.map((h, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.3rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-superficie bg-naranjo" />
                <p className="text-sm text-tinta">{h.que}</p>
                <p className="text-[11px] text-gris">{fechaHora(h.cuando)}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div>
      <dt className="texto-banda-45 text-[10px] font-semibold uppercase tracking-[0.14em]">{etiqueta}</dt>
      <dd className={`mt-1 font-condensed text-2xl font-bold tabular-nums ${tono ?? "texto-banda"}`}>{valor}</dd>
    </div>
  );
}

const TONOS = {
  rose: "border-rose-300/60 bg-rose-500/[0.06] text-rose-700 dark:text-rose-300",
  sky: "border-sky-300/60 bg-sky-500/[0.06] text-sky-700 dark:text-sky-300",
  emerald: "border-emerald-300/60 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300",
  violet: "border-violet-300/60 bg-violet-500/[0.06] text-violet-700 dark:text-violet-300",
} as const;

function Aviso({ tono, titulo, Icono, children }: { tono: keyof typeof TONOS; titulo: string; Icono: typeof IconHistory; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${TONOS[tono]}`}>
      <Icono size={20} className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-bold">{titulo}</p>
        <p className="mt-0.5 whitespace-pre-line">{children}</p>
      </div>
    </div>
  );
}
