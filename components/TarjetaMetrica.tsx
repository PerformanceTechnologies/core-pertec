import type { ColorApp } from "@/lib/tipos";
import { clasesInsigniaColor } from "@/lib/colores";

export default function TarjetaMetrica({
  etiqueta,
  valor,
  color = "gris",
}: {
  etiqueta: string;
  valor: number;
  color?: ColorApp;
}) {
  return (
    <div className="rounded-xl border border-borde bg-white p-4">
      <p className="text-xs font-medium text-tinta/55">{etiqueta}</p>
      <p className={`mt-2 inline-block rounded-lg px-2 py-0.5 text-2xl font-semibold ${clasesInsigniaColor(color)}`}>
        {valor}
      </p>
    </div>
  );
}
