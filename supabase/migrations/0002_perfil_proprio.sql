-- A pessoa edita o próprio nome e a própria foto.
-- Papel, área, status e e-mail ficam de fora: quem muda isso é o admin.
--
-- O e-mail precisa estar fixado aqui, e não só em profiles_ativa_a_si (0001):
-- políticas permissivas do Postgres são combinadas com OR, e essa combinação
-- vale separadamente tanto para USING quanto para WITH CHECK — o WITH CHECK
-- de TODAS as políticas de UPDATE aplicáveis a "authenticated" entra na
-- combinação, não só o da política cujo USING selecionou a linha. Sem o pin
-- abaixo, o WITH CHECK permissivo desta política (que não menciona e-mail)
-- fazia o OR passar mesmo quando o de profiles_ativa_a_si barrava a mesma
-- tentativa — cancelando, na prática, o pin que 0001 já tinha posto no
-- e-mail. O teste em tests/db/people.test.ts ("RLS: edição do próprio
-- perfil") prova isso: falha sem esta linha, passa com ela.
create policy profiles_edita_o_proprio on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.auth_is_active())
  with check (
    id = auth.uid()
    and role = public.auth_profile_role()
    and status = 'active'
    and area_id is not distinct from public.auth_profile_area()
    and email = (select p.email from public.profiles p where p.id = auth.uid())
  );
