-- ============================================================================
-- Mi Día: prioridades que la persona ya dio por hechas.
--
-- Correr UNA VEZ en el SQL Editor de Supabase (proyecto core-pertec).
--
-- ── Por qué una tabla aparte y no un campo en resumen_diario ────────────────
--
-- resumen_diario guarda UNA fila por persona y por día. Si lo tachado viviera
-- ahí, mañana el resumen nuevo nace limpio y la prioridad vuelve a aparecer —
-- que es exactamente lo que se pidió evitar. Lo tachado tiene que sobrevivir al
-- día en que se tachó, así que vive fuera.
--
-- ── Por qué se guarda una clave normalizada ─────────────────────────────────
--
-- Las prioridades las escribe el modelo de nuevo cada mañana, con otras palabras:
-- "Gestionar el cobro de las facturas reclamadas más antiguas" puede salir
-- mañana como "Cobrar las facturas reclamadas de Caucho Val y Salfa". Comparar
-- el texto exacto no serviría de nada.
--
-- `clave` es el texto sin tildes, sin signos y sin palabras vacías, que agarra
-- las reformulaciones chicas. Las grandes no las agarra, y por eso el texto
-- original también se guarda: se le pasa al modelo para que NO vuelva a
-- proponer lo mismo (ver lib/resumen-diario/prioridades.ts). La clave es el
-- filtro barato; el modelo es el que entiende.
-- ============================================================================

create table if not exists public.prioridades_descartadas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,

  -- Para el filtro exacto en la misma jornada y en reformulaciones chicas.
  clave       text not null,
  -- El texto tal como lo escribió el modelo. Es lo que se le muestra de vuelta
  -- para que no lo repita.
  texto       text not null,

  descartada_en timestamptz not null default now(),

  -- Tachar dos veces lo mismo no crea dos filas: destachar y volver a tachar es
  -- un gesto normal.
  unique (usuario_id, clave)
);

-- El acceso es solo por service role, igual que el resto de las tablas de este
-- core: RLS activo y sin políticas (ver lib/supabase-admin.ts).
alter table public.prioridades_descartadas enable row level security;

-- La consulta real es siempre "lo que esta persona tachó últimamente".
create index if not exists prioridades_descartadas_usuario_fecha
  on public.prioridades_descartadas (usuario_id, descartada_en desc);

comment on table public.prioridades_descartadas is
  'Prioridades de Mi Día que la persona marcó como hechas. Viven fuera de resumen_diario para que sobrevivan al día en que se tacharon y el resumen de mañana no las vuelva a proponer.';
comment on column public.prioridades_descartadas.clave is
  'Texto normalizado (sin tildes, signos ni palabras vacías) para reconocer la misma prioridad escrita de otra forma. Ver normalizarPrioridad en lib/resumen-diario/prioridades.ts.';
