## Qué cambia y por qué

<!-- Una o dos frases. El "por qué" importa más que el "qué". -->

## Cómo se probó

<!-- p. ej. "npx tsc --noEmit", "npm run probar-ofertas", prueba a mano en local con la base de desarrollo. -->

## Revisar antes de mezclar

- [ ] `npx tsc --noEmit` pasa
- [ ] No hay secretos, claves ni datos reales en el cambio
- [ ] Si toca la base: el SQL está en `supabase/<modulo>/` y se avisó cuándo aplicarlo en producción
- [ ] Si agrega una variable de entorno: está en `.env.example`, en Vercel y (si la usa un workflow) en los Secrets de GitHub
- [ ] Si toca `package.json`, `next.config.ts`, `vercel.json`, `lib/contratos/*` o permisos: se avisó a la otra persona
