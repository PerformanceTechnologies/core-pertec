import { redirect } from "next/navigation";
import { IconShieldCheck, IconShieldLock } from "@tabler/icons-react";
import { contextoFin } from "@/lib/fin/datos";
import { asignacionesDeEmpresa, candidatosDeFlujo, type PersonaFlujo } from "@/lib/fin/flujos";
import { FLUJOS, ROL_REMUNERACIONES } from "@/lib/fin/flujos-modelo";
import { SLUG_EMPRESA_REMUNERACIONES } from "@/lib/fin/remuneraciones-modelo";
import { TARJETA } from "@/lib/estilos";
import { Seccion } from "@/components/fin/piezas";
import { FormAccion } from "@/components/fin/ui";
import { guardarFlujoPersonasAction } from "../acciones-config";

export const dynamic = "force-dynamic";

/** Un rol con su lista de personas para marcar. `cerrado`: sin nadie marcado no entra nadie (salvo el admin). */
function TarjetaRol({ rol, etiqueta, ayuda, candidatos, elegidos, cerrado = false }: { rol: string; etiqueta: string; ayuda: string; candidatos: PersonaFlujo[]; elegidos: Set<string>; cerrado?: boolean }) {
  return (
    <div className={`${TARJETA} p-4`}>
      <h3 className="text-sm font-bold text-tinta">{etiqueta}</h3>
      <p className="mb-3 text-xs text-gris">{ayuda}</p>
      <FormAccion accion={guardarFlujoPersonasAction.bind(null, rol)} className="space-y-3">
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
        <p className="text-[11px] text-gris">
          {elegidos.size > 0 ? `${elegidos.size} persona(s) asignada(s).` : cerrado ? "Sin asignar: solo entra el administrador del sistema." : "Sin asignar: cualquiera puede."}
        </p>
      </FormAccion>
    </div>
  );
}

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
            {flujo.roles.map((r) => (
              <TarjetaRol key={r.rol} rol={r.rol} etiqueta={r.etiqueta} ayuda={r.ayuda} candidatos={candidatos} elegidos={new Set(asignaciones.get(r.rol) ?? [])} />
            ))}
          </div>
        </Seccion>
      ))}

      {/* Los sueldos son confidenciales: acá la regla es la contraria a la de arriba. */}
      {ctx.empresa.slug === SLUG_EMPRESA_REMUNERACIONES && (
        <Seccion titulo="Remuneraciones (confidencial)" icono={<IconShieldLock size={15} />}>
          <div className="grid gap-4 lg:grid-cols-2">
            <TarjetaRol
              rol={ROL_REMUNERACIONES}
              etiqueta="Ve las remuneraciones"
              ayuda="Ve la pestaña Remuneraciones: el libro de BUK de Performance Technologies (líquido, Previred, impuesto, costo empresa) y su estado de pago. A diferencia de los pasos de arriba, sin nadie marcado NO entra cualquiera: solo el administrador del sistema."
              candidatos={candidatos}
              elegidos={new Set(asignaciones.get(ROL_REMUNERACIONES) ?? [])}
              cerrado
            />
          </div>
        </Seccion>
      )}
    </div>
  );
}
