import { redirect } from "next/navigation";
import { IconHistory, IconTableImport } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { listarImportaciones } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, fechaCorta, monto } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import IntroSeccion, { Pistas } from "@/components/inventario/IntroSeccion";
import { Seccion } from "@/components/valorizacion-historica/Piezas";
import { SubirRegistro, VolverAnterior } from "@/components/valorizacion-historica/ImportadorRegistro";

export const dynamic = "force-dynamic";

const hora = (iso: string) => new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" });

/** Solo el administrador: subir una versión nueva del Registro Maestro de Compras. */
export default async function ImportarPage() {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  if (usuario.rol !== "admin") redirect(RUTA_VH);
  const cargas = await listarImportaciones();

  return (
    <div className="space-y-6">
      <IntroSeccion
        Icono={IconTableImport}
        tono="bg-emerald-500/10 text-emerald-600"
        titulo="Cargar el Registro Maestro de Compras"
        bajada="El Excel se lee completo: detalle, facturas, proveedores, categorías y control. Si algo no calza, no se cambia nada y se explica qué falta. Para el resto de la gente esto es solo consulta."
      >
        <Pistas items={["Sube el Excel tal como viene", "El Core lo valida y lo guarda", "Reemplaza a la versión anterior, que queda de respaldo"]} />
      </IntroSeccion>

      <SubirRegistro />

      <Seccion titulo="Cargas guardadas" icono={<IconHistory size={15} />}>
        {cargas.length === 0 ? (
          <p className={`${TARJETA} p-6 text-center text-sm text-gris`}>Todavía no hay ninguna carga.</p>
        ) : (
          <ul className={`${TARJETA} divide-y divide-borde`}>
            {cargas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${c.estado === "activa" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-tinta/[0.05] text-gris"}`}>
                  {c.estado === "activa" ? "En uso" : "Anterior"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-tinta">{c.archivo}</span>
                  <span className="block text-[11px] text-gris">
                    {hora(c.creadoEn)}{c.creadoPor && ` · ${c.creadoPor}`} · {fechaCorta(c.desde)} al {fechaCorta(c.hasta)} · {c.lineas.toLocaleString("es-CL")} líneas · {c.documentos.toLocaleString("es-CL")} documentos · {monto(c.montoTotal)}
                  </span>
                </span>
                {c.estado === "reemplazada" && <VolverAnterior id={c.id} />}
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </div>
  );
}
