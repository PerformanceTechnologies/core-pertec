import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { COOKIE_EMPRESA, temaDeEmpresa } from "@/lib/empresas-modelo";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Core | PERTEC",
  description: "Panel interno de administración de aplicaciones — Performance Technologies.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La paleta de la empresa activa sale del servidor, en el primer HTML: puesta
  // después de hidratar, la página pintaría un instante con los colores de PERTEC
  // antes de cambiar. Al cambiar de empresa, cambiarEmpresaAction revalida el
  // layout y el atributo se actualiza solo. La cookie es solo una preferencia
  // (puede estar editada a mano): temaDeEmpresa admite únicamente slugs con
  // paleta, y components/TemaEmpresa la alinea con la empresa ya resuelta.
  const empresa = temaDeEmpresa((await cookies()).get(COOKIE_EMPRESA)?.value);

  return (
    <html
      lang="es"
      data-empresa={empresa}
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <head>
        {/* Sin esto, el tema oscuro guardado recién se aplicaría después de
            hidratar React -- un parpadeo visible de claro a oscuro en cada
            carga. Corre antes del primer paint, sincrónico, fuera de React. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('core-tema')==='dark')document.documentElement.setAttribute('data-theme','dark')}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-crema text-tinta">{children}</body>
    </html>
  );
}
