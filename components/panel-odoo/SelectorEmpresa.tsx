"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { CompaniaOdoo } from "@/lib/panel-odoo/companias";

export default function SelectorEmpresa({
  companias,
  companyIdActual,
}: {
  companias: CompaniaOdoo[];
  companyIdActual: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function cambiarEmpresa(id: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("empresa", String(id));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-borde bg-white p-1">
      {companias.map((c) => {
        const activo = c.id === companyIdActual;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => cambiarEmpresa(c.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              activo ? "bg-naranjo text-white" : "text-tinta/60 hover:bg-crema"
            }`}
          >
            {c.nombre}
          </button>
        );
      })}
    </div>
  );
}
