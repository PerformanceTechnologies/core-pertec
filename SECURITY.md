# Seguridad

Core PERTEC es una aplicación interna. Si encuentras una falla de seguridad, una credencial expuesta o un
comportamiento que deja ver datos a quien no corresponde:

1. **No la publiques** (ni como issue, ni como PR, ni en un chat abierto).
2. Avisa a **soporte@pertec.cl** con lo que viste, dónde y cómo reproducirlo.
3. Si la falla es una **credencial publicada** (clave, token, contraseña): además de avisar, hay que **rotarla de
   inmediato** en su origen (Supabase, Microsoft Entra, Anthropic, Odoo, SII, GitHub) y actualizar Vercel y los
   Secrets de GitHub. Borrar el commit no alcanza: el repositorio es público.

Reglas del repositorio: ver `CONTRIBUTING.md`.
