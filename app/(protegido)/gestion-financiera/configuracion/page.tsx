import { IconBuildingBank, IconCalculator, IconCreditCard, IconPlus, IconReceipt2, IconShoppingCart } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista, contextoFin, type Categoria, type Perfil, type Subcategoria } from "@/lib/fin/datos";
import { perfilDeEmpresa } from "@/lib/fin/empresa-perfil";
import { clp, fechaCl, sumarDias } from "@/lib/fin/reglas";
import { aciertoIa, proponerReglas, type Clasificado } from "@/lib/fin/clasificacion";
import { TARJETA } from "@/lib/estilos";
import { crearReglaPropuestaAction, traerHistoriaBancoAction, eliminarReglaAction, guardarIaAction, guardarCategoriaAction, guardarCuentaAction, guardarFactorAction, guardarParametrosAction, guardarPerfilAction, guardarPerfilEmpresaAction, guardarReglaAction, guardarSubcategoriaAction } from "../acciones-config";
import { Pestanas, Seccion, TD, TH } from "@/components/fin/piezas";
import { BotonAccion, Campo, ConVentana, FormAccion } from "@/components/fin/ui";
import { BOTON_SEC, CAMPO } from "@/components/fin/estilos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionFinPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const ver = sp.ver ?? "parametros";
  const perfilEmpresa = ver === "empresa" ? await perfilDeEmpresa((await contextoFin()).empresa.id) : null;
  const p = v.p;
  return (
    <div className="space-y-5">
      <Pestanas
        base={`${RUTA_FIN}/configuracion`}
        actual={ver}
        opciones={[{ clave: "parametros", etiqueta: "Parámetros" }, { clave: "empresa", etiqueta: "Datos de la empresa" }, { clave: "cuentas", etiqueta: "Cuentas y factores" }, { clave: "categorias", etiqueta: "Categorías y reglas" }, { clave: "perfiles", etiqueta: "Clientes y proveedores" }]}
      />

      {ver === "parametros" && (
        <div className={`${TARJETA} max-w-3xl p-5`}>
          <p className="mb-5 text-sm text-gris">Las reglas con que se calcula todo en {v.empresa.nombre}. Vienen con valores razonables: cambia solo lo que tu empresa haga distinto.</p>
          <FormAccion accion={guardarParametrosAction} className="space-y-6">
            <GrupoParametros titulo="Ventas y cobros" icono={<IconReceipt2 size={15} />}>
              <Campo etiqueta="IVA (%)"><input name="tasaIva" defaultValue={p.tasaIva * 100} inputMode="decimal" className={CAMPO} /></Campo>
              <Campo etiqueta="Días para pagar (por omisión)" ayuda="Lo que se le da al cliente si su ficha no dice otra cosa"><input name="condicionPagoDefault" defaultValue={p.condicionPagoDefault} inputMode="numeric" className={CAMPO} /></Campo>
            </GrupoParametros>
            <GrupoParametros titulo="Compras y pagos" icono={<IconShoppingCart size={15} />}>
              <Campo etiqueta="Diferencia aceptada factura vs OC ($)" ayuda="Si la factura difiere menos que esto, sigue sin revisión"><input name="toleranciaFacturaOc" defaultValue={p.toleranciaFacturaOc} inputMode="numeric" className={CAMPO} /></Campo>
              <Campo etiqueta="Días para pagar a proveedores" ayuda="Para proyectar el pago de una OC que aún no trae factura"><input name="plazoPagoProveedorDias" defaultValue={p.plazoPagoProveedorDias} inputMode="numeric" className={CAMPO} /></Campo>
              <Campo etiqueta="Días para reclamar una factura" ayuda="Ley 19.983; confírmalo con el contador"><input name="plazoReclamoFacturaDias" defaultValue={p.plazoReclamoFacturaDias} inputMode="numeric" className={CAMPO} /></Campo>
            </GrupoParametros>
            <GrupoParametros titulo="Caja y banco" icono={<IconBuildingBank size={15} />}>
              <Campo etiqueta="Mínimo de caja ($)" ayuda="El piso que no quieres perforar: el flujo avisa si se proyecta bajo él"><input name="minimoCaja" defaultValue={p.minimoCaja} inputMode="numeric" className={CAMPO} /></Campo>
              <Campo etiqueta="Meses a proyectar" ayuda="Cuántos meses muestra el flujo de caja"><input name="horizonteMeses" defaultValue={p.horizonteMeses} inputMode="numeric" className={CAMPO} /></Campo>
              <Campo etiqueta="Días para aclarar un movimiento" ayuda="Pasado este plazo, el movimiento se marca para escalar"><input name="plazoAclararDias" defaultValue={p.plazoAclararDias} inputMode="numeric" className={CAMPO} /></Campo>
            </GrupoParametros>
            <GrupoParametros titulo="Factoring" icono={<IconCreditCard size={15} />}>
              <Campo etiqueta="Mora del factor (% mensual)" ayuda="Se usa para estimar el costo si el cliente paga tarde"><input name="tasaMoraFactoring" defaultValue={(p.tasaMoraFactoring * 100).toLocaleString("es-CL")} inputMode="decimal" className={CAMPO} /></Campo>
            </GrupoParametros>
            <GrupoParametros titulo="Contabilidad" icono={<IconCalculator size={15} />}>
              <label className="flex items-start gap-2.5 rounded-xl border border-borde p-3 text-sm sm:col-span-3">
                <input type="checkbox" name="contabilidadActiva" defaultChecked={Boolean(v.flags.contabilidad_activa)} className="mt-0.5" />
                <span>
                  <span className="font-semibold text-tinta">Llevar la contabilidad aquí</span>
                  <span className="block text-xs text-gris">Si lo dejas apagado (lo normal), el contador externo recibe los libros y los asientos propuestos. Actívalo solo cuando el contador haya validado el plan de cuentas.</span>
                </span>
              </label>
            </GrupoParametros>
          </FormAccion>
        </div>
      )}

      {ver === "empresa" && perfilEmpresa && (
        <div className={`${TARJETA} max-w-3xl p-5`}>
          <p className="mb-5 text-sm text-gris">Lo que sale en el encabezado y el pie del PDF de las cotizaciones y de las órdenes de compra de {v.empresa.nombre}. Cada empresa del grupo tiene los suyos: cambia de empresa en el menú para completarlos.</p>
          <FormAccion accion={guardarPerfilEmpresaAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Razón social *" ayuda="Es el nombre que se ve en el menú y en el PDF"><input name="nombre" required defaultValue={perfilEmpresa.nombre} className={CAMPO} maxLength={120} /></Campo>
              <Campo etiqueta="RUT" ayuda="Sale en el PDF de la cotización"><input name="rut" defaultValue={perfilEmpresa.rut ?? ""} className={CAMPO} placeholder="76.123.456-7" autoComplete="off" /></Campo>
              <Campo etiqueta="Giro"><input name="giro" defaultValue={perfilEmpresa.giro ?? ""} className={CAMPO} placeholder="Servicios de ingeniería y mantención industrial" /></Campo>
              <Campo etiqueta="Dirección"><input name="direccion" defaultValue={perfilEmpresa.direccion ?? ""} className={CAMPO} placeholder="Calle 123, comuna, ciudad" /></Campo>
              <Campo etiqueta="Teléfono"><input name="telefono" defaultValue={perfilEmpresa.telefono ?? ""} className={CAMPO} placeholder="+56 2 2345 6789" /></Campo>
              <Campo etiqueta="Correo comercial"><input name="correo" type="email" defaultValue={perfilEmpresa.correo ?? ""} className={CAMPO} placeholder="comercial@empresa.cl" /></Campo>
              <Campo etiqueta="Sitio web"><input name="web" defaultValue={perfilEmpresa.web ?? ""} className={CAMPO} placeholder="www.empresa.cl" /></Campo>
              <Campo etiqueta="Prefijo del N° de cotización" ayuda="Ej.: COT → COT-000123. Cada empresa lleva su propio correlativo"><input name="prefijo" defaultValue={perfilEmpresa.prefijo} className={CAMPO} maxLength={6} /></Campo>
            </div>
            <Campo etiqueta="Datos bancarios" ayuda="Salen al pie de la cotización, para que el cliente sepa dónde pagar"><textarea name="datosBancarios" defaultValue={perfilEmpresa.datosBancarios ?? ""} rows={4} className={CAMPO} placeholder={"Banco: …\nCuenta corriente N°: …\nTitular y RUT: …\nCorreo de pagos: …"} /></Campo>
            <Campo etiqueta="Texto del pie" ayuda="Opcional: una línea de cierre, por ejemplo condiciones generales"><textarea name="pie" defaultValue={perfilEmpresa.pie ?? ""} rows={2} className={CAMPO} /></Campo>
            <Campo etiqueta="Condiciones generales de las órdenes de compra" ayuda="Una condición por línea. Salen al pie de cada OC; se pueden ajustar en cada solicitud. Vacío = las condiciones estándar."><textarea name="condicionesOc" defaultValue={perfilEmpresa.condicionesOc ?? ""} rows={5} className={CAMPO} placeholder={"La factura debe emitirse a nombre de la empresa y citar el N° de la OC.\nEl proveedor debe confirmar la recepción y aceptación de esta orden."} /></Campo>
          </FormAccion>
        </div>
      )}

      {ver === "cuentas" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Seccion titulo="Cuentas de banco, tarjeta y caja" accion={<ConVentana boton={<><IconPlus size={14} /> Cuenta</>} titulo="Nueva cuenta" className={BOTON_SEC}>{<FormCuenta hoy={v.hoy} />}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.cuentas.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-semibold text-tinta">{c.nombre}</span> <span className="text-xs text-gris">{c.tipo} {c.banco ? `· ${c.banco}` : ""} {c.numeroEnmascarado ?? ""}{c.activa ? "" : " · inactiva"}</span></span>
                  <span className="text-xs tabular-nums text-gris">{clp(c.saldoBanco)} al {fechaCl(c.fechaSaldo)}</span>
                  <ConVentana boton="Editar" titulo={c.nombre} className="text-xs font-semibold text-naranjo">{<FormCuenta c={c} hoy={v.hoy} />}</ConVentana>
                </li>
              ))}
              {v.cuentas.length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin cuentas. Crea Banco Chile CC, Itaú CC y la tarjeta de crédito (con el saldo de hoy).</li>}
            </ul>
            <div className={`${TARJETA} mt-3 flex flex-wrap items-center gap-3 px-4 py-3 text-sm`}>
              <span className="min-w-0 flex-1 text-xs text-gris">
                <b className="text-tinta">Banco automático (Itaú vía Emisso).</b> Cada mañana llegan este mes y el anterior. Para completar la historia (la cartola de
                meses anteriores que Emisso tenga guardada), tráela aquí. No duplica nada. Solo el administrador.
              </span>
              <BotonAccion accion={traerHistoriaBancoAction} confirmar="¿Traer toda la historia del banco que tiene Emisso? Los movimientos nuevos quedan «Por aclarar»." className={BOTON_SEC}>
                Traer historia del banco
              </BotonAccion>
            </div>
          </Seccion>
          <Seccion titulo="Factores" accion={<ConVentana boton={<><IconPlus size={14} /> Factor</>} titulo="Nuevo factor" className={BOTON_SEC}>{<FormFactor />}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.factores.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 font-semibold text-tinta">{f.nombre}</span>
                  <span className="text-xs text-gris">{f.recursoDefault === "con" ? "con" : "sin"} recurso · anticipo {Math.round(f.pctAnticipoDefault * 100)}% · mora {(f.tasaMoraMensual * 100).toLocaleString("es-CL")}%</span>
                  <ConVentana boton="Editar" titulo={f.nombre} className="text-xs font-semibold text-naranjo">{<FormFactor f={f} />}</ConVentana>
                </li>
              ))}
              {v.factores.length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin factores (ej. Itaú Factoring, Banchile Factoring).</li>}
            </ul>
          </Seccion>
        </div>
      )}

      {ver === "categorias" && <CategoriasYReglas v={v} />}

      {ver === "perfiles" && (
        <div className="space-y-3">
          <p className="text-sm text-gris">El contacto (razón social, RUT) vive en Contactos. Aquí va su perfil financiero en {v.empresa.nombre}: condición de pago y lo que exige para facturar (OC, EDP, HES). Una cotización nueva lo hereda.</p>
          <form className="max-w-md"><input type="hidden" name="ver" value="perfiles" /><input name="q" defaultValue={sp.q} placeholder="Buscar cliente o proveedor…" className={CAMPO} /></form>
          <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
            <table className="w-full min-w-[52rem] text-sm">
              <thead><tr className="border-b border-borde"><th className={TH}>Contacto</th><th className={TH}>Venta (días)</th><th className={TH}>Compra (días)</th><th className={TH}>Exige</th><th className={TH}>Cobranza</th><th className={TH} /></tr></thead>
              <tbody className="divide-y divide-borde">
                {v.contrapartes
                  .filter((c) => !sp.q || `${c.nombre} ${c.rut ?? ""}`.toLowerCase().includes(sp.q.toLowerCase()))
                  .sort((a, b) => Number(v.perfiles.has(b.id)) - Number(v.perfiles.has(a.id)))
                  .slice(0, 80)
                  .map((c) => {
                    const pf = v.perfiles.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td className={TD}><span className="font-semibold text-tinta">{c.nombre}</span><span className="block text-[11px] text-gris">{c.rut ?? "sin RUT"} · {[c.esCliente && "cliente", c.esProveedor && "proveedor"].filter(Boolean).join(", ") || "—"}</span></td>
                        <td className={`${TD} text-xs`}>{pf?.condicionVentaDias ?? c.plazoPagoDias ?? <span className="text-gris-suave">{p.condicionPagoDefault}</span>}</td>
                        <td className={`${TD} text-xs`}>{pf?.condicionCompraDias ?? <span className="text-gris-suave">{p.plazoPagoProveedorDias}</span>}</td>
                        <td className={`${TD} text-xs`}>{pf ? [pf.requiereOc && "OC", pf.requiereEdp && "EDP", pf.requiereHes && "HES"].filter(Boolean).join(" · ") || "Nada" : <span className="text-gris-suave">sin perfil</span>}</td>
                        <td className={`${TD} max-w-[12rem] truncate text-xs`}>{pf?.contactoCobranza ?? "—"}</td>
                        <td className={`${TD} text-right`}><ConVentana boton={pf ? "Editar" : "Crear perfil"} titulo={`Perfil financiero · ${c.nombre}`} className="text-xs font-semibold text-naranjo">{<FormPerfil contactoId={c.id} pf={pf} />}</ConVentana></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FormCuenta({ c, hoy }: { c?: { id: string; nombre: string; tipo: string; banco: string | null; saldoBanco: number; fechaSaldo: string | null; activa: boolean }; hoy: string }) {
  return (
    <FormAccion accion={guardarCuentaAction.bind(null, c?.id ?? null)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={c?.nombre} className={CAMPO} placeholder="Banco Chile CC" /></Campo>
        <Campo etiqueta="Tipo"><select name="tipo" defaultValue={c?.tipo ?? "banco"} className={CAMPO}><option value="banco">Banco</option><option value="tarjeta">Tarjeta de crédito</option><option value="caja">Caja</option></select></Campo>
        <Campo etiqueta="Banco"><input name="banco" defaultValue={c?.banco ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="N° de cuenta" ayuda={c ? "Vacío = se mantiene el actual" : "Solo se guardan los últimos 4 dígitos"}><input name="numero" className={CAMPO} /></Campo>
        <Campo etiqueta="Saldo según banco" ayuda="Tarjeta: negativo = deuda"><input name="saldoBanco" defaultValue={c?.saldoBanco ?? 0} className={CAMPO} /></Campo>
        <Campo etiqueta="Al día"><input name="fechaSaldo" type="date" defaultValue={c?.fechaSaldo ?? hoy} className={CAMPO} /></Campo>
      </div>
      {c && <Campo etiqueta="Estado"><select name="activa" defaultValue={c.activa ? "on" : "off"} className={CAMPO}><option value="on">Activa</option><option value="off">Inactiva (no aparece en flujo ni conciliación)</option></select></Campo>}
      <p className="text-[11px] text-gris">Nunca se guardan claves del banco: los movimientos entran importando la cartola.</p>
    </FormAccion>
  );
}

function FormFactor({ f }: { f?: { id: string; nombre: string; recursoDefault: string; pctAnticipoDefault: number; tasaMoraMensual: number } }) {
  return (
    <FormAccion accion={guardarFactorAction.bind(null, f?.id ?? null)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={f?.nombre} className={CAMPO} placeholder="Itaú Factoring" /></Campo>
        <Campo etiqueta="Recurso"><select name="recurso" defaultValue={f?.recursoDefault ?? "con"} className={CAMPO}><option value="con">Con recurso</option><option value="sin">Sin recurso</option></select></Campo>
        <Campo etiqueta="% anticipo"><input name="pctAnticipo" defaultValue={f ? f.pctAnticipoDefault * 100 : 90} className={CAMPO} /></Campo>
        <Campo etiqueta="Mora % mensual"><input name="tasaMora" defaultValue={f ? (f.tasaMoraMensual * 100).toLocaleString("es-CL") : "1,2"} className={CAMPO} /></Campo>
      </div>
    </FormAccion>
  );
}

function FormCategoria({ c }: { c?: Categoria }) {
  return (
    <FormAccion accion={guardarCategoriaAction.bind(null, c?.id ?? null)}>
      <p className="text-xs text-gris">Escribe el nombre exactamente como lo usa Finanzas (con tildes y símbolos): la clasificación histórica usa esos textos.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={c?.nombre} className={CAMPO} /></Campo>
        <Campo etiqueta="Es"><select name="sentido" defaultValue={c?.sentido ?? "egreso"} className={CAMPO}><option value="egreso">Gasto (salida)</option><option value="ingreso">Ingreso (entrada)</option><option value="ambos">Entrada o salida</option></select></Campo>
        <Campo etiqueta="Cuenta contable" ayuda="Provisoria: la valida el contador"><input name="cuentaContable" defaultValue={c?.cuentaContable ?? ""} className={CAMPO} placeholder="5.3.01" /></Campo>
      </div>
      <Campo etiqueta="¿Suma en ingresos y gastos?">
        <select name="afectaResultado" defaultValue={c && !c.afectaResultado ? "off" : "on"} className={CAMPO}>
          <option value="on">Sí: es ingreso o gasto</option>
          <option value="off">No: mueve caja pero no es ingreso ni gasto (financiamiento, traspasos)</option>
        </select>
      </Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiereProyecto" defaultChecked={c?.requiereProyecto} /> Pide proyecto al clasificar</label>
      {c && <Campo etiqueta="Estado"><select name="activa" defaultValue={c.activa ? "on" : "off"} className={CAMPO}><option value="on">Activa</option><option value="off">Inactiva (ya no se ofrece)</option></select></Campo>}
    </FormAccion>
  );
}

function FormSubcategoria({ categoria, s }: { categoria: Categoria; s?: Subcategoria }) {
  return (
    <FormAccion accion={guardarSubcategoriaAction.bind(null, s?.id ?? null, categoria.id)}>
      <p className="text-xs text-gris">Subcategoría de «{categoria.nombre}». Escribe el nombre exactamente como lo usa Finanzas.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={s?.nombre} className={CAMPO} maxLength={80} /></Campo>
        <Campo etiqueta="Cuenta contable" ayuda={`Vacío = la de la categoría${categoria.cuentaContable ? ` (${categoria.cuentaContable})` : ""}`}><input name="cuentaContable" defaultValue={s?.cuentaContable ?? ""} className={CAMPO} /></Campo>
      </div>
      {s && <Campo etiqueta="Estado"><select name="activa" defaultValue={s.activa ? "on" : "off"} className={CAMPO}><option value="on">Activa</option><option value="off">Inactiva (ya no se ofrece)</option></select></Campo>}
    </FormAccion>
  );
}

type VistaConfig = Awaited<ReturnType<typeof cargarVista>>;

/**
 * La lista maestra de Finanzas (Categoría → Subcategoría) y las reglas que clasifican solas los movimientos del banco.
 * Cambiarla es del rol «Mantiene las categorías» (Permisos de flujos).
 */
function CategoriasYReglas({ v }: { v: VistaConfig }) {
  const activas = v.categorias.filter((c) => c.activa).sort((a, b) => a.orden - b.orden);
  const inactivas = v.categorias.filter((c) => !c.activa);
  const grupos = [
    { titulo: "Gastos", ayuda: "Salidas de caja que son gasto", lista: activas.filter((c) => c.afectaResultado && c.sentido !== "ingreso") },
    { titulo: "Ingresos", ayuda: "Entradas de caja que son ingreso", lista: activas.filter((c) => c.afectaResultado && c.sentido === "ingreso") },
    { titulo: "Ni ingreso ni gasto", ayuda: "Mueven caja, pero no suman en el resultado", lista: activas.filter((c) => !c.afectaResultado) },
  ];
  const subsDe = (id: string) => v.subcategorias.filter((s) => s.categoriaId === id).sort((a, b) => a.orden - b.orden);
  const nombreClasif = (categoriaId: string, subcategoriaId?: string | null) => {
    const c = v.categorias.find((x) => x.id === categoriaId);
    const s = subcategoriaId ? v.subcategorias.find((x) => x.id === subcategoriaId) : null;
    return `${c?.nombre ?? "—"}${s ? ` › ${s.nombre}` : ""}${c && !c.activa ? " (categoría antigua)" : ""}`;
  };
  const reglasActivas = v.reglas.filter((r) => r.activa);
  const reglasApagadas = v.reglas.filter((r) => !r.activa).length;
  const totalSubs = v.subcategorias.filter((s) => s.activa).length;
  const activaId = new Set(activas.map((c) => c.id));
  const clasificados: Clasificado[] = v.movimientos
    .filter((m) => m.categoriaId && activaId.has(m.categoriaId) && !m.faltaSubcategoria)
    .map((m) => ({ id: m.id, fecha: m.fecha, glosa: m.glosa, monto: m.monto, contraparteRut: m.contraparteRut, categoriaId: m.categoriaId!, subcategoriaId: m.subcategoriaId ?? null, proyectoId: m.proyectoId }));
  const propuestas = proponerReglas(clasificados, v.reglas).slice(0, 12);
  const acierto = aciertoIa(v.movimientos);
  const acierto30 = aciertoIa(v.movimientos, sumarDias(v.hoy, -30));
  const iaAuto = v.flags.ia_auto === true;
  const iaUmbral = typeof v.flags.ia_umbral === "number" ? v.flags.ia_umbral : 0.95;
  const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-gris">
        La lista maestra de Finanzas para clasificar el banco, las compras y los gastos: {activas.length} categorías y {totalSubs} subcategorías. Los textos son los mismos
        del Excel de Finanzas. Solo quien tiene el permiso «Mantiene las categorías» puede cambiarla; si nadie lo tiene asignado, cualquiera con Finanzas puede.
      </p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Seccion titulo="Lista maestra" accion={<ConVentana boton={<><IconPlus size={14} /> Categoría</>} titulo="Nueva categoría" className={BOTON_SEC}>{<FormCategoria />}</ConVentana>}>
          <div className="space-y-4">
            {grupos.map((g) => g.lista.length > 0 && (
              <div key={g.titulo}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-naranjo">{g.titulo} <span className="font-normal normal-case tracking-normal text-gris">· {g.ayuda}</span></p>
                <ul className={`${TARJETA} divide-y divide-borde`}>
                  {g.lista.map((c) => {
                    const subs = subsDe(c.id);
                    return (
                      <li key={c.id}>
                        <details className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm hover:bg-tinta/[0.02] [&::-webkit-details-marker]:hidden">
                            <span className="text-gris transition group-open:rotate-90">›</span>
                            <span className="flex-1 font-semibold text-tinta">{c.nombre}</span>
                            <span className="text-xs text-gris">
                              {subs.length > 0 ? `${subs.filter((s) => s.activa).length} subcategorías` : "sin subcategorías"}
                              {c.requiereProyecto ? " · pide proyecto" : ""}
                              {c.cuentaContable ? ` · cta ${c.cuentaContable}` : ""}
                            </span>
                          </summary>
                          <div className="space-y-2 border-t border-borde bg-tinta/[0.015] px-4 py-3">
                            {subs.length > 0 && (
                              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                                {subs.map((s) => (
                                  <li key={s.id} className={`flex items-center gap-2 text-xs ${s.activa ? "" : "opacity-50"}`}>
                                    <span className="min-w-0 flex-1 truncate text-tinta">{s.nombre}{s.activa ? "" : " (inactiva)"}</span>
                                    {s.cuentaContable && <span className="tabular-nums text-gris">{s.cuentaContable}</span>}
                                    <ConVentana boton="Editar" titulo={s.nombre} className="font-semibold text-naranjo">{<FormSubcategoria categoria={c} s={s} />}</ConVentana>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="flex flex-wrap gap-3 pt-1 text-xs">
                              {c.sentido !== "ingreso" && <ConVentana boton={<><IconPlus size={13} /> Subcategoría</>} titulo={`Nueva subcategoría de ${c.nombre}`} className="inline-flex items-center gap-1 font-semibold text-naranjo">{<FormSubcategoria categoria={c} />}</ConVentana>}
                              <ConVentana boton="Editar categoría" titulo={c.nombre} className="font-semibold text-gris hover:text-tinta">{<FormCategoria c={c} />}</ConVentana>
                            </div>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {inactivas.length > 0 && (
              <details className="text-xs text-gris">
                <summary className="cursor-pointer">Categorías que ya no se usan ({inactivas.length})</summary>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {inactivas.map((c) => (
                    <li key={c.id} className="rounded-full border border-borde px-2.5 py-0.5">
                      <ConVentana boton={c.nombre} titulo={c.nombre} className="text-gris hover:text-tinta">{<FormCategoria c={c} />}</ConVentana>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </Seccion>

        <div className="space-y-6">
        <Seccion titulo="Clasificación con IA">
          <div className={`${TARJETA} space-y-3 p-4 text-sm`}>
            <p className="text-xs text-gris">
              Cada mañana, la IA sugiere categoría y subcategoría para los movimientos que ni las reglas ni los movimientos anteriores reconocen. Aprende de cómo
              clasifica Finanzas: cada sugerencia que se acepta o se corrige la mejora.
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-tinta/[0.03] p-2"><p className="text-[11px] text-gris">Acierto (30 días)</p><p className="text-lg font-bold tabular-nums text-tinta">{pct(acierto30.pct)}</p></div>
              <div className="rounded-lg bg-tinta/[0.03] p-2"><p className="text-[11px] text-gris">Aceptadas</p><p className="text-lg font-bold tabular-nums text-ok">{acierto.aceptadas}</p></div>
              <div className="rounded-lg bg-tinta/[0.03] p-2"><p className="text-[11px] text-gris">Corregidas</p><p className="text-lg font-bold tabular-nums text-aviso">{acierto.corregidas}</p></div>
            </div>
            <FormAccion accion={guardarIaAction} textoBoton="Guardar">
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="iaAuto" defaultChecked={iaAuto} className="mt-0.5" />
                <span>
                  <span className="font-semibold text-tinta">Que se aplique sola cuando esté muy segura</span>
                  <span className="block text-xs text-gris">
                    Apagado = solo sugiere y Tesorería acepta. Actívalo cuando el acierto lleve varias semanas sobre el umbral
                    {acierto30.revisados < 30 ? ` (hoy hay ${acierto30.revisados} revisadas en 30 días: conviene esperar al menos 30)` : ""}.
                  </span>
                </span>
              </label>
              <Campo etiqueta="Desde qué seguridad (%)" ayuda="Mínimo 80. Las categorías que piden proyecto nunca se aplican solas.">
                <input name="iaUmbral" defaultValue={Math.round(iaUmbral * 100)} inputMode="numeric" className={CAMPO} />
              </Campo>
            </FormAccion>
          </div>
        </Seccion>

        {propuestas.length > 0 && (
          <Seccion titulo="Reglas propuestas">
            <p className="mb-2 text-xs text-gris">Movimientos que ya se clasificaron igual 3 o más veces y ninguna regla reconoce. Con un clic llegan clasificados solos.</p>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {propuestas.map((r) => (
                <li key={`${r.tipo}-${r.valor}`} className="flex items-start gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{r.tipo === "rut" ? `RUT ${r.valor}` : `«${r.valor}»`}</span>
                    <span className="block text-xs font-semibold text-tinta">→ {nombreClasif(r.categoriaId, r.subcategoriaId)}</span>
                    <span className="block truncate text-[11px] text-gris">{r.veces} veces · ej. {r.ejemplo}</span>
                  </span>
                  <BotonAccion accion={crearReglaPropuestaAction.bind(null, r.tipo, r.valor, r.categoriaId, r.subcategoriaId)} className="text-xs font-semibold text-naranjo">Crear regla</BotonAccion>
                </li>
              ))}
            </ul>
          </Seccion>
        )}

        <Seccion titulo="Reglas automáticas" accion={<ConVentana boton={<><IconPlus size={14} /> Regla</>} titulo="Nueva regla" className={BOTON_SEC}>{<FormRegla v={v} />}</ConVentana>}>
          <p className="mb-2 text-xs text-gris">
            Cada mañana, lo que calza con una regla llega clasificado. También se crean desde un movimiento del banco con «Regla por texto» o «Regla por RUT».
          </p>
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {reglasActivas.map((r) => (
              <li key={r.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-xs">{r.contraparteRut ? `RUT ${r.contraparteRut}` : `«${r.patron}»`}</span>
                  <span className="block text-xs font-semibold text-tinta">→ {nombreClasif(r.categoriaId, r.subcategoriaId)}</span>
                </span>
                <BotonAccion accion={eliminarReglaAction.bind(null, r.id)} confirmar="¿Desactivar esta regla?" className="text-xs font-semibold text-gris hover:text-alerta">Quitar</BotonAccion>
              </li>
            ))}
            {reglasActivas.length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin reglas todavía. Créalas aquí o desde un movimiento del banco.</li>}
          </ul>
          {reglasApagadas > 0 && <p className="mt-2 text-[11px] text-gris">{reglasApagadas} regla(s) desactivada(s): apuntaban a categorías antiguas sin equivalencia clara en la lista nueva.</p>}
        </Seccion>
        </div>
      </div>
    </div>
  );
}

function FormRegla({ v }: { v: VistaConfig }) {
  const activas = v.categorias.filter((c) => c.activa).sort((a, b) => a.orden - b.orden);
  return (
    <FormAccion accion={guardarReglaAction.bind(null, null)} textoBoton="Crear regla">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Reconoce el movimiento por">
          <select name="tipo" defaultValue="texto" className={CAMPO}><option value="texto">Texto de la glosa</option><option value="rut">RUT de la contraparte</option></select>
        </Campo>
        <Campo etiqueta="Texto (si es por glosa)"><input name="patron" className={CAMPO} placeholder="COPEC, PREVIRED, UBER…" /></Campo>
        <Campo etiqueta="RUT (si es por RUT)" ayuda="Solo transferencias que traen el RUT"><input name="rut" className={CAMPO} placeholder="76.123.456-7" /></Campo>
        <Campo etiqueta="Asigna *">
          <select name="clasificacion" required defaultValue="" className={CAMPO}>
            <option value="" disabled>Elige…</option>
            {activas.map((c) => {
              const subs = v.subcategorias.filter((s) => s.activa && s.categoriaId === c.id).sort((a, b) => a.orden - b.orden);
              return subs.length > 0 ? (
                <optgroup key={c.id} label={c.nombre}>{subs.map((s) => <option key={s.id} value={`${c.id}|${s.id}`}>{s.nombre}</option>)}</optgroup>
              ) : (
                <option key={c.id} value={`${c.id}|`}>{c.nombre}</option>
              );
            })}
          </select>
        </Campo>
        <Campo etiqueta="Y proyecto"><select name="proyectoId" className={CAMPO}><option value="">—</option>{v.proyectos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Solo en la cuenta"><select name="cuentaId" className={CAMPO}><option value="">Todas</option>{v.cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
        <Campo etiqueta="Monto desde" ayuda="Cargos en negativo"><input name="montoMin" className={CAMPO} /></Campo>
        <Campo etiqueta="Monto hasta"><input name="montoMax" className={CAMPO} /></Campo>
        <Campo etiqueta="Prioridad" ayuda="Menor = se revisa primero"><input name="prioridad" defaultValue={100} className={CAMPO} /></Campo>
      </div>
    </FormAccion>
  );
}

function FormPerfil({ contactoId, pf }: { contactoId: string; pf?: Perfil }) {
  return (
    <FormAccion accion={guardarPerfilAction.bind(null, contactoId)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Condición de pago de venta (días)" ayuda="Lo que nos paga el cliente"><input name="condicionVentaDias" defaultValue={pf?.condicionVentaDias ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Condición de pago de compra (días)" ayuda="Lo que le pagamos al proveedor"><input name="condicionCompraDias" defaultValue={pf?.condicionCompraDias ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Contacto de cobranza"><input name="contactoCobranza" defaultValue={pf?.contactoCobranza ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Correo de cobranza"><input name="correoCobranza" type="email" defaultValue={pf?.correoCobranza ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Teléfono de cobranza"><input name="telefonoCobranza" defaultValue={pf?.telefonoCobranza ?? ""} className={CAMPO} /></Campo>
        <Campo etiqueta="Referencia que exige en la factura" ayuda="Ej. DEM"><input name="referenciaExigida" defaultValue={pf?.referenciaExigida ?? ""} className={CAMPO} /></Campo>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereOc" defaultChecked={pf?.requiereOc ?? true} /> Exige OC</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereEdp" defaultChecked={pf?.requiereEdp} /> Exige EDP aprobado</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" name="requiereHes" defaultChecked={pf?.requiereHes} /> Exige HES</label>
      </div>
      <Campo etiqueta="Notas"><input name="notas" defaultValue={pf?.notas ?? ""} className={CAMPO} /></Campo>
    </FormAccion>
  );
}

/** Un bloque de parámetros con su título: ordena el formulario por tema. */
function GrupoParametros({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-naranjo">
        {icono} {titulo}
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}
