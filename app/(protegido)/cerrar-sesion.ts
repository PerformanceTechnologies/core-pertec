"use server";

import { signOut } from "@/auth";

export async function cerrarSesionAction() {
  await signOut({ redirectTo: "/ingresar" });
}
