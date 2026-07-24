// Las 3 empresas de res.company en Odoo (multi-empresa nativo, confirmado en
// vivo: sin jerarquia padre/hija, las 3 en CLP). Se hardcodean aca en vez de
// una tabla Supabase porque son estaticas y el unico uso es "filtrar por
// igualdad" en el selector de empresa del panel.
export interface CompaniaOdoo {
  id: number;
  nombre: string;
}

export const COMPANIAS_ODOO: CompaniaOdoo[] = [
  { id: 1, nombre: "Performance Technologies" },
  { id: 2, nombre: "Performance Service" },
  { id: 3, nombre: "Zeus Mining" },
];

export const COMPANIA_ODOO_DEFECTO = 1;

export function obtenerCompania(id: number): CompaniaOdoo {
  return COMPANIAS_ODOO.find((c) => c.id === id) ?? COMPANIAS_ODOO[0];
}
