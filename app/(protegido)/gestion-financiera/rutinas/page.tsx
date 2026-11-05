import Link from "next/link";
import { RUTA_FIN, cargarVista, rutinasHechas } from "@/lib/fin/datos";
import { clpCorto, inicioDeMes, sumarDias } from "@/lib/fin/reglas";
import { TARJETA } from "@/lib/estilos";
import { Seccion } from "@/components/fin/piezas";
import MarcaRutina from "@/components/fin/MarcaRutina";

export const dynamic = "force-dynamic";

/** Semana ISO: «2026-W45». */
function semana(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primero = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((d.getTime() - primero.getTime()) / 86_400_000 - 3 + ((primero.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

export default async function RutinasPage() {
  const v = await cargarVista();
  const hechas = await rutinasHechas(v.empresa.id);
  const ayer = sumarDias(v.hoy, -1);
  const mesActual = v.hoy.slice(0, 7);
  const finMesPasado = sumarDias(inicioDeMes(v.hoy), -1);
  const porAclarar = v.movimientos.filter((m) => m.estado === "Por aclarar");
  const recibidasAyer = v.documentos.filter((d) => d.direccion === "recibido" && (d.fechaRecepcion ?? d.fechaEmision) >= ayer);
  const sinOc = v.compras.filter((c) => c.paso === "Factura sin OC: regularizar");
  const minReclamo = Math.min(...v.documentos.filter((d) => sinOc.some((c) => c.documentoIds.includes(d.id)) && d.diasParaReclamo !== null).map((d) => d.diasParaReclamo!), 99);
  const emitidasSinHito = v.documentos.filter((d) => d.direccion === "emitido" && [33, 34].includes(d.tipoDte) && d.estado === "vigente" && d.hitoIds.length === 0);
  const listas = v.hitos.filter((h) => h.etapa === "Lista para facturar");
  const vencidas = v.hitos.filter((h) => h.etapa === "Vencida");
  const porVencer7 = v.hitos.filter((h) => h.etapa === "Por cobrar" && h.vence && h.vence <= sumarDias(v.hoy, 7));
  const sinFecha = v.hitos.filter((h) => h.factura && !h.fechaEstimadaPago && h.saldo && h.saldo > 0);
  const confirmar = v.cesiones.filter((c) => c.estado === "Cliente pagó: confirmar con el factor");
  const visar = v.compras.filter((c) => c.paso === "Falta visado de Finanzas");
  // Sin cuentas no hay caja inicial: la proyección no es real y no debe alarmar.
  const sinCuentas = v.cuentas.length === 0;
  const faltaCaja = sinCuentas ? [] : v.flujo.meses.filter((m) => m.alerta === "FALTA CAJA");
  const porAclararMesPasado = porAclarar.filter((m) => m.fecha <= finMesPasado);

  const grupos = [
    {
      titulo: "Diario", periodo: v.hoy, tareas: [
        { id: "cargar-banco", t: "Cargar los movimientos de ayer (bancos y tarjeta), categorizar y ligar", c: `${porAclarar.length} por aclarar`, href: `${RUTA_FIN}/tesoreria` },
        { id: "asignar-consultas", t: "Asignar a quién preguntar lo que no se reconoce", c: `${porAclarar.filter((m) => !m.responsable).length} sin responsable · ${v.dashboard.movimientosEscalar} para escalar`, href: `${RUTA_FIN}/tesoreria?ver=escalar` },
        { id: "facturas-recibidas", t: "Revisar facturas recibidas: ligar a su OC o reclamar dentro de plazo", c: `${recibidasAyer.length} desde ayer · ${sinOc.length} sin OC${sinOc.length ? ` (mínimo ${minReclamo} días para reclamar)` : ""}`, href: `${RUTA_FIN}/compras?ver=facturas` },
        { id: "facturas-emitidas", t: "Revisar facturas emitidas: ligadas a su hito", c: `${emitidasSinHito.length} sin hito`, href: `${RUTA_FIN}/ventas?ver=facturas` },
        { id: "listo-facturar", t: "Ver «Lista para facturar» y emitir", c: `${listas.length} · ${clpCorto(listas.reduce((s, h) => s + h.totalConIva, 0))}`, href: `${RUTA_FIN}/ventas?etapa=Lista para facturar` },
      ],
    },
    {
      titulo: "Semanal", periodo: semana(v.hoy), tareas: [
        { id: "cobranza", t: "Cobranza: vencidas y por vencer, registrar fecha prometida", c: `${vencidas.length} vencidas · ${porVencer7.length} vencen en 7 días · ${sinFecha.length} sin fecha estimada`, href: `${RUTA_FIN}/ventas?etapa=Vencida` },
        { id: "factoring", t: "Factoring: confirmar con los factores qué clientes pagaron", c: `${confirmar.length} por confirmar`, href: `${RUTA_FIN}/tesoreria?ver=factoring` },
        { id: "visar-programar", t: "Visar compras y programar pagos según el flujo", c: `${visar.length} esperando visado · ${sinCuentas ? "sin cuentas creadas" : `holgura del mes ${clpCorto(v.flujo.meses[0]?.holgura ?? 0)}`}`, href: `${RUTA_FIN}/compras?ver=visar` },
        { id: "flujo", t: "Revisar el flujo de 3 meses y la holgura", c: faltaCaja.length ? `${faltaCaja.length} mes(es) con FALTA CAJA` : sinCuentas ? "Crea tus cuentas para proyectar la caja" : "Sin meses con falta de caja", href: `${RUTA_FIN}/tesoreria?ver=flujo` },
      ],
    },
    {
      titulo: "Mensual (cierre)", periodo: mesActual, tareas: [
        { id: "cierre-conciliado", t: "Todo conciliado al último día del mes", c: `${porAclararMesPasado.length} movimientos por aclarar del mes pasado`, href: `${RUTA_FIN}/tesoreria` },
        { id: "cuadrar-rcv", t: "Cuadrar emitidas y recibidas con el RCV del SII", c: "Libros del mes vs. Facturas compra y venta (SII)", href: `${RUTA_FIN}/contabilidad?ver=libros` },
        { id: "cuadrar-factores", t: "Cuadrar lo cedido con el informe de cada factor", c: `Exposición ${clpCorto(v.dashboard.cedidasVigentes)}`, href: `${RUTA_FIN}/tesoreria?ver=factoring` },
        { id: "paquete-contador", t: "Paquete al contador (libros, facturas, cartolas, nóminas, rendiciones, tarjeta)", c: "Libros y asientos en Contabilidad; exportar desde cada lista", href: `${RUTA_FIN}/contabilidad?ver=libros` },
        { id: "cerrar-periodo", t: "Cerrar el período", c: "Contabilidad → Cerrar período", href: `${RUTA_FIN}/contabilidad` },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gris">La rutina de 10–15 minutos al día para que nada se acumule. Cada tarea muestra su contador en vivo y lleva a la vista que la resuelve; márcala cuando esté hecha.</p>
      {grupos.map((g) => {
        const hechasG = g.tareas.filter((t) => hechas.has(`${t.id}|${g.periodo}`)).length;
        return (
          <Seccion key={g.titulo} titulo={`${g.titulo} · ${hechasG}/${g.tareas.length}`}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {g.tareas.map((t) => {
                const h = hechas.get(`${t.id}|${g.periodo}`);
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <MarcaRutina tarea={t.id} periodo={g.periodo} hecha={Boolean(h)} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${h ? "text-gris line-through" : "text-tinta"}`}>{t.t}</p>
                      <p className="text-[11px] text-gris">{t.c}{h ? ` · hecha por ${h.por?.split("@")[0]}` : ""}</p>
                    </div>
                    <Link href={t.href} className="text-xs font-semibold text-naranjo hover:underline">Ir</Link>
                  </li>
                );
              })}
            </ul>
          </Seccion>
        );
      })}
    </div>
  );
}
