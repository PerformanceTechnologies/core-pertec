"use client";

import { IconPrinter } from "@tabler/icons-react";

export default function BotonImprimir({ className }: { className: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      <IconPrinter size={15} /> Imprimir
    </button>
  );
}
