"use client";

import { useId, useState } from "react";
import SelectorConBuscador from "./SelectorConBuscador";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";
import { DETALLE_DE_ISAPRE, ISAPRES, SISTEMAS_DE_SALUD } from "@/lib/contratos/acreditacion-catalogos";

const ETIQUETA = "mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-gris";

const OPCIONES_DE_ISAPRE = ISAPRES.map((nombre) => ({ valor: nombre, detalle: DETALLE_DE_ISAPRE[nombre] }));

/** Los sistemas que se guardan con su propio nombre: todos menos «Isapre», que guarda cuál. */
const SISTEMAS_DIRECTOS: readonly string[] = SISTEMAS_DE_SALUD.filter((s) => s !== "Isapre");

function mismoTexto(a: string, b: string): boolean {
  return a.localeCompare(b, "es", { sensitivity: "base" }) === 0;
}

/**
 * La previsión de salud en dos pasos: primero el sistema (Fonasa, Isapre…) y, si es Isapre, cuál,
 * con un buscador.
 *
 * Se guarda en UNA columna, como antes: «Fonasa», «No cotiza salud» o el nombre de la isapre. El
 * sistema no se guarda aparte porque se deduce del valor —una isapre es todo lo que no es uno de
 * los otros sistemas—, y así la exportación a Excel, la importación y las fichas ya cargadas no
 * cambian.
 */
export default function CampoPrevisionDeSalud({ valorInicial }: { valorInicial: string | null }) {
  const id = useId();
  const inicial = (valorInicial ?? "").trim();
  const sistemaInicial = !inicial ? "" : (SISTEMAS_DIRECTOS.find((s) => mismoTexto(s, inicial)) ?? "Isapre");

  const [sistema, setSistema] = useState(sistemaInicial);
  const [isapre, setIsapre] = useState(sistemaInicial === "Isapre" ? inicial : "");

  const valor = sistema === "Isapre" ? isapre : sistema;

  return (
    <>
      <label>
        <span className={ETIQUETA}>Previsión de salud</span>
        <select value={sistema} onChange={(e) => setSistema(e.target.value)} className={CAMPO_COMPACTO}>
          <option value="">—</option>
          {SISTEMAS_DE_SALUD.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {sistema === "Isapre" && (
        <div className="animar-revelar">
          <span id={`${id}-isapre`} className={ETIQUETA}>
            Isapre
          </span>
          {/* Un campo requerido e invisible sobre el selector: sin isapre elegida el navegador no
              deja guardar y su aviso apunta justo acá. Sin esto, «Isapre» sin cuál se guardaba
              vacío y se perdía el dato que había. */}
          <div className="relative">
            <SelectorConBuscador
              opciones={OPCIONES_DE_ISAPRE}
              valor={isapre}
              alCambiar={setIsapre}
              etiquetaId={`${id}-isapre`}
              marcador="Selecciona la isapre"
              permiteOtro
            />
            <input
              tabIndex={-1}
              required
              value={isapre}
              onChange={() => {}}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
            />
          </div>
        </div>
      )}

      <input type="hidden" name="prevision_salud" value={valor} />
    </>
  );
}
