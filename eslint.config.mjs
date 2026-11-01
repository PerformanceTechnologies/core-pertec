import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Código que no es de la app: copias de worktrees de Claude, el visor
    // pdf.js ya minificado y la salida de los scripts de exploración. Linterarlos
    // solo mete ruido en el reporte.
    ".claude/**",
    "public/pdfjs/**",
    "scripts/exploracion-output/**",
  ]),
]);

export default eslintConfig;
