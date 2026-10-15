import { PaginaDeLaPartida } from "../../_arranque/paginas";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaginaDeLaPartida modulo="gastos" partidaId={id} />;
}
