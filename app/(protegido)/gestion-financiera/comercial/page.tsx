import { redirect } from "next/navigation";

// Comercial se mudó a Leads (CRM). Se deja el enlace viejo para marcadores y correos ya enviados.
export default async function ComercialMovido({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  redirect(ver === "cotizaciones" ? "/leads?ver=cotizaciones" : "/leads");
}
