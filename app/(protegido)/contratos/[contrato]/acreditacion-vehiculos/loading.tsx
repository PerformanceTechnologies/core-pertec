import CargaPertec from "@/components/CargaPertec";

// La flota, la matriz, el reporte y las fichas leen todos los vehículos de Supabase antes de poder
// dibujarse. Mostrar que está cargando hace que la navegación responda al instante, aunque el dato
// tarde lo mismo.
export default function CargandoAcreditacionVehiculos() {
  return <CargaPertec modulo="Acreditación de vehículos" />;
}
