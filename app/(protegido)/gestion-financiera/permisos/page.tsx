import { redirect } from "next/navigation";
import { IconShieldCheck } from "@tabler/icons-react";
import { contextoFin } from "@/lib/fin/datos";
import { asignacionesDeEmpresa, candidatosDeFlujo } from "@/lib/fin/flujos";
import { FLUJOS } from "@/lib/fin/flujos-modelo";
import { TARJETA } from "@/lib/estilos";
import { Seccion } from "@/components/fin/piezas";
import { FormAccion } from "@/components/fin/ui";
import { guardarFlujoPersonasAction } from "../acciones-config";

export const dynamic = "force-dynamic";

export default async function PermisosFlujosPage() {
  const ctx = await contextoFin();
  // Solo el administrador global: esto decide quién puede aprobar, visar y pagar.
  if (ctx.usuario.rol !== "admin") redirect("/gestion-financiera");
  const [candidatos, asignaciones] = await Promise.all([candidatosDeFlujo(), asignacionesDeEmpresa(ctx.empresa.id)]);

  return (
    <div className="space-y-6">
      <div className={`${TARJETA} p-5`}>
        <p className="text-sm text-gris">
          Elige quién puede ejecutar cada paso de los flujos de {ctx.empresa.nombre}. Puedes marcar <strong className="text-tinta">más de una persona</strong> por paso:
          basta con que una actúe, así hay quien reemplace si la titular no está. Un paso <strong className="text-tinta">sin nadie marcado</strong> queda
          abierto a cualquiera con Gestión financiera, como hasta ahora. El administrador del sistema siempre puede.
        </p>
        <p className="mt-2 text-xs text-gris">
          Quien solicitó una compra no puede aprobarla ni visarla él mismo, salvo que sea la única persona asignada a ese paso.
        </p>
      </div>

      {FLUJOS.map((flujo) => (
        <Seccion key={flujo.clave} titulo={flujo.titulo} icono={<IconShieldCheck size={15} />}>
          <div className="grid gap-4 lg:grid-cols-2">
            {flujo.roles.map((r) => {
              const elegidos = new Set(asignaciones.get(r.rol) ?? []);
              return (
                <div key={r.rol} className={`${TARJETA} p-4`}>
                  <h3 className="text-sm font-bold text-tinta">{r.etiqueta}</h3>
                  <p className="mb-3 text-xs text-gris">{r.ayuda}</p>
                  <FormAccion accion={guardarFlujoPersonasAction.bind(null, r.rol)} className="space-y-3">
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-borde p-2">
                      {candidatos.length === 0 && <p className="p-2 text-xs text-gris">No hay usuarios con Gestión financiera.</p>}
                      {candidatos.map((c) => (
                        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-tinta/[0.04]">
                          <input type="checkbox" name="personas" value={c.id} defaultChecked={elegidos.has(c.id)} />
                          <span className="text-tinta">{c.nombre}</span>
                          <span className="truncate text-[11px] text-gris">{c.correo}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-gris">{elegidos.size === 0 ? "Sin asignar: cualquiera puede." : `${elegidos.size} persona(s) asignada(s).`}</p>
                  </FormAccion>
                </div>
              );
            })}
          </div>
        </Seccion>
      ))}
    </div>
  );
}
