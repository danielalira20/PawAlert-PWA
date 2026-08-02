create table public.apelaciones_aliados (
  id uuid not null default gen_random_uuid (),
  perfil_apoyo_id uuid not null,
  mensaje text not null,
  documentos_urls jsonb null default '[]'::jsonb,
  estado character varying null default 'pendiente'::character varying,
  respuesta_admin text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint apelaciones_aliados_pkey primary key (id),
  constraint apelaciones_aliados_perfil_apoyo_id_fkey foreign KEY (perfil_apoyo_id) references perfil_apoyo (id) on delete CASCADE
) TABLESPACE pg_default;
