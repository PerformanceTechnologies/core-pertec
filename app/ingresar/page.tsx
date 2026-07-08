import Image from "next/image";
import { signIn } from "@/auth";

export default function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center px-6">
      <Image
        src="/logo-pertec.png"
        alt="Performance Technologies — PERTEC"
        width={280}
        height={217}
        className="h-24 w-auto object-contain"
        priority
      />

      <div className="mt-10 w-full max-w-sm rounded-2xl border border-borde bg-white p-8 text-center shadow-sm">
        <span className="etiqueta-seccion justify-center">Core PERTEC</span>
        <h1 className="mt-3 font-condensed text-xl font-bold uppercase text-tinta">
          Panel interno de aplicaciones
        </h1>
        <p className="mt-2 text-sm text-tinta/60">
          Acceso exclusivo para cuentas autorizadas de Performance Technologies.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-naranjo px-5 py-3 font-condensed text-sm font-bold uppercase tracking-wide text-white transition hover:bg-naranjo-suave"
          >
            Iniciar sesión con Microsoft
          </button>
        </form>

        <ErrorAcceso searchParams={searchParams} />
      </div>
    </div>
  );
}

async function ErrorAcceso({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p className="mt-4 text-xs font-medium text-red-600">
      Tu cuenta no está autorizada para acceder al core. Contacta al administrador si crees
      que deberías tener acceso.
    </p>
  );
}
