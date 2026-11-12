import Link from "next/link";
import {
  IconBuildingBank,
  IconChecklist,
  IconClipboardCheck,
  IconFileInvoice,
  IconHome,
  IconListDetails,
  IconNotebook,
  IconReceipt,
  IconReceipt2,
  IconSettings,
  IconUserCheck,
  IconWallet,
} from "@tabler/icons-react";
import { exigirAccesoRendidor } from "@/lib/rendidor/permisos";
import { puedeVerRendicionesAjenas } from "@/lib/permisos-rendidor";
import { listarPersonas, listarRendiciones, todosLosGastos } from "@/lib/rendidor/datos";
import { SLUG_POR_OMISION } from "@/lib/empresas-modelo";
import { contextoDeEmpresa } from "@/lib/empresas";
import { hoyEnSantiago } from "@/lib/graph-calendario";
import { fondosConSaldoAFavor, leerParametros, listarFondos, listarRoles, movimientosDe, rolesDe } from "@/lib/rendidor/fondos";
import { ETIQUETA_ESTADO_FONDO, ETIQUETA_MOVIMIENTO, pesos, type EstadoFondo, type Fondo, type RolFondos } from "@/lib/rendidor/fondos-modelo";
import ListaRendiciones from "@/components/rendidor/ListaRendiciones";
import EnVivo from "@/components/rendidor/EnVivo";
import ConmutadorTodos from "@/components/rendidor/ConmutadorTodos";
import TodosLosGastos from "@/components/rendidor/TodosLosGastos";
import NuevaRendicion from "@/components/rendidor/NuevaRendicion";
import { AsignarFondo, BotonAccion, CargarFondo, SolicitarFondo } from "@/components/rendidor/fondos/ControlesFondo";
import ConfiguracionFondos from "@/components/rendidor/fondos/ConfiguracionFondos";
import { FilaFondo, Vacio } from "@/components/rendidor/fondos/Vistas";
import {
  anularFondoAction,
  conciliarAction,
  confirmarDevolucionAction,
  pagarReembolsoAction,
  pedirDevolucionAction,
  reponerFondoAction,
  transferirFondoAction,
  validarFondoAction,
} from "./acciones-fondos";
import { eliminarRendicionAction } from "./acciones";

export const dynamic = "force-dynamic";

type Pestana = "inicio" | "fondos" | "gastos" | "informes" | "todos-gastos" | "todos-informes" | "todos-fondos" | "validar" | "asignar" | "tesoreria" | "revisar" | "libro" | "config";

