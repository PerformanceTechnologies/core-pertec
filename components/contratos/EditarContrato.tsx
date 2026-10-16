"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import VentanaModal from "./VentanaModal";
import BotonGuardar from "./BotonGuardar";
import MensajeDeForm from "./MensajeDeForm";
import { useFormulario } from "./useFormulario";
import { CAMPO } from "@/lib/contratos/estilos";
import { editarContratoAction } from "@/app/(protegido)/contratos/acciones-contratos";

const ETIQUETA = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-gris";

/** El botón «Editar» del encabezado del contrato, con su ventana. Solo para quien puede configurar. */
export default function EditarContrato({
  slug,
  valores,
}: {
  slug: string;
  valores: { nombre: string; cliente: string | null; numero: string | null; carpeta: string };
}) {
  const [abierta, setAbierta] = useState(false);
  const router = useRouter();
  const { estado, enviar, pendiente } = useFormulario(async (previo, form) => {
    const resultado = await editarContratoAction(slug, previo, form);
    if (resultado.ok) {
      setAbierta(false);
      router.refresh();
    }
    return resultado;
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gris transition hover:text-naranjo"
      >
        <IconPencil size={14} />
        Editar contrato
      </button>

      <VentanaModal abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Editar contrato">
        <form onSubmit={enviar} className="grid gap-4">
          <label>
            <span className={ETIQUETA}>Nombre del contrato</span>
            <input name="nombre" required maxLength={120} defaultValue={valores.nombre} className={CAMPO} />
          </label>
          <label>
            <span className={ETIQUETA}>Nombre de la carpeta en SharePoint</span>
            <input name="carpeta" required maxLength={120} defaultValue={valores.carpeta} className={CAMPO} />
            <span className="mt-1 block text-[11px] text-gris">
              Se renombra en Core Pertec › CONTRATOS. Lo de adentro no cambia. No puede llevar &quot; * : &lt; &gt; ? | / \
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={ETIQUETA}>Cliente / mandante</span>
              <input name="cliente" maxLength={120} defaultValue={valores.cliente ?? ""} className={CAMPO} />
            </label>
            <label>
              <span className={ETIQUETA}>N.º de contrato</span>
              <input name="numero" maxLength={60} defaultValue={valores.numero ?? ""} className={CAMPO} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <BotonGuardar pendiente={pendiente}>Guardar</BotonGuardar>
            <MensajeDeForm estado={estado} />
          </div>
        </form>
      </VentanaModal>
    </>
  );
}
