import { TARJETA } from "@/lib/estilos";

/** Cuando SharePoint no responde o la cuenta no le dio acceso: qué pasó y cómo seguir. */
export default function ErrorSharePoint({ mensaje, volver }: { mensaje: string; volver: string }) {
  return (
    <div className={`${TARJETA} p-6`}>
      <p className="font-condensed text-lg font-bold uppercase text-tinta">No se pudo leer SharePoint</p>
      <p className="mt-1 text-sm text-gris">{mensaje}</p>
      <a href={`/api/archivos/conectar?volver=${encodeURIComponent(volver)}`} className="mt-4 inline-block text-sm font-semibold text-naranjo hover:underline">
        Conectar mi cuenta con SharePoint →
      </a>
    </div>
  );
}
