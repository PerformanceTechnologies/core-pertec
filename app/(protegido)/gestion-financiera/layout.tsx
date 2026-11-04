import { IconBuilding, IconCash } from "@tabler/icons-react";
import NavFin from "@/components/fin/NavFin";
import { contextoFin } from "@/lib/fin/datos";

export const dynamic = "force-dynamic";

export default async function LayoutFinanzas({ children }: { children: React.ReactNode }) {
  const { empresa } = await contextoFin();
  return (
    <div className="animar-entrada">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-naranjo text-white shadow-sm">
          <IconCash size={23} stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-tight text-tinta">Gestión financiera</h1>
          <p className="text-sm text-gris">De la oportunidad al cobro y de la compra al pago, con la caja a la vista</p>
        </div>
        {/* Siempre a la vista: evita registrar algo en la empresa equivocada. */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-naranjo/40 bg-naranjo/[0.08] px-3 py-1.5 text-xs font-bold text-naranjo" title="Todo lo que ves y registras aquí es de esta empresa">
          <IconBuilding size={14} /> {empresa.nombre}
        </span>
      </header>
      <NavFin />
      {children}
    </div>
  );
}
