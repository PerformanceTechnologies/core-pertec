"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCloudUpload } from "@tabler/icons-react";
import RuedaCarga from "./RuedaCarga";
import { subirPorTrozos } from "@/lib/contratos/subida-por-trozos";
import { CAMPO } from "@/lib/contratos/estilos";
import { mensajeDeError } from "@/lib/contratos/errores-cliente";

interface Estado {
  nombre: string;
  estado: "subiendo" | "listo" | "error";
  /** 0–100, para la barra. */
  avance: number;
  detalle?: string;
}

/**
 * La subida va DIRECTO del navegador a SharePoint, con una sesión de subida que
 * abre el servidor.
 *
 * No es una optimización: el cuerpo de una Server Action está limitado a 1 MB
 * por omisión en Next, y la plataforma de Vercel corta en 4,5 MB pase lo que
 * pase. Un contrato escaneado pasa de ahí sin esfuerzo, y el error que produce
 * no dice que el archivo era muy grande — dice que algo falló.
 *
 * La URL de la sesión ya viene autorizada para ESE archivo en ESA carpeta y
 * caduca sola, así que el navegador no necesita —ni recibe— ningún token de
 * Microsoft.
 */
export default function SubidorDeArchivos({
  seccion,
  rutaCarpeta,
  itemIdCarpeta,
  prepararSubida,
  registrarSubida,
  refrescar,
}: {
  seccion: string;
  rutaCarpeta: string;
  /** La carpeta de requisito, si esta lo es: la que pasa a "subido". */
  itemIdCarpeta: string | null;
  prepararSubida: (seccion: string, rutaCarpeta: string, nombre: string) => Promise<{ url: string }>;
  registrarSubida: (datos: {
    seccion: string;
    itemIdArchivo: string;
    rutaArchivo: string;
    comentario: string;
    itemIdCarpeta: string | null;
    rutaCarpeta: string;
  }) => Promise<void>;
  refrescar: (seccion: string, rutaCarpeta: string) => Promise<void>;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [comentario, setComentario] = useState("");

  function actualizar(i: number, cambios: Partial<Estado>) {
    setEstados((previos) => previos.map((e, j) => (j === i ? { ...e, ...cambios } : e)));
  }

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;

    const lista = Array.from(archivos);
    setEstados(lista.map((a) => ({ nombre: a.name, estado: "subiendo" as const, avance: 0 })));

    // De a uno y no en paralelo: con varios a la vez el ancho de subida se
    // reparte y ninguno parece avanzar. En serie, cada archivo termina y se ve.
    for (let i = 0; i < lista.length; i++) {
      const archivo = lista[i];
      try {
        const { url } = await prepararSubida(seccion, rutaCarpeta, archivo.name);
        const creado = await subirPorTrozos(url, archivo, (avance) => actualizar(i, { avance }));

        // SharePoint puede haber renombrado el archivo si ya existía uno igual
        // (conflictBehavior: rename), así que la ruta se arma con el nombre que
        // devolvió él, no con el que tenía en el disco de quien lo subió.
        await registrarSubida({
          seccion,
          itemIdArchivo: creado.id,
          rutaArchivo: [rutaCarpeta, creado.name].filter(Boolean).join("/"),
          comentario,
          itemIdCarpeta,
          rutaCarpeta,
        });

        actualizar(i, { estado: "listo", avance: 100 });
      } catch (e) {
        actualizar(i, {
          estado: "error",
          detalle: mensajeDeError(e, "No se pudo subir"),
        });
      }
    }

    if (entrada.current) entrada.current.value = "";
    setComentario("");
    // La lista la pinta el servidor leyendo SharePoint: hay que pedirle que la
    // vuelva a traer.
    await refrescar(seccion, rutaCarpeta);
    router.refresh();
  }

  return (
    <div>
      {/* El comentario se escribe ANTES de soltar los archivos, no después.
          Después de subir, la gente ya se fue a lo siguiente: un campo que
          aparece al terminar se queda vacío siempre. Acá está a la vista
          mientras se elige qué subir, que es cuando uno tiene en la cabeza por
          qué lo está subiendo. */}
      <label className="mb-3 block">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris">
          Comentario <span className="font-normal normal-case text-gris-suave">(opcional)</span>
        </span>
        <input
          type="text"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          maxLength={300}
          placeholder="Por ejemplo: reemplaza la versión de mayo, falta la firma del mandante…"
          className={CAMPO}
        />
      </label>

      <label
        // La marca que mira GuardiaDeArrastre: acá soltar SÍ carga.
        data-acepta-archivos=""
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          void subir(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
          arrastrando
            ? "border-cian bg-cian-lavado"
            : "border-borde bg-superficie hover:border-cian hover:bg-cian-lavado/40"
        }`}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-cian-lavado text-azul">
          <IconCloudUpload size={22} />
        </span>
        <span className="mt-2 text-sm font-semibold text-tinta">
          Arrastra archivos acá, o haz clic para elegirlos
        </span>
        <span className="text-xs text-gris">Van directo a esta carpeta en SharePoint</span>
        <input
          ref={entrada}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void subir(e.target.files)}
        />
      </label>

      {estados.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {estados.map((e, i) => (
            <li
              key={`${e.nombre}-${i}`}
              className="rounded-lg border border-borde bg-superficie px-3 py-2"
            >
              <div className="flex items-center gap-2 text-xs">
                {e.estado === "subiendo" && <RuedaCarga className="h-3.5 w-3.5 text-cian" />}
                <span className="min-w-0 flex-1 truncate text-tinta">{e.nombre}</span>
                {e.estado === "subiendo" && (
                  <span className="tabular-nums text-gris">{e.avance}%</span>
                )}
                {e.estado === "listo" && (
                  <span className="font-semibold text-emerald-600">Subido</span>
                )}
                {e.estado === "error" && (
                  <span className="font-semibold text-red-600" title={e.detalle}>
                    Error
                  </span>
                )}
              </div>

              {e.estado === "subiendo" && (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-borde">
                  <div
                    className="h-full bg-cian transition-[width]"
                    style={{ width: `${e.avance}%` }}
                  />
                </div>
              )}

              {e.estado === "error" && e.detalle && (
                <p className="mt-1 text-[11px] leading-relaxed text-red-600/80">{e.detalle}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
