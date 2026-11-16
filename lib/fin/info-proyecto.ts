/** Código compuesto de un proyecto y sus datos para la tarjeta que aparece al pasar el mouse. */
export interface InfoProyecto {
  /** MAND-CLI-AÑO-TIP (o el PRY-#### si no alcanza a armarse). */
  codigo: string;
  /** Las filas de la tarjeta: etiqueta y valor. */
  datos: { etiqueta: string; valor: string }[];
}

type Parte = { nombre: string; sigla: string | null } | null;

export function armarInfoProyecto(x: {
  codigoInterno: string; nombre: string; tipo: string; tipoTexto: string; fechaInicio: string | null; cliente: Parte; mandante: Parte; general?: boolean;
}): InfoProyecto {
  const tip = x.tipo.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
  const anio = x.fechaInicio?.slice(0, 4) ?? null;
  const compuesto = x.general ? "" : [x.mandante?.sigla, x.cliente?.sigla, anio, tip].filter(Boolean).join("-");
  const conSigla = (p: Parte) => (p ? (p.sigla ? `${p.sigla} · ${p.nombre}` : p.nombre) : "—");
  return {
    codigo: compuesto || x.codigoInterno,
    datos: [
      { etiqueta: "Proyecto", valor: x.nombre },
      { etiqueta: "Mandante", valor: conSigla(x.mandante) },
      { etiqueta: "Cliente", valor: conSigla(x.cliente) },
      { etiqueta: "Año de inicio", valor: anio ?? "—" },
      { etiqueta: "Tipo", valor: tip ? `${tip} · ${x.tipoTexto}` : x.tipoTexto },
      { etiqueta: "N° interno", valor: x.codigoInterno },
    ],
  };
}
