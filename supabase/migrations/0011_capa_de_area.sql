-- Capa da área, para a vitrine da fase 4.
--
-- Segue exatamente o modelo de courses.cover_url: é uma URL informada por
-- quem administra, não um upload. O projeto não tem fluxo de upload de
-- imagem, e criar um só para isto seria construir storage, política de
-- bucket e tela de envio para resolver um problema que colar uma URL já
-- resolve.
--
-- Nenhuma política nova: areas_leitura (0001) já libera leitura a qualquer
-- pessoa ativa e areas_escrita já restringe escrita a admin. A coluna herda
-- as duas.
alter table public.areas add column cover_url text;

comment on column public.areas.cover_url is
  'URL da capa da área na vitrine. 1600x1000 px, proporção 16:10. Nula cai na cor da área.';
