import { IconLayoutKanban } from "@tabler/icons-react";
import FiltroDeEmpresa from "@/components/FiltroDeEmpresa";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { SLUG_APP_TAREAS } from "@/lib/tareas-modelo";

export const dynamic = "force-dynamic";

export default async function LayoutTareas({ children }: { children: React.ReactNode }) {
  await exigirAccesoApp(SLUG_APP_TAREAS);

  return (
    <div className="animar-entrada">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-azul/10 text-azul">
          <IconLayoutKanban size={22} stroke={1.75} />
        </span>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-tinta">Tareas</h1>
          <p className="text-sm text-gris">
            <span className="lg:hidden">Toca una tarea para abrirla; avánzala con su botón.</span>
            <span className="hidden lg:inline">Arrastra las tarjetas entre columnas para cambiar su estado.</span>
          </p>
        </div>
      </header>
      <FiltroDeEmpresa>{children}</FiltroDeEmpresa>
    </div>
  );
}
