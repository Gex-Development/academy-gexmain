-- A pessoa edita o próprio nome e a própria foto.
-- Papel, área e status ficam de fora: quem muda isso é o admin.
create policy profiles_edita_o_proprio on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.auth_is_active())
  with check (
    id = auth.uid()
    and role = public.auth_profile_role()
    and status = 'active'
    and area_id is not distinct from public.auth_profile_area()
  );
