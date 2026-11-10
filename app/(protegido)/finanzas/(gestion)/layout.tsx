import Link from "next/link";
import { IconBuilding, IconCash } from "@tabler/icons-react";
import { DialogosFin } from "@/components/fin/dialogos";
import { contextoFin } from "@/lib/fin/datos";

export const dynamic = "force-dynamic";

// Ventas y cobranza y Compras y pagos son submódulos de Finanzas, pero siguen siendo de Gestión
// financiera por dentro: mismos datos (fin_*), mismo permiso y misma empresa activa. Este layout
// les da lo que antes les daba la barra de Gestión financiera: los diálogos y la empresa a la vista.
export default async function LayoutGestionEnFinanzas({ children }: { children: React.ReactNode }) {
  const { empresa } = await contextoFin();
  return (
    <div className="animar-entrada">
      <DialogosFin />
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/finanzas" className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm" title="Volver a Finanzas">
          <IconCash size={23} stroke={1.75} />
        </Link>
        <div className="min-w-[13rem] flex-1">
          <Link href="/finanzas" className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta hover:text-naranjo">Finanzas</Link>
        </div>
        {/* Siempre a la vista: evita registrar algo en la empresa equivocada. */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-naranjo/40 bg-naranjo/[0.08] px-3 py-1.5 text-xs font-bold text-naranjo" title="Todo lo que ves y registras aquí es de esta empresa">
          <IconBuilding size={14} /> {empresa.nombre}
        </span>
      </header>
      <div className="escalonar">{children}</div>
    </div>
  );
}
