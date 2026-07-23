// Sin "server-only": lo importan tanto Server Components/Actions como
// Client Components (formularios de creación/edición de cotización).
export const EMPRESAS = ["ZEUS MINING", "PERFORMANCE TECHNOLOGIES", "PERFORMANCE SERVICES"] as const;
export type Empresa = (typeof EMPRESAS)[number];

export function esEmpresaValida(v: string): v is Empresa {
  return (EMPRESAS as readonly string[]).includes(v);
}
