import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import FormularioContratoNuevo from "@/components/contratos/FormularioContratoNuevo";
import { exigirCapacidadFueraDeContrato } from "@/lib/contratos/autorizacion";
import { TARJETA } from "@/lib/contratos/estilos";
import { PLANTILLA_DE_CONTRATO } from "@/lib/contratos/plantilla";

export default async function NuevoContratoPage() {
  await exigirCapacidadFueraDeContrato("configurar", "/contratos");

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/contratos"
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gris transition hover:text-naranjo"
      >
        <IconArrowLeft size={14} />
        Contratos
      </Link>
      <h1 className="mt-3 font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
        Nuevo contrato
      </h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-tinta/60">
        Se crea con todo lo de la plantilla: los catálogos de acreditación de personas y vehículos, las
        categorías de logística y gastos, y su carpeta en SharePoint (Core Pertec › CONTRATOS) con esta
        estructura:
      </p>
      <ul className="mt-2 text-xs text-tinta/60">
        {PLANTILLA_DE_CONTRATO.map((c) => (
          <li key={c.nombre}>
            <span className="font-semibold text-tinta/80">{c.nombre}</span>
            {c.carpetas?.length ? ` — ${c.carpetas.map((h) => h.nombre).join(", ")}` : ""}
          </li>
        ))}
      </ul>

      <div className={`${TARJETA} mt-6 p-5 sm:p-6`}>
        <FormularioContratoNuevo />
      </div>
    </div>
  );
}
