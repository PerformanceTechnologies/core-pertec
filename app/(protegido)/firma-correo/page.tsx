import { redirect } from "next/navigation";

/** La firma vive ahora en Mi perfil; esta dirección queda para los enlaces que ya existían. */
export default function FirmaCorreoPage() {
  redirect("/mi-perfil");
}
