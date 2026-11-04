import { IconPlus } from "@tabler/icons-react";
import { RUTA_FIN, cargarVista, type Perfil } from "@/lib/fin/datos";
import { clp, fechaCl } from "@/lib/fin/reglas";
import { TARJETA } from "@/lib/estilos";
import { eliminarReglaAction, guardarCategoriaAction, guardarCuentaAction, guardarFactorAction, guardarParametrosAction, guardarPerfilAction, guardarReglaAction } from "../acciones-config";
import { Pestanas, Seccion, TD, TH } from "@/components/fin/piezas";
import { BOTON_SEC, BotonAccion, CAMPO, Campo, ConVentana, FormAccion } from "@/components/fin/ui";

export const dynamic = "force-dynamic";

export default async function ConfiguracionFinPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const sp = await searchParams;
  const v = await cargarVista();
  const ver = sp.ver ?? "parametros";
  const p = v.p;
  return (
    <div className="space-y-5">
      <Pestanas
        base={`${RUTA_FIN}/configuracion`}
        actual={ver}
        opciones={[{ clave: "parametros", etiqueta: "Parámetros" }, { clave: "cuentas", etiqueta: "Cuentas y factores" }, { clave: "categorias", etiqueta: "Categorías y reglas" }, { clave: "perfiles", etiqueta: "Clientes y proveedores" }]}
      />

      {ver === "parametros" && (
        <div className={`${TARJETA} max-w-3xl p-5`}>
          <p className="mb-4 text-sm text-gris">Los parámetros del Excel («Listas y reglas»), solo para {v.empresa.nombre}.</p>
          <FormAccion accion={guardarParametrosAction}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo etiqueta="IVA %"><input name="tasaIva" defaultValue={p.tasaIva * 100} className={CAMPO} /></Campo>
              <Campo etiqueta="Tolerancia factura vs OC ($)" ayuda="Diferencia que no detiene el pago"><input name="toleranciaFacturaOc" defaultValue={p.toleranciaFacturaOc} className={CAMPO} /></Campo>
              <Campo etiqueta="Plazo de pago a proveedores (días)" ayuda="Para estimar el pago de una OC visada sin factura"><input name="plazoPagoProveedorDias" defaultValue={p.plazoPagoProveedorDias} className={CAMPO} /></Campo>
              <Campo etiqueta="Plazo para aclarar movimientos (días)" ayuda="Pasado esto, se escala"><input name="plazoAclararDias" defaultValue={p.plazoAclararDias} className={CAMPO} /></Campo>
              <Campo etiqueta="Mínimo de caja ($)" ayuda="Política de gerencia, no saldo"><input name="minimoCaja" defaultValue={p.minimoCaja} className={CAMPO} /></Campo>
              <Campo etiqueta="Tasa de mora factoring (% mensual)"><input name="tasaMoraFactoring" defaultValue={(p.tasaMoraFactoring * 100).toLocaleString("es-CL")} className={CAMPO} /></Campo>
              <Campo etiqueta="Plazo de reclamo de facturas (días)" ayuda="Ley 19.983 (validar con el contador)"><input name="plazoReclamoFacturaDias" defaultValue={p.plazoReclamoFacturaDias} className={CAMPO} /></Campo>
              <Campo etiqueta="Horizonte del flujo (meses)"><input name="horizonteMeses" defaultValue={p.horizonteMeses} className={CAMPO} /></Campo>
              <Campo etiqueta="Condición de pago por omisión (días)"><input name="condicionPagoDefault" defaultValue={p.condicionPagoDefault} className={CAMPO} /></Campo>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="contabilidadActiva" defaultChecked={Boolean(v.flags.contabilidad_activa)} /> Contabilidad integrada (si no, modo «contador externo»: libros y paquete para el contador)</label>
          </FormAccion>
        </div>
      )}

      {ver === "cuentas" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Seccion titulo="Cuentas de banco, tarjeta y caja" accion={<ConVentana boton={<><IconPlus size={14} /> Cuenta</>} titulo="Nueva cuenta" className={BOTON_SEC}>{(cerrar) => <FormCuenta alOk={cerrar} hoy={v.hoy} />}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.cuentas.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-semibold text-tinta">{c.nombre}</span> <span className="text-xs text-gris">{c.tipo} {c.banco ? `· ${c.banco}` : ""} {c.numeroEnmascarado ?? ""}{c.activa ? "" : " · inactiva"}</span></span>
                  <span className="text-xs tabular-nums text-gris">{clp(c.saldoBanco)} al {fechaCl(c.fechaSaldo)}</span>
                  <ConVentana boton="Editar" titulo={c.nombre} className="text-xs font-semibold text-naranjo">{(cerrar) => <FormCuenta c={c} alOk={cerrar} hoy={v.hoy} />}</ConVentana>
                </li>
              ))}
              {v.cuentas.length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin cuentas. Crea Banco Chile CC, Itaú CC y la tarjeta de crédito (con el saldo de hoy).</li>}
            </ul>
          </Seccion>
          <Seccion titulo="Factores" accion={<ConVentana boton={<><IconPlus size={14} /> Factor</>} titulo="Nuevo factor" className={BOTON_SEC}>{(cerrar) => <FormFactor alOk={cerrar} />}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.factores.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="flex-1 font-semibold text-tinta">{f.nombre}</span>
                  <span className="text-xs text-gris">{f.recursoDefault === "con" ? "con" : "sin"} recurso · anticipo {Math.round(f.pctAnticipoDefault * 100)}% · mora {(f.tasaMoraMensual * 100).toLocaleString("es-CL")}%</span>
                  <ConVentana boton="Editar" titulo={f.nombre} className="text-xs font-semibold text-naranjo">{(cerrar) => <FormFactor f={f} alOk={cerrar} />}</ConVentana>
                </li>
              ))}
              {v.factores.length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin factores (ej. Itaú Factoring, Banchile Factoring).</li>}
            </ul>
          </Seccion>
        </div>
      )}

      {ver === "categorias" && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Seccion titulo="Categorías de movimiento" accion={<ConVentana boton={<><IconPlus size={14} /> Categoría</>} titulo="Nueva categoría" className={BOTON_SEC}>{(cerrar) => <FormCategoria alOk={cerrar} />}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.categorias.map((c) => (
                <li key={c.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${c.activa ? "" : "opacity-50"}`}>
                  <span className="flex-1 font-semibold text-tinta">{c.nombre}</span>
                  <span className="text-xs text-gris">{c.sentido}{c.requiereProyecto ? " · pide proyecto" : ""}{c.cuentaContable ? ` · cta ${c.cuentaContable}` : ""}</span>
                  <ConVentana boton="Editar" titulo={c.nombre} className="text-xs font-semibold text-naranjo">{(cerrar) => <FormCategoria c={c} alOk={cerrar} />}</ConVentana>
                </li>
              ))}
            </ul>
          </Seccion>
          <Seccion titulo="Reglas de categorización" accion={<ConVentana boton={<><IconPlus size={14} /> Regla</>} titulo="Nueva regla" className={BOTON_SEC}>{(cerrar) => (
            <FormAccion accion={guardarReglaAction.bind(null, null)} textoBoton="Crear regla" alOk={cerrar}>
              <Campo etiqueta="Si la glosa contiene *"><input name="patron" required className={CAMPO} placeholder="COM MANTENCION" /></Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Asignar categoría *"><select name="categoriaId" className={CAMPO}>{v.categorias.filter((c) => c.activa).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Y proyecto"><select name="proyectoId" className={CAMPO}><option value="">—</option>{v.proyectos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Solo en la cuenta"><select name="cuentaId" className={CAMPO}><option value="">Todas</option>{v.cuentas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
                <Campo etiqueta="Prioridad" ayuda="Menor = se revisa primero"><input name="prioridad" defaultValue={100} className={CAMPO} /></Campo>
                <Campo etiqueta="Monto desde"><input name="montoMin" className={CAMPO} /></Campo>
                <Campo etiqueta="Monto hasta"><input name="montoMax" className={CAMPO} /></Campo>
              </div>
            </FormAccion>
          )}</ConVentana>}>
            <ul className={`${TARJETA} divide-y divide-borde`}>
              {v.reglas.filter((r) => r.activa).map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="flex-1"><span className="font-mono text-xs">«{r.patron}»</span> → <span className="font-semibold">{v.categorias.find((c) => c.id === r.categoriaId)?.nombre}</span></span>
                  <BotonAccion accion={() => eliminarReglaAction(r.id)} confirmar="¿Desactivar esta regla?" className="text-xs font-semibold text-gris hover:text-rose-600">Quitar</BotonAccion>
                </li>
              ))}
              {v.reglas.filter((r) => r.activa).length === 0 && <li className="px-4 py-4 text-xs text-gris">Sin reglas. Créalas aquí o con «Guardar como regla» desde un movimiento del banco.</li>}
            </ul>
          </Seccion>
        </div>
      )}

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
                        <td className={`${TD} text-right`}><ConVentana boton={pf ? "Editar" : "Crear perfil"} titulo={`Perfil financiero · ${c.nombre}`} className="text-xs font-semibold text-naranjo">{(cerrar) => <FormPerfil contactoId={c.id} pf={pf} alOk={cerrar} />}</ConVentana></td>
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

function FormCuenta({ c, alOk, hoy }: { c?: { id: string; nombre: string; tipo: string; banco: string | null; saldoBanco: number; fechaSaldo: string | null; activa: boolean }; alOk: () => void; hoy: string }) {
  return (
    <FormAccion accion={guardarCuentaAction.bind(null, c?.id ?? null)} alOk={alOk}>
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

function FormFactor({ f, alOk }: { f?: { id: string; nombre: string; recursoDefault: string; pctAnticipoDefault: number; tasaMoraMensual: number }; alOk: () => void }) {
  return (
    <FormAccion accion={guardarFactorAction.bind(null, f?.id ?? null)} alOk={alOk}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={f?.nombre} className={CAMPO} placeholder="Itaú Factoring" /></Campo>
        <Campo etiqueta="Recurso"><select name="recurso" defaultValue={f?.recursoDefault ?? "con"} className={CAMPO}><option value="con">Con recurso</option><option value="sin">Sin recurso</option></select></Campo>
        <Campo etiqueta="% anticipo"><input name="pctAnticipo" defaultValue={f ? f.pctAnticipoDefault * 100 : 90} className={CAMPO} /></Campo>
        <Campo etiqueta="Mora % mensual"><input name="tasaMora" defaultValue={f ? (f.tasaMoraMensual * 100).toLocaleString("es-CL") : "1,2"} className={CAMPO} /></Campo>
      </div>
    </FormAccion>
  );
}

function FormCategoria({ c, alOk }: { c?: { id: string; nombre: string; sentido: string; requiereProyecto: boolean; cuentaContable: string | null; activa: boolean }; alOk: () => void }) {
  return (
    <FormAccion accion={guardarCategoriaAction.bind(null, c?.id ?? null)} alOk={alOk}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Nombre *"><input name="nombre" required defaultValue={c?.nombre} className={CAMPO} /></Campo>
        <Campo etiqueta="Sentido"><select name="sentido" defaultValue={c?.sentido ?? "ambos"} className={CAMPO}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option><option value="ambos">Ambos</option></select></Campo>
        <Campo etiqueta="Cuenta contable"><input name="cuentaContable" defaultValue={c?.cuentaContable ?? ""} className={CAMPO} placeholder="5.3.01" /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="requiereProyecto" defaultChecked={c?.requiereProyecto} /> Pide proyecto (ej. gasto de tarjeta)</label>
      {c && <Campo etiqueta="Estado"><select name="activa" defaultValue={c.activa ? "on" : "off"} className={CAMPO}><option value="on">Activa</option><option value="off">Inactiva</option></select></Campo>}
    </FormAccion>
  );
}

function FormPerfil({ contactoId, pf, alOk }: { contactoId: string; pf?: Perfil; alOk: () => void }) {
  return (
    <FormAccion accion={guardarPerfilAction.bind(null, contactoId)} alOk={alOk}>
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
