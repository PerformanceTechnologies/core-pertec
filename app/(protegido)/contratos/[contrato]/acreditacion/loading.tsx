import CargaPertec from "@/components/CargaPertec";

// Nómina, matriz, reporte y fichas leen toda la nómina de Supabase antes de poder
// dibujarse. Mostrar que está cargando hace que la navegación responda al
// instante, aunque el dato tarde lo mismo.
export default function CargandoAcreditacion() {
  return <CargaPertec modulo="Acreditación de personas" />;
}
