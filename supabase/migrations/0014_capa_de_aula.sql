-- Capa da aula: a miniatura de cada episódio na lista do curso.
--
-- Mesmo modelo de courses.cover_url e areas.cover_url (0011): URL pública
-- do bucket `capas`. Nula cai na capa do curso, depois na da área, depois
-- no degradê — a mesma cadeia de capaComReserva.
--
-- Nenhuma política nova: RLS é por linha, e as políticas de lessons (0001)
-- já decidem quem lê e quem escreve a aula; a coluna herda as duas.
alter table public.lessons add column cover_url text;

comment on column public.lessons.cover_url is
  'URL da miniatura da aula na lista de episódios. 1280x800 px, proporção 16:10. Nula cai na capa do curso.';
