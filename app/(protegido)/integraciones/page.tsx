import { redirect } from "next/navigation";
import { IconCircleCheck, IconAlertTriangle, IconFileInvoice, IconFolder, IconLock } from "@tabler/icons-react";
import { exigirAdmin } from "@/lib/autorizacion";
import { contextoDeEmpresa } from "@/lib/empresas";
import { estadoCuentaDte } from "@/lib/fin/dte/cuenta";
import { carpetaFacturas } from "@/lib/archivos/carpetas";
import { TARJETA } from "@/lib/estilos";
import EncabezadoAdmin from "@/components/admin/EncabezadoAdmin";
import { AccionesCuenta, FormularioCarpeta, FormularioCuenta, InterruptorEmision, type EstadoVista } from "@/components/admin/CuentaFacturacion";

export const dynamic = "force-dynamic";

function fecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-gris">{etiqueta}</dt>
      <dd className="text-right font-semibold text-tinta">{children}</dd>
    </div>
  );
}

/** Administración › Integraciones: la cuenta de facturación electrónica de la empresa activa (cifrada) y su archivo. */
export default async function IntegracionesPage() {
  const usuario = await exigirAdmin();
  const { activa: empresa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!empresa) redirect("/");
  const c = await estadoCuentaDte(empresa.id);
  const vista: EstadoVista = { ...c, carpetaPorOmision: carpetaFacturas(empresa.nombre) };
  const prod = c.ambiente === "produccion";

  return (
    <div className="animar-entrada space-y-6">
      <EncabezadoAdmin
        titulo="Integraciones"
        descripcion={`Cuentas de servicios externos de ${empresa.nombre}. Para otra empresa, cámbiala en el selector de arriba.`}
      />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className={`${TARJETA} space-y-4 p-5`}>
          <header className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-naranjo/10 text-naranjo"><IconFileInvoice size={20} /></span>
            <div>
              <h2 className="text-[15px] font-bold text-tinta">Facturación electrónica · SimpleFactura</h2>
              <p className="text-[12px] text-gris">Emite facturas, guías y notas de crédito o débito, y trae los documentos que te emiten tus proveedores.</p>
            </div>
          </header>
          <FormularioCuenta e={vista} />
          <AccionesCuenta e={vista} />
        </section>

        <aside className="space-y-4">
          <section className={`${TARJETA} p-5 text-[13px]`}>
            <h3 className="mb-2 font-bold text-tinta">Estado</h3>
            <dl>
              <Fila etiqueta="Cuenta">{c.cargada ? <span className="inline-flex items-center gap-1 text-ok"><IconLock size={13} /> Cargada ({c.metodo === "token" ? "token" : "usuario y clave"})</span> : <span className="text-alerta">Sin cargar</span>}</Fila>
              <Fila etiqueta="Ambiente">{prod ? "Producción" : "Pruebas"}</Fila>
              <Fila etiqueta="Última prueba">
                {c.probadoEn ? (
                  <span className={`inline-flex items-center gap-1 ${c.probadoOk ? "text-ok" : "text-alerta"}`}>
                    {c.probadoOk ? <IconCircleCheck size={13} /> : <IconAlertTriangle size={13} />} {fecha(c.probadoEn)}
                  </span>
                ) : (
                  "—"
                )}
              </Fila>
              <Fila etiqueta="Emisión">{c.emisionHabilitada ? <span className="text-ok">Habilitada</span> : <span className="text-alerta">Bloqueada</span>}</Fila>
              <Fila etiqueta="Modificada">{c.actualizadoPor ? `${fecha(c.actualizadoEn)}` : "—"}</Fila>
            </dl>
            {c.probadoDetalle && <p className={`mt-2 rounded-lg px-3 py-2 text-[12px] ${c.probadoOk ? "bg-emerald-500/10 text-ok" : "bg-rose-500/10 text-alerta"}`}>{c.probadoDetalle}</p>}
            <div className="mt-3">
              {c.cargada ? <InterruptorEmision e={vista} /> : <p className="text-[12px] text-gris">Carga la cuenta para poder probarla y, cuando quieras, habilitar la emisión.</p>}
            </div>
            <p className="mt-3 text-[11px] leading-snug text-gris">
              Mientras la emisión esté bloqueada, en Facturación se pueden preparar borradores, ver los documentos y traer lo recibido, pero no se emite ni se cede nada.
            </p>
          </section>

          <section className={`${TARJETA} p-5 text-[13px]`}>
            <h3 className="mb-2 flex items-center gap-1.5 font-bold text-tinta"><IconFolder size={15} /> Archivo de documentos</h3>
            <p className="mb-3 text-[12px] text-gris">Los PDF y XML emitidos y recibidos se guardan en Emitidos/ y Recibidos/, por año y mes.</p>
            <FormularioCarpeta e={vista} />
          </section>
        </aside>
      </div>
    </div>
  );
}
