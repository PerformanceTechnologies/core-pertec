import { redirect } from "next/navigation";

export default async function NuevaCotizacionMovida({ searchParams }: { searchParams: Promise<{ oportunidad?: string }> }) {
  const { oportunidad } = await searchParams;
  redirect(oportunidad && /^[0-9a-f-]{36}$/.test(oportunidad) ? `/leads/cotizaciones/nueva?oportunidad=${oportunidad}` : "/leads/cotizaciones/nueva");
}
