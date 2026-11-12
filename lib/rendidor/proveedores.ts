import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { contactoPorRut, crearContacto } from "@/lib/contactos";
import { nombrePropio, rutUsable } from "@/lib/contactos-modelo";
import { formatearRut, normalizarRut } from "@/lib/contratos/rut";

export interface ProveedorOpcion {
  id: string;
  nombre: string;
  rut: string | null;
}

/**
 * Los proveedores que ya existen en Contactos (los activos que son proveedor o no son solo
 * cliente). Es la lista que se despliega al ingresar un gasto.
 */
export async function listarProveedores(): Promise<ProveedorOpcion[]> {
  // De a mil: PostgREST corta las respuestas en su máximo y la libreta puede ser más grande.
  const filas: { id: string; razon_social: string; rut: string | null; es_cliente: boolean; es_proveedor: boolean }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabaseAdmin
      .from("finanzas_contactos")
      .select("id, razon_social, rut, es_cliente, es_proveedor")
      .eq("activo", true)
      .order("razon_social")
      .range(desde, desde + 999);
    if (error) throw new Error(`No pudimos leer los proveedores: ${error.message}`);
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return filas.filter((c) => c.es_proveedor || !c.es_cliente).map((c) => ({ id: c.id, nombre: c.razon_social, rut: c.rut ?? null }));
}

/**
 * Alta rápida desde un gasto: razón social y RUT (opcional). Si el RUT ya existe en Contactos
 * se devuelve ese contacto en vez de duplicarlo (y se le marca proveedor si no lo era).
 */
export async function crearProveedorRapido(razonSocial: string, rutCrudo: string | null, quien: string): Promise<ProveedorOpcion> {
  const nombre = nombrePropio(razonSocial.replace(/\s+/g, " ").trim().slice(0, 100));
  if (!nombre) throw new Error("Escribe el nombre del proveedor.");
  let rut: string | null = null;
  if (rutCrudo?.trim()) {
    rut = normalizarRut(rutCrudo);
    if (!rutUsable(rut)) throw new Error("El RUT no es válido: revisa el dígito verificador.");
    const existente = await contactoPorRut(rut);
    if (existente) {
      await supabaseAdmin.from("finanzas_contactos").update({ es_proveedor: true }).eq("id", existente.id);
      return { id: existente.id, nombre: existente.razonSocial, rut: formatearRut(rut) };
    }
  }
  const id = await crearContacto(
    {
      rut,
      tipoPersona: "empresa",
      razonSocial: nombre,
      giro: null,
      direccion: null,
      comuna: null,
      ciudad: null,
      pais: "Chile",
      tipoContribuyente: "primera_categoria",
      correoDte: null,
      correo: null,
      telefono: null,
      esCliente: false,
      esProveedor: true,
      plazoPagoDias: null,
      notas: "Creado desde Rendir Gastos",
    },
    quien,
  );
  return { id, nombre, rut: rut ? formatearRut(rut) : null };
}
