// La estructura de carpetas con la que parte cada contrato nuevo en SharePoint.

export interface CarpetaDePlantilla {
  nombre: string;
  carpetas?: CarpetaDePlantilla[];
}

/**
 * La estructura de la carpeta de arranque de DCH (core-ih), vacía.
 *
 * Lo indispensable para que los módulos funcionen está siempre: DOCUMENTOS GENERALES con las
 * carpetas de Acreditación (1.3 personas, 1.4 vehículos), y las de Logística y Gastos. Los
 * requisitos de Documentos generales son los de DCH: cada carpeta hoja es un requisito que se
 * sigue desde el core, y un contrato que no los necesita los marca «No aplica» o los borra.
 *
 * Para cambiar la plantilla basta con editar esta lista: los contratos ya creados no se tocan.
 */
export const PLANTILLA_DE_CONTRATO: CarpetaDePlantilla[] = [
  {
    nombre: "DOCUMENTOS GENERALES",
    carpetas: [
      { nombre: "1.3 Documentos Acreditación Trabajadores" },
      { nombre: "1.4 Documentos Acreditación Vehículos" },
    ],
  },
  { nombre: "LOGISTICA" },
  { nombre: "GASTOS ARRANQUE" },
];
