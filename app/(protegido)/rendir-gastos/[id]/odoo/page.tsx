import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { obtenerRendicion } from "@/lib/rendidor/datos";
import { buscarProveedor } from "@/lib/rendidor/odoo";
import { listarFondos, type FondoOdoo } from "@/lib/rendidor/fondos";
import CargarAOdoo from "@/components/rendidor/CargarAOdoo";

const SLUG_APP = "rendir-gastos";

export const dynamic = "force-dynamic";
// Resolver los proveedores son hasta tres consultas XML-RPC por gasto, y una rendición de
// dieciséis comprobantes las hace todas antes de pintar la página.
export const maxDuration = 60;

/**
 * El paso de Odoo, en su propia página.
 *
 * Antes era una ventana modal encima del formulario de corrección, y antes de eso un
 * cuarto bloque colgado al final de la página. Las dos formas tenían el mismo problema:
 * lo que se decide acá —el proveedor de cada gasto, el fondo, y apretar el botón que
 * escribe en Odoo— convivía en pantalla con dieciséis tarjetas de gasto editables.
 *
 * Como página propia, tiene una sola cosa en pantalla, una dirección a la que volver y
 * una URL que se puede recargar sin perder nada: los proveedores se resuelven en el
 * SERVIDOR al entrar, así que no hay un botón que apretar ni un estado que se pierda al
 * refrescar.
 *
 * Y lo de "solo lo necesario": la lista de proveedores que se muestra es la de los que
 * hay que DECIDIR. Los que Odoo resolvió sin ambigüedad —un único candidato— y los que se
 * van a crear se cuentan en una línea, porque no hay nada que hacer con ellos.
 */
export default async function CargarAOdooPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirAccesoApp(SLUG_APP);
  const { id } = await params;

  const rendicion = await obtenerRendicion(id);
  if (!rendicion) notFound();
  if (rendicion.creadoPor !== usuario.id && usuario.rol !== "admin") notFound();

  // Ya cargada, o sin nada que cargar: no hay paso que hacer acá. Se vuelve al detalle en
  // vez de mostrar una pantalla vacía con un botón que duplicaría los gastos.
  if (rendicion.estado === "cargada_odoo" || rendicion.gastos.length === 0) {
    redirect(`/rendir-gastos/${id}`);
  }

  // En paralelo: cada búsqueda de proveedor son hasta tres consultas a Odoo, y en fila
  // una rendición de dieciséis comprobantes serían ~48 round-trips encadenados.
  const candidatos = await Promise.all(
    rendicion.gastos.map(async (g) => {
      const { candidatos } = await buscarProveedor(g.rutProveedor, g.proveedor ?? "");
      return { gastoId: g.id, candidatos };
    }),
  );

  // Los fondos son opcionales, así que si Odoo no los devuelve la página igual sirve: se
  // sigue sin fondo, que es un resultado válido. No se cae la carga por esto.
  let fondos: FondoOdoo[] = [];
  let errorFondos: string | null = null;
  if (rendicion.odooEmployeeId) {
    try {
      fondos = await listarFondos(rendicion.odooEmployeeId, rendicion.empresaCompanyId);
    } catch (e) {
      errorFondos = e instanceof Error ? e.message : "No se pudieron leer los fondos de Odoo.";
      console.error("[rendidor] No se pudieron listar los fondos por rendir:", e);
    }
  }

  return (
    <div>
      <Link
        href={`/rendir-gastos/${id}`}
        className="text-xs font-medium text-tinta/50 hover:text-naranjo"
      >
        ← Volver a corregir
      </Link>
      <div className="mt-2">
        <CargarAOdoo
          rendicion={rendicion}
          candidatos={candidatos}
          fondos={fondos}
          errorFondos={errorFondos}
        />
      </div>
    </div>
  );
}
