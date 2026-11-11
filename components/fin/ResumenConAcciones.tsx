"use client";

import { IconFileTypePdf } from "@tabler/icons-react";
import { aprobarComprasAction, devolverCompraAction, visarComprasAction } from "@/app/(protegido)/gestion-financiera/acciones-compras";
import type { ResumenCompra } from "@/lib/fin/oc-resumen";
import ResumenOc from "./ResumenOc";
import { BOTON, BOTON_SEC, BotonAccion } from "./ui";

/**
 * El resumen completo de la OC con lo que quien lo mira puede decidir ahí mismo: aprobar o visar, o devolverla a quien la
 * creó (con motivo). Lo usan el popup de la tabla de compras y las tarjetas de «Aprobaciones pendientes» de Mi Día.
 * Los permisos son solo para mostrar los botones: cada acción los vuelve a exigir en el servidor.
 */
export default function ResumenConAcciones({
  id,
  codigo,
  paso,
  ocNumero,
  r,
  puedeAprobar,
  puedeVisar,
  cerrar,
}: {
  id: string;
  codigo: string;
  paso: string;
  ocNumero: string | null;
  r: ResumenCompra;
  puedeAprobar: boolean;
  puedeVisar: boolean;
  cerrar: () => void;
}) {
  const aprobando = paso === "Falta aprobación JP o gerente" && puedeAprobar;
  const visando = paso === "Falta visado de Finanzas" && puedeVisar;
  return (
    <div className="space-y-4">
      <ResumenOc r={r} />
      <div className="flex flex-col-reverse gap-2 border-t border-borde pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <a href={`/api/finanzas/compras/${id}/oc-pdf`} target="_blank" rel="noopener" className={`${BOTON_SEC} sm:mr-auto`}><IconFileTypePdf size={14} /> {ocNumero ? "Ver OC en PDF" : "Ver borrador en PDF"}</a>
        {(aprobando || visando) && (
          <BotonAccion accion={devolverCompraAction.bind(null, id)} motivo={`¿Por qué se devuelve ${codigo}? Le llega a quien la creó, para que la corrija.`}>Devolver</BotonAccion>
        )}
        {aprobando && <BotonAccion accion={async () => { const x = await aprobarComprasAction([id]); if (x.ok) cerrar(); return x; }} className={BOTON}>Aprobar</BotonAccion>}
        {visando && <BotonAccion accion={async () => { const x = await visarComprasAction([id]); if (x.ok) cerrar(); return x; }} className={BOTON}>Visar y emitir OC</BotonAccion>}
      </div>
    </div>
  );
}
