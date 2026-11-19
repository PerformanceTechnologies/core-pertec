"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconFileUpload, IconRefresh } from "@tabler/icons-react";
import VentanaModal from "@/components/contratos/VentanaModal";
import { BOTON_PRIMARIO, CAMPO } from "@/lib/estilos";
import {
  CATEGORIAS,
  describirRegla,
  extension,
  fechasDelNombre,
  nombreAlSubir,
  TIPO_POR_ID,
  TIPOS,
  OTRO,
  tituloSinFechas,
  calcularVencimiento,
  formatearFecha,
  type Documento,
  type SociedadBase,
} from "@/lib/repositorio-legal/modelo";

const TROZO = 10 * 320 * 1024; // 3,2 MB: múltiplo de 320 KiB, como pide Graph.

/**
 * Subir un documento nuevo, o RENOVAR uno existente (`reemplaza`): en ese caso se sube encima del mismo
 * archivo de SharePoint (la versión anterior queda en su historial) y se pide la nueva fecha de emisión.
 *
 * La fecha de emisión es obligatoria: de ella cuelga la vigencia. Se propone leyéndola del nombre del
 * archivo elegido, y se guarda en el nombre con que queda en SharePoint.
 */
export default function SubirDocumento({
  abierta,
  alCerrar,
  sociedades,
  sociedadInicial,
  reemplaza,
}: {
  abierta: boolean;
  alCerrar: () => void;
  sociedades: SociedadBase[];
  sociedadInicial?: string | null;
  reemplaza?: Documento | null;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [sociedad, setSociedad] = useState(reemplaza?.sociedad ?? sociedadInicial ?? sociedades[0]?.slug ?? "");
  const [tipoId, setTipoId] = useState(reemplaza?.tipo ?? "certificado-vigencia");
  const [titulo, setTitulo] = useState(reemplaza ? tituloSinFechas(reemplaza.nombre) : TIPO_POR_ID["certificado-vigencia"].nombre);
  const [tituloTocado, setTituloTocado] = useState(Boolean(reemplaza));
  const [emision, setEmision] = useState("");
  const [vence, setVence] = useState("");
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tipo = TIPO_POR_ID[tipoId] ?? OTRO;
  const venceCalculado = emision ? calcularVencimiento(tipo, emision, tipo.regla.modo === "explicita" ? vence || null : null) : null;
  const nombreFinal = useMemo(
    () => (archivo && emision ? nombreAlSubir({ titulo, emision, vence: tipo.regla.modo === "explicita" ? vence || null : null, extension: extension(archivo.name) }) : ""),
    [archivo, emision, vence, titulo, tipo.regla.modo],
  );

  function elegirArchivo(f: File | null) {
    setArchivo(f);
    if (!f) return;
    // Propone la fecha de emisión que traiga el nombre («Emitido 26-09-2024», «Vigente al…»).
    const leidas = fechasDelNombre(f.name);
    if (leidas.emision && !emision) setEmision(leidas.emision);
    if (leidas.vence && !vence) setVence(leidas.vence);
  }

  function elegirTipo(id: string) {
    setTipoId(id);
    if (!tituloTocado) setTitulo((TIPO_POR_ID[id] ?? OTRO).nombre);
  }

  async function subir() {
    setError(null);
    if (!archivo) return setError("Elige el archivo.");
    if (!emision) return setError("La fecha de emisión es obligatoria.");
    if (tipo.regla.modo === "explicita" && !vence) return setError("Este tipo de documento necesita su fecha de vencimiento.");
    const soc = sociedades.find((s) => s.slug === sociedad);
    if (!reemplaza && !soc) return setError("Elige la sociedad.");

    const pedir = (cuerpo: object) =>
      fetch("/api/repositorio-legal/subida", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
        .then((r) => r.json())
        .catch(() => ({ error: "No se pudo conectar con el Core." }));

    setAvance(0);
    const sesion = await pedir({ paso: "abrir", carpeta: soc ? `SOCIEDADES/${soc.carpeta}` : "", nombre: nombreFinal, reemplazaId: reemplaza?.id ?? null });
    if (!sesion?.url) {
      setAvance(null);
      return setError(sesion?.error ?? "SharePoint no abrió la subida.");
    }

    let item: { id?: string } | null = null;
    for (let desde = 0; desde < archivo.size; desde += TROZO) {
      const hasta = Math.min(desde + TROZO, archivo.size);
      const r = await fetch(sesion.url, { method: "PUT", headers: { "Content-Range": `bytes ${desde}-${hasta - 1}/${archivo.size}` }, body: archivo.slice(desde, hasta) }).catch(() => null);
      if (!r || (!r.ok && r.status !== 202)) {
        setAvance(null);
        return setError("Se cortó la subida a SharePoint. Inténtalo de nuevo.");
      }
      if (r.status === 200 || r.status === 201) item = await r.json().catch(() => null);
      setAvance(Math.round((hasta / archivo.size) * 100));
    }
    if (!item?.id) {
      setAvance(null);
      return setError("SharePoint no confirmó el archivo.");
    }
    const conf = await pedir({ paso: "confirmar", itemId: item.id, nombreFinal });
    setAvance(null);
    if (!conf?.ok) return setError(conf?.error ?? "No se pudo confirmar la subida.");
    alCerrar();
    router.refresh();
  }

  return (
    <VentanaModal
      abierta={abierta}
      alCerrar={alCerrar}
      titulo={reemplaza ? "Renovar documento" : "Subir documento"}
      descripcion={reemplaza ? `Sube la versión nueva de «${reemplaza.nombre}». La anterior queda en el historial de SharePoint.` : "Queda en la carpeta de la sociedad en SharePoint, con la fecha de emisión en su nombre."}
    >
      <div className="space-y-4">
        <label className="block">
          <span className="etiqueta-seccion">Archivo</span>
          <input type="file" className={`${CAMPO} mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-naranjo/10 file:px-3 file:py-1 file:text-naranjo`} onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)} />
        </label>

        {!reemplaza && (
          <label className="block">
            <span className="etiqueta-seccion">Sociedad</span>
            <select className={`${CAMPO} mt-1`} value={sociedad} onChange={(e) => setSociedad(e.target.value)}>
              {sociedades.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="etiqueta-seccion">Tipo de documento</span>
          <select className={`${CAMPO} mt-1`} value={tipoId} onChange={(e) => elegirTipo(e.target.value)}>
            {CATEGORIAS.map((c) => {
              const tipos = [...TIPOS, OTRO].filter((t) => t.categoria === c.id && !t.restringido);
              if (!tipos.length) return null;
              return (
                <optgroup key={c.id} label={c.nombre}>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <span className="mt-1 block text-xs text-gris">{describirRegla(tipo.regla)}</span>
        </label>

        <label className="block">
          <span className="etiqueta-seccion">Título</span>
          <input
            className={`${CAMPO} mt-1`}
            value={titulo}
            onChange={(e) => {
              setTitulo(e.target.value);
              setTituloTocado(true);
            }}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta-seccion">Fecha de emisión *</span>
            <input type="date" required className={`${CAMPO} mt-1`} value={emision} onChange={(e) => setEmision(e.target.value)} />
          </label>
          {tipo.regla.modo === "explicita" ? (
            <label className="block">
              <span className="etiqueta-seccion">Vence el *</span>
              <input type="date" className={`${CAMPO} mt-1`} value={vence} onChange={(e) => setVence(e.target.value)} />
            </label>
          ) : (
            <div className="rounded-lg border border-dashed border-borde px-3 py-2 text-sm">
              <span className="etiqueta-seccion">Vigencia</span>
              <p className="mt-1 text-tinta">{venceCalculado ? `Hasta el ${formatearFecha(venceCalculado)}` : tipo.regla.modo === "no_vence" ? "No vence" : "Indica la emisión"}</p>
            </div>
          )}
        </div>

        {nombreFinal && (
          <p className="rounded-lg bg-tinta/[0.03] px-3 py-2 text-xs text-gris">
            Se guardará como <span className="font-semibold text-tinta">{nombreFinal}</span>
          </p>
        )}

        {error && <p className="tono-alerta rounded-lg px-3 py-2 text-sm">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {avance !== null && <span className="text-sm text-gris">Subiendo… {avance}%</span>}
          <button type="button" className={BOTON_PRIMARIO} disabled={avance !== null} onClick={subir}>
            {reemplaza ? <IconRefresh size={17} stroke={1.75} /> : <IconFileUpload size={17} stroke={1.75} />}
            {reemplaza ? "Renovar" : "Subir"}
          </button>
        </div>
      </div>
    </VentanaModal>
  );
}
