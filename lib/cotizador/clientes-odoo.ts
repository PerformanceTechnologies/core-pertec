import "server-only";
import { odooSearchRead, odooCreate } from "../panel-odoo/odoo-cliente";

// Búsqueda/creación de clientes (res.partner) en Odoo para el campo Cliente
// del Cotizador — en vivo, no vía las tablas cache de Panel Odoo (esas se
// sincronizan cada 30 min y no sirven para un autocompletado). Reutiliza la
// misma conexión JSON-RPC (lib/panel-odoo/odoo-cliente.ts).

export interface ClienteOdoo {
  id: number;
  nombre: string;
  rut: string | null;
  ciudad: string | null;
}

interface FilaResPartner {
  id: number;
  name: string;
  vat: string | false;
  city: string | false;
}

function filaACliente(fila: FilaResPartner): ClienteOdoo {
  return {
    id: fila.id,
    nombre: fila.name,
    rut: fila.vat || null,
    ciudad: fila.city || null,
  };
}

export async function buscarClientesOdoo(query: string): Promise<ClienteOdoo[]> {
  const termino = query.trim();
  if (termino.length < 2) return [];

  const filas = await odooSearchRead<FilaResPartner>(
    "res.partner",
    [["name", "ilike", termino]],
    ["id", "name", "vat", "city"],
    { limit: 8, order: "name asc" },
  );
  return filas.map(filaACliente);
}

// Crea un cliente nuevo en Odoo (res.partner) cuando no existe uno con ese
// nombre — customer_rank: 1 lo marca como cliente (mismo criterio que usa
// Odoo internamente para distinguir clientes de proveedores/contactos).
export async function crearClienteOdoo(nombre: string): Promise<ClienteOdoo> {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error("El nombre del cliente no puede estar vacío.");

  const id = await odooCreate("res.partner", { name: nombreLimpio, customer_rank: 1 });
  return { id, nombre: nombreLimpio, rut: null, ciudad: null };
}
