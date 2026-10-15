"use client";

import { useState } from "react";
import { CAMPO_COMPACTO } from "@/lib/contratos/estilos";

const OTRO = "__otro__";

/**
 * Un desplegable con las opciones oficiales, y «Otro…» para escribir una que no está.
 *
 * Para los datos que en la práctica son una lista —banco, faena, turno, nacionalidad— pero a los
 * que una lista cerrada dejaría sin poder anotar el caso raro. Elegir de la lista da la grafía
 * exacta; «Otro…» abre un campo de texto. Lo que se envía es UN valor con el nombre del campo
 * (un <input type="hidden">), sea el de la lista o el escrito, así que el servidor no tiene que
 * saber que hubo dos controles.
 *
 * Si el valor guardado de antes no está en la lista, se abre directo en «Otro…» con ese texto,
 * en vez de mostrar «—» y dar a entender que no hay dato.
 */
export default function ListaConOtro({
  name,
  opciones,
  valorInicial,
  etiqueta,
  marcadorOtro = "Escribe cuál",
}: {
  name: string;
  opciones: readonly string[];
  valorInicial: string | null;
  /** Para el lector de pantalla: el <label> envuelve al desplegable y no necesita repetirse. */
  etiqueta: string;
  marcadorOtro?: string;
}) {
  const inicial = valorInicial ?? "";
  const esDeLaLista = inicial === "" || opciones.includes(inicial);

  const [seleccion, setSeleccion] = useState(esDeLaLista ? inicial : OTRO);
  const [escrito, setEscrito] = useState(esDeLaLista ? "" : inicial);

  const valor = seleccion === OTRO ? escrito : seleccion;

  return (
    <div className="space-y-1.5">
      <input type="hidden" name={name} value={valor} />

      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value)}
        aria-label={etiqueta}
        className={CAMPO_COMPACTO}
      >
        <option value="">—</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTRO}>Otro…</option>
      </select>

      {seleccion === OTRO && (
        <input
          type="text"
          value={escrito}
          onChange={(e) => setEscrito(e.target.value)}
          maxLength={80}
          placeholder={marcadorOtro}
          aria-label={`${etiqueta}: escribe cuál`}
          className={CAMPO_COMPACTO}
          autoFocus
        />
      )}
    </div>
  );
}
