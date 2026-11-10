export default function CargandoLeads() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando leads">
      <div className="h-40 animate-pulse rounded-[22px] bg-tinta/[0.05]" />
      <div className="h-10 animate-pulse rounded-xl bg-tinta/[0.05]" />
      <div className="h-80 animate-pulse rounded-2xl bg-tinta/[0.04]" />
    </div>
  );
}