export default async function RendirGastosPage({ searchParams }: { searchParams: Promise<{ ver?: string; estado?: string }> }) {
  const { usuario, rol } = await exigirAccesoRendidor();
  const { ver, estado: estadoFiltro } = await searchParams;
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const empresaId = activa!.id;
  const yo = usuario.correo.toLowerCase();
  const hoy = hoyEnSantiago().iso;

  const roles = await rolesDe(usuario, rol === "admin", empresaId);
  const tiene = (r: RolFondos) => roles.includes(r);
  const revisaAntiguas = puedeVerRendicionesAjenas(usuario.rol, rol);
  // Administrador de gastos (o del Core): ve todo lo de todos, en vivo.
  const esAdmin = rol === "admin" || roles.includes("administrador");

  // Sin el SQL de Fondos corrido, la página no se cae: avisa qué falta.
  const [lecturaFondos, rendiciones, parametros] = await Promise.all([
    listarFondos(empresaId).then(
      (fs) => ({ fondos: fs, error: null as string | null }),
      (e: unknown) => ({ fondos: [] as Fondo[], error: e instanceof Error ? e.message : "No se pudieron leer los fondos." }),
    ),
    listarRendiciones({ usuarioId: usuario.id, correo: usuario.correo, empresa: { id: empresaId, porOmision: activa!.slug === SLUG_POR_OMISION }, verTodas: revisaAntiguas || esAdmin || tiene("revisor") || tiene("tesoreria") }),
    leerParametros(empresaId),
  ]);
  const fondos = lecturaFondos.fondos;
  const faltaSql = lecturaFondos.error;
  const misFondos = fondos.filter((f) => f.rendidorCorreo === yo);
  const misInformes = rendiciones.filter((r) => r.esMia);

  // Las bandejas de cada rol (lo propio no se resuelve uno mismo).
  const porValidar = fondos.filter((f) => f.estado === "en_validacion" && f.rendidorCorreo !== yo);
  const porAsignar = fondos.filter((f) => f.estado === "validado" && f.rendidorCorreo !== yo);
  const porReponer = fondos.filter((f) => f.estado === "cerrado_con_saldo" && f.rendidorCorreo !== yo);
  const porTransferir = fondos.filter((f) => f.estado === "por_transferir" && f.rendidorCorreo !== yo);
  const devoluciones = fondos.filter((f) => f.estado === "devolucion_pendiente" && f.rendidorCorreo !== yo);
  const reembolsos = rendiciones.filter((r) => r.fondoId && r.estado === "reembolso_pendiente" && r.rindeCorreo?.toLowerCase() !== yo);
  const porRevisar = rendiciones.filter((r) => (r.fondoId || revisaAntiguas || esAdmin || tiene("revisor")) && r.estado === "enviada" && r.rindeCorreo?.toLowerCase() !== yo);

  const pestanas: { id: Pestana; texto: string; Icono: typeof IconHome; cuenta?: number }[] = [
    { id: "inicio", texto: "Inicio", Icono: IconHome },
    { id: "fondos", texto: "Mis fondos", Icono: IconWallet },
    { id: "gastos", texto: "Mis gastos", Icono: IconReceipt },
    { id: "informes", texto: "Mis informes", Icono: IconReceipt2 },
    ...(tiene("validador") ? [{ id: "validar" as const, texto: "Por validar", Icono: IconUserCheck, cuenta: porValidar.length }] : []),
    ...(tiene("asignador") ? [{ id: "asignar" as const, texto: "Por asignar", Icono: IconChecklist, cuenta: porAsignar.length + porReponer.length }] : []),
    ...(tiene("tesoreria") ? [{ id: "tesoreria" as const, texto: "Tesorería", Icono: IconBuildingBank, cuenta: porTransferir.length + reembolsos.length + devoluciones.length }] : []),
    ...(tiene("revisor") ? [{ id: "revisar" as const, texto: "Por revisar", Icono: IconClipboardCheck, cuenta: porRevisar.length }] : []),
    ...(tiene("tesoreria") || tiene("administrador") ? [{ id: "libro" as const, texto: "Libro", Icono: IconNotebook }] : []),
    ...(tiene("administrador") ? [{ id: "config" as const, texto: "Configuración", Icono: IconSettings }] : []),
  ];
  // Las vistas de «Todos…» no van en el menú: se abren con el botón junto a «Mis gastos / informes / fondos»,
  // y en el menú queda marcada la pestaña «Mis…» de la que vienen.
  const TODOS: Record<string, Pestana> = { "todos-gastos": "gastos", "todos-informes": "informes", "todos-fondos": "fondos" };
  const actual: Pestana = pestanas.some((p) => p.id === ver) || (esAdmin && ver && ver in TODOS) ? (ver as Pestana) : "inicio";
  const pestanaMarcada: Pestana = TODOS[actual] ?? actual;

  const fondosParaInforme = (revisaAntiguas ? fondos : misFondos)
    .filter((f) => f.estado === "activo")
    .map((f) => ({ id: f.id, codigo: f.codigo, rendidorNombre: f.rendidorNombre, saldo: f.saldo, motivo: f.motivo, esMio: f.rendidorCorreo === yo }));
  const conSaldoAFavor = tiene("asignador") && (actual === "asignar" || actual === "inicio") ? (await fondosConSaldoAFavor(empresaId).catch(() => [])).filter((f) => f.rendidorCorreo !== yo) : [];
  const gastosTodos = esAdmin && actual === "todos-gastos" ? await todosLosGastos({ id: empresaId, porOmision: activa!.slug === SLUG_POR_OMISION }) : [];
  const necesitaPersonas = actual === "asignar" || actual === "config";
  const personas = necesitaPersonas ? await listarPersonas() : [];

  return (
    <div className="animar-entrada space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconReceipt2 size={23} stroke={1.75} />
        </span>
        <div className="min-w-[13rem] flex-1">
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Rendir gastos</h1>
          <p className="text-sm text-gris">Fondos por rendir, informes, revisión y cierre</p>
        </div>
      </header>

      {faltaSql && <p className="rounded-xl border border-rose-300/60 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-700">{faltaSql}</p>}

      <nav className="desliza -mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-borde bg-superficie p-1">
          {pestanas.map((p) => {
            const on = p.id === pestanaMarcada;
            return (
              <Link
                key={p.id}
                href={p.id === "gastos" ? "/rendir-gastos/gastos" : `/rendir-gastos?ver=${p.id}`}
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${on ? "bg-naranjo text-white shadow-sm" : "text-gris hover:text-tinta"}`}
              >
                <p.Icono size={16} stroke={1.75} /> {p.texto}
                {!!p.cuenta && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? "bg-white/25" : "bg-naranjo/15 text-naranjo"}`}>{p.cuenta}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {actual === "inicio" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link href="/rendir-gastos/gastos" className="flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 transition hover:border-naranjo/40">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600"><IconReceipt size={20} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-tinta">Subir gastos</span>
                <span className="block text-[11px] text-gris">Boletas sueltas, se leen solas</span>
              </span>
            </Link>
            <SolicitarFondo comoTarjeta />
            <NuevaRendicion empresa={activa?.nombre} fondos={fondosParaInforme} comoTarjeta />
          </div>

          <Seccion titulo="Mis fondos activos" Icono={IconWallet} enlace={{ href: "/rendir-gastos?ver=fondos", texto: "Ver todos" }}>
            {misFondos.filter((f) => f.estado !== "cerrado" && f.estado !== "anulado" && f.estado !== "rechazado").length === 0 ? (
              <Vacio texto="No tienes fondos en curso. Solicita uno para empezar a rendir." />
            ) : (
              <ul className="space-y-2.5">
                {misFondos
                  .filter((f) => f.estado !== "cerrado" && f.estado !== "anulado" && f.estado !== "rechazado")
                  .map((f) => <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite} />)}
              </ul>
            )}
          </Seccion>

          {pestanas.some((p) => p.cuenta) && (
            <Seccion titulo="Pendiente para ti" Icono={IconListDetails}>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {pestanas.filter((p) => p.cuenta).map((p) => (
                  <li key={p.id}>
                    <Link href={`/rendir-gastos?ver=${p.id}`} className="flex items-center gap-3 rounded-xl border border-naranjo/40 bg-superficie p-3.5 transition hover:bg-naranjo/[0.04]">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-naranjo/10 text-naranjo"><p.Icono size={20} /></span>
                      <span className="flex-1 text-sm font-bold text-tinta">{p.texto}</span>
                      <span className="rounded-full bg-naranjo px-2.5 py-0.5 text-sm font-bold text-white">{p.cuenta}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          <Seccion titulo="Mis informes recientes" Icono={IconReceipt2} enlace={{ href: "/rendir-gastos?ver=informes", texto: "Ver todos" }}>
            {misInformes.length === 0 ? <Vacio texto="Aún no tienes informes." /> : <ListaRendiciones rendiciones={misInformes.slice(0, 5)} revisa={false} filtroInicial="todas" borrar={eliminarRendicionAction} />}
          </Seccion>
        </div>
      )}

      {actual === "fondos" && (
        <Seccion titulo="Mis fondos" Icono={IconWallet} accion={<>{esAdmin && <ConmutadorTodos activa="mias" mias={{ href: "/rendir-gastos?ver=fondos", texto: "Mis fondos" }} todas={{ href: "/rendir-gastos?ver=todos-fondos", texto: "Todos los fondos" }} />}<SolicitarFondo /></>}>
          {misFondos.length === 0 ? <Vacio texto="Todavía no tienes fondos. Usa «Solicitar fondo»." /> : (
            <ul className="space-y-2.5">{misFondos.map((f) => <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite} />)}</ul>
          )}
        </Seccion>
      )}

      {actual === "informes" && (
        <Seccion titulo="Mis informes" Icono={IconReceipt2} accion={<>{esAdmin && <ConmutadorTodos activa="mias" mias={{ href: "/rendir-gastos?ver=informes", texto: "Mis informes" }} todas={{ href: "/rendir-gastos?ver=todos-informes", texto: "Todos los informes" }} />}<NuevaRendicion empresa={activa?.nombre} fondos={fondosParaInforme} /></>}>
          <ListaRendiciones rendiciones={misInformes} revisa={revisaAntiguas} filtroInicial="todas" borrar={eliminarRendicionAction} />
        </Seccion>
      )}

      {esAdmin && actual === "todos-gastos" && (
        <Seccion titulo="Todos los gastos" Icono={IconListDetails} accion={<><EnVivo /><ConmutadorTodos activa="todas" mias={{ href: "/rendir-gastos/gastos", texto: "Mis gastos" }} todas={{ href: "/rendir-gastos?ver=todos-gastos", texto: "Todos los gastos" }} /></>}>
          <TodosLosGastos filas={gastosTodos} />
        </Seccion>
      )}

      {esAdmin && actual === "todos-informes" && (
        <Seccion titulo="Todos los informes" Icono={IconFileInvoice} accion={<><EnVivo /><ConmutadorTodos activa="todas" mias={{ href: "/rendir-gastos?ver=informes", texto: "Mis informes" }} todas={{ href: "/rendir-gastos?ver=todos-informes", texto: "Todos los informes" }} /></>}>
          <ListaRendiciones rendiciones={rendiciones} revisa filtroInicial="todas" borrar={eliminarRendicionAction} />
        </Seccion>
      )}

      {esAdmin && actual === "todos-fondos" && (
        <Seccion titulo="Todos los fondos" Icono={IconWallet} accion={<><EnVivo /><ConmutadorTodos activa="todas" mias={{ href: "/rendir-gastos?ver=fondos", texto: "Mis fondos" }} todas={{ href: "/rendir-gastos?ver=todos-fondos", texto: "Todos los fondos" }} /></>}>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs font-semibold">
            {([["", "Todos", fondos.length], ...(Object.keys(ETIQUETA_ESTADO_FONDO) as EstadoFondo[]).map((e) => [e, ETIQUETA_ESTADO_FONDO[e], fondos.filter((f) => f.estado === e).length] as const)] as const)
              .filter(([e, , n]) => e === "" || n > 0)
              .map(([e, t, n]) => (
                <Link key={e || "todos"} href={e ? `/rendir-gastos?ver=todos-fondos&estado=${e}` : "/rendir-gastos?ver=todos-fondos"} scroll={false} className={`rounded-lg border px-2.5 py-1 transition ${(estadoFiltro ?? "") === e ? "border-tinta bg-tinta text-superficie" : "border-borde text-gris hover:text-tinta"}`}>
                  {t} {n}
                </Link>
              ))}
          </div>
          {(() => {
            const lista = fondos.filter((f) => !estadoFiltro || f.estado === estadoFiltro);
            return lista.length === 0 ? <Vacio texto="No hay fondos en este estado." /> : (
              <ul className="space-y-2.5">
                {lista.map((f) => (<FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite} />))}
              </ul>
            );
          })()}
        </Seccion>
      )}

      {actual === "validar" && (
        <Seccion titulo="Solicitudes por validar" Icono={IconUserCheck}>
          {porValidar.length === 0 ? <Vacio texto="No hay solicitudes esperando validación." /> : (
            <ul className="space-y-2.5">
              {porValidar.map((f) => (
                <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                  <BotonAccion accion={validarFondoAction.bind(null, f.id, "aprueba")}>Validar</BotonAccion>
                  <BotonAccion accion={validarFondoAction.bind(null, f.id, "rechaza")} pide="¿Por qué se rechaza la solicitud?" tono="peligro">Rechazar</BotonAccion>
                </FilaFondo>
              ))}
            </ul>
          )}
        </Seccion>
      )}

      {actual === "asignar" && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <AsignarFondo personas={personas.filter((p) => p.correo !== yo)} plazoPorOmision={parametros.plazoRendicionDias} saldosAFavor={conSaldoAFavor.map((f) => ({ correo: f.rendidorCorreo, codigo: f.codigo, saldo: f.saldo }))} />
          </div>
          <Seccion titulo="Fondos con saldo a favor" Icono={IconWallet}>
            {conSaldoAFavor.length === 0 ? <Vacio texto="Nadie tiene saldo a favor sin usar." /> : (
              <>
                <p className="mb-2 text-xs text-gris">Para que no se acumulen fondos: cárgales el nuevo monto a estos mismos (se transfiere solo la diferencia) o pide que devuelvan el saldo.</p>
                <ul className="space-y-2.5">
                  {conSaldoAFavor.map((f) => (
                    <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                      <BotonAccion accion={pedirDevolucionAction.bind(null, f.id)} confirma={`Se le avisa a ${f.rendidorNombre} que devuelva ${pesos(f.saldo)}.`} tono="secundario">Pedir devolución</BotonAccion>
                      <CargarFondo fondo={{ id: f.id, codigo: f.codigo, rendidorNombre: f.rendidorNombre, saldo: f.saldo, montoAutorizado: f.montoAutorizado }} />
                    </FilaFondo>
                  ))}
                </ul>
              </>
            )}
          </Seccion>
          <Seccion titulo="Validados, por asignar" Icono={IconChecklist}>
            {porAsignar.length === 0 ? <Vacio texto="No hay solicitudes validadas esperando." /> : (
              <ul className="space-y-2.5">
                {porAsignar.map((f) => (
                  <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                    <AsignarFondo personas={[]} validado={{ id: f.id, codigo: f.codigo, rendidorNombre: f.rendidorNombre, rendidorCorreo: f.rendidorCorreo, montoSolicitado: f.montoSolicitado }} plazoPorOmision={parametros.plazoRendicionDias} saldosAFavor={conSaldoAFavor.map((x) => ({ correo: x.rendidorCorreo, codigo: x.codigo, saldo: x.saldo }))} />
                    <BotonAccion accion={anularFondoAction.bind(null, f.id)} pide="¿Por qué se anula?" tono="peligro">Anular</BotonAccion>
                  </FilaFondo>
                ))}
              </ul>
            )}
          </Seccion>
          <Seccion titulo="Fondos fijos por reponer" Icono={IconWallet}>
            {porReponer.length === 0 ? <Vacio texto="No hay fondos fijos esperando reposición." /> : (
              <ul className="space-y-2.5">
                {porReponer.map((f) => (
                  <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                    <BotonAccion accion={reponerFondoAction.bind(null, f.id)} confirma={`Se transferirá solo la diferencia: ${pesos(Math.max(0, (f.montoFijo ?? 0) - f.saldo))}. ¿Crear la reposición?`}>
                      Reponer {pesos(Math.max(0, (f.montoFijo ?? 0) - f.saldo))}
                    </BotonAccion>
                  </FilaFondo>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      )}

      {actual === "tesoreria" && (
        <div className="space-y-6">
          <Seccion titulo="Por transferir" Icono={IconBuildingBank}>
            {porTransferir.length === 0 ? <Vacio texto="Nada por transferir." /> : (
              <ul className="space-y-2.5">
                {porTransferir.map((f) => (
                  <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                    <BotonAccion accion={transferirFondoAction.bind(null, f.id)} comprobante={{ fondoId: f.id }} pide={`Referencia de la transferencia de ${pesos(f.montoPorTransferir ?? 0)} (N° de operación):`}>
                      Transferí {pesos(f.montoPorTransferir ?? 0)}
                    </BotonAccion>
                  </FilaFondo>
                ))}
              </ul>
            )}
          </Seccion>
          <Seccion titulo="Reembolsos por pagar" Icono={IconFileInvoice}>
            {reembolsos.length === 0 ? <Vacio texto="No hay reembolsos pendientes." /> : (
              <ul className="space-y-2.5">
                {reembolsos.map((r) => {
                  const f = fondos.find((x) => x.id === r.fondoId);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-superficie p-3.5">
                      <Link href={`/rendir-gastos/${r.id}`} className="min-w-[12rem] flex-1">
                        <span className="block font-bold text-tinta">{r.tituloRendicion}</span>
                        <span className="block text-xs text-gris">{r.nombreQuienRinde} · {f?.codigo}</span>
                      </Link>
                      <span className="font-condensed text-xl font-bold tabular-nums text-orange-600">{pesos(-(f?.saldo ?? 0))}</span>
                      <BotonAccion accion={pagarReembolsoAction.bind(null, r.id)} comprobante={r.fondoId ? { fondoId: r.fondoId } : undefined} pide="Referencia de la transferencia del reembolso:">Pagué el reembolso</BotonAccion>
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>
          <Seccion titulo="Devoluciones por confirmar" Icono={IconWallet}>
            {devoluciones.length === 0 ? <Vacio texto="No hay devoluciones por confirmar." /> : (
              <ul className="space-y-2.5">
                {devoluciones.map((f) => (
                  <FilaFondo key={f.id} f={f} hoy={hoy} umbral={parametros.umbralAvisoLimite}>
                    <span className="text-xs text-gris">Ref. {f.devolucionReferencia}</span>
                    <BotonAccion accion={confirmarDevolucionAction.bind(null, f.id)} confirma={`¿Llegó el depósito de ${pesos(f.devolucionMonto ?? 0)}?`}>
                      Confirmar {pesos(f.devolucionMonto ?? 0)}
                    </BotonAccion>
                  </FilaFondo>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      )}

      {actual === "revisar" && (
        <Seccion titulo="Informes por revisar" Icono={IconClipboardCheck}>
          {porRevisar.length === 0 ? <Vacio texto="No hay informes esperando revisión." /> : (
            <ListaRendiciones rendiciones={porRevisar} revisa filtroInicial="todas" borrar={eliminarRendicionAction} />
          )}
        </Seccion>
      )}

      {actual === "libro" && <Libro empresaId={empresaId} fondos={fondos} />}

      {actual === "config" && (
        <ConfiguracionFondos personas={personas} roles={await listarRoles(empresaId)} parametros={parametros} />
      )}
    </div>
  );
}

async function Libro({ empresaId, fondos }: { empresaId: string; fondos: Fondo[] }) {
  const movimientos = await movimientosDe({ empresaId });
  const codigo = new Map(fondos.map((f) => [f.id, `${f.codigo} · ${f.rendidorNombre}`]));
  const pendientes = movimientos.filter((m) => m.estadoConciliacion === "pendiente").length;
  return (
    <Seccion titulo="Libro de movimientos" Icono={IconNotebook}>
      <p className="-mt-1 mb-3 text-xs text-gris">
        Todo lo que pasó con el dinero. No se edita ni se borra: las correcciones son ajustes. {pendientes} movimiento{pendientes === 1 ? "" : "s"} con banco sin conciliar.
      </p>
      {movimientos.length === 0 ? <Vacio texto="Todavía no hay movimientos." /> : (
        <ul className="divide-y divide-borde overflow-hidden rounded-xl border border-borde bg-superficie">
          {movimientos.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-3 text-sm">
              <span className="min-w-[11rem] flex-1">
                <span className="block font-semibold text-tinta">{ETIQUETA_MOVIMIENTO[m.tipo]}</span>
                <span className="block text-[11px] text-gris">
                  <Link href={`/rendir-gastos/fondos/${m.fondoId}`} className="hover:text-naranjo">{codigo.get(m.fondoId) ?? "Fondo"}</Link>
                  {" · "}{new Date(m.fecha).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}
                  {m.referenciaBanco ? ` · ref. ${m.referenciaBanco}` : ""}
                  {m.motivo ? ` · ${m.motivo}` : ""}
                </span>
              </span>
              <span className={`font-condensed text-lg font-bold tabular-nums ${m.signo > 0 ? "text-emerald-600" : "text-tinta"}`}>{m.signo > 0 ? "+" : "−"}{pesos(m.monto)}</span>
              <span className="w-24 text-right text-[11px] text-gris">saldo {pesos(m.saldoResultante)}</span>
              {m.estadoConciliacion !== "no_aplica" && (
                <BotonAccion accion={conciliarAction.bind(null, m.id, m.estadoConciliacion !== "conciliado")} tono={m.estadoConciliacion === "conciliado" ? "secundario" : "primario"}>
                  {m.estadoConciliacion === "conciliado" ? "Conciliado ✓" : "Conciliar"}
                </BotonAccion>
              )}
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  );
}

function Seccion({ titulo, Icono, enlace, accion, children }: { titulo: string; Icono: typeof IconHome; enlace?: { href: string; texto: string }; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icono size={18} className="text-naranjo" />
        <h2 className="flex-1 text-base font-bold text-tinta">{titulo}</h2>
        {enlace && <Link href={enlace.href} className="text-sm font-semibold text-naranjo">{enlace.texto} →</Link>}
        {accion}
      </div>
      {children}
    </section>
  );
}

