"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconLoader2, IconUpload } from "@tabler/icons-react";
import { BOTON, BOTON_SEC, CAMPO, Campo, ConVentana } from "@/components/fin/ui";
import { avisar } from "@/components/fin/dialogos";

/** «Subir documento»: el XML y/o el PDF de un DTE. Lo que no se pueda leer se completa a mano. */
export default function SubirDocumento() {
  return (
    <ConVentana boton={<><IconUpload size={15} /> Subir documento</>} titulo="Subir un documento tributario" ancho="max-w-2xl" className={BOTON_SEC}>
      {(cerrar) => <Formulario alOk={cerrar} />}
    </ConVentana>
  );
}

function Formulario({ alOk }: { alOk: () => void }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        iniciar(async () => {
          const r = await fetch("/api/finanzas/dte/archivo/subir", { method: "POST", body: fd })
            .then((x) => x.json())
            .catch(() => ({ ok: false, error: "No se pudo subir (revisa la conexión)." }));
          if (!r.ok) return setError(r.error ?? "No se pudo subir.");
          avisar(r.mensaje ?? "Listo.", "ok");
          router.refresh();
          alOk();
        });
      }}
    >
      <p className="text-[12px] text-gris">
        Sube el <strong>XML</strong> (exacto) y/o el <strong>PDF</strong> de una factura, nota o guía, emitida o recibida. Se guarda en SharePoint y en el archivo; si es desde el 01-01-2026 y mueve dinero, también en los libros.
      </p>
      <Campo etiqueta="Archivos (XML y/o PDF del mismo documento)">
        <input type="file" name="archivos" accept=".xml,.pdf,application/pdf,text/xml,application/xml" multiple required className={CAMPO} />
      </Campo>
      <details className="rounded-xl bg-tinta/[0.03] px-3 py-2 text-[13px]">
        <summary className="cursor-pointer font-semibold text-tinta/75">Corregir datos (solo si el PDF no se lee bien)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Es">
            <select name="clase" defaultValue="" className={CAMPO}>
              <option value="">Detectar</option>
              <option value="emitido">Emitido</option>
              <option value="recibido">Recibido</option>
            </select>
          </Campo>
          <Campo etiqueta="Tipo">
            <select name="tipo" defaultValue="" className={CAMPO}>
              <option value="">Detectar</option>
              <option value="33">Factura (33)</option>
              <option value="34">Factura exenta (34)</option>
              <option value="46">Factura de compra (46)</option>
              <option value="52">Guía de despacho (52)</option>
              <option value="56">Nota de débito (56)</option>
              <option value="61">Nota de crédito (61)</option>
            </select>
          </Campo>
          <Campo etiqueta="Folio"><input name="folio" inputMode="numeric" className={CAMPO} /></Campo>
          <Campo etiqueta="Fecha"><input name="fecha" type="date" className={CAMPO} /></Campo>
          <Campo etiqueta="RUT contraparte"><input name="rut" className={CAMPO} /></Campo>
          <Campo etiqueta="Total"><input name="total" inputMode="numeric" className={CAMPO} /></Campo>
          <Campo etiqueta="Nombre contraparte" className="sm:col-span-3"><input name="nombre" className={CAMPO} /></Campo>
        </div>
      </details>
      {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-alerta">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={pendiente} className={BOTON}>
          {pendiente && <IconLoader2 size={14} className="animate-spin" />} Subir
        </button>
      </div>
    </form>
  );
}
