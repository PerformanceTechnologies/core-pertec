import CargaPertec from "@/components/CargaPertec";

// Las pantallas del módulo leen la lista de Supabase antes de poder dibujarse:
// la pantalla de carga responde al instante mientras tanto.
export default function Cargando() {
  return <CargaPertec modulo="Logística" />;
}
