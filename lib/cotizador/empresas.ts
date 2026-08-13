// Sin "server-only": lo importan tanto Server Components/Actions como
// Client Components (formularios de creación/edición de cotización).
export const EMPRESAS = ["ZEUS MINING", "PERFORMANCE TECHNOLOGIES", "PERFORMANCE SERVICES"] as const;
export type Empresa = (typeof EMPRESAS)[number];

export function esEmpresaValida(v: string): v is Empresa {
  return (EMPRESAS as readonly string[]).includes(v);
}

// Identidad legal que va en el encabezado del ECO-1 y del PDF. Vive en la tabla
// cotizador_empresas y se edita desde /cotizador/empresas; el CRUD server-only
// esta en ./empresas-datos.ts (este archivo lo importan Client Components, por
// eso aca solo va el tipo).
//
// Todos los campos de texto pueden venir vacios: la tabla nace sin datos
// legales a proposito, para que se carguen los reales en vez de arrastrar los
// de relleno que antes estaban hardcodeados en EcoTab.tsx. Quien renderiza debe
// omitir lo que este en blanco, nunca inventarlo.
export interface EmpresaIdentidad {
  id: string;
  nombre: Empresa | string;
  razonSocial: string;
  rut: string;
  direccion: string;
  ciudad: string;
  email: string;
  telefono: string;
  representanteLegal: string;
  activo: boolean;
}

// Arma la linea "RUT X · Direccion, Ciudad · correo" saltando los campos
// vacios, para que una empresa a medio cargar no muestre separadores huerfanos
// ni texto de relleno.
export function lineaIdentidadEmpresa(e: EmpresaIdentidad | null | undefined): string {
  if (!e) return "";
  const lugar = [e.direccion, e.ciudad].filter((x) => x.trim()).join(", ");
  return [e.rut.trim() ? `RUT ${e.rut.trim()}` : "", lugar, e.email.trim(), e.telefono.trim()]
    .filter((x) => x)
    .join(" · ");
}

// Nombre a mostrar: la razon social si esta cargada, si no la clave interna.
export function nombreMostrarEmpresa(nombreClave: string, e: EmpresaIdentidad | null | undefined): string {
  return e?.razonSocial.trim() || nombreClave;
}
