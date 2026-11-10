import { notFound, redirect } from "next/navigation";

export default async function CotizacionMovida({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  redirect(`/leads/cotizaciones/${id}`);
}
