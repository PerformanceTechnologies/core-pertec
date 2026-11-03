import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { SLUG_APP_VH } from "@/lib/valorizacion-historica-modelo";
import ConteoValorizacion, { type ItemConteo } from "@/components/valorizacion-historica/ConteoValorizacion";
import { SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

/** La plantilla «Valorización inventario» del Excel: lo contado en bodega contra lo comprado. */
export default async function ConteoPage() {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;

  const items: ItemConteo[] = vista.catalogo.map((i) => ({
    clave: i.clave,
    categoria: i.categoria,
    subcategoria: i.subcategoria,
    unidad: i.unidad,
    cantidad: i.cantidad,
    costoPromedio: i.costoPromedio,
    ultimoCosto: i.ultimoCosto,
    ultimaFecha: i.ultimaFecha,
    compras: i.compras,
    marca: i.marca,
  }));
  return <ConteoValorizacion items={items} />;
}
