-- Corrige recursão infinita introduzida por 0005 em perguntas_edita e
-- respostas_edita.
--
-- 0005 tentou travar lesson_id/question_id/author_id contra o valor já
-- gravado com uma subconsulta autocorrelacionada dentro do próprio WITH
-- CHECK — mesma ideia do pin de e-mail em profiles_ativa_a_si (0001), só
-- que contra o id da própria linha em vez de auth.uid(). Ao aplicar e testar
-- contra sessões reais, todo UPDATE em questions passou a falhar com
-- SQLSTATE 42P17 ("infinite recursion detected in policy for relation
-- questions"): a subconsulta reabre `questions`, o que reavalia as
-- políticas da própria tabela para decidir quais linhas a subconsulta pode
-- ver, o que reabre a subconsulta de novo — um ciclo. O pin de e-mail em
-- profiles não sofre disso porque correlaciona só por auth.uid() (não
-- reconsulta a linha pelo próprio id) e só precisa da política de SELECT,
-- nunca da de UPDATE que está sendo avaliada — não há como o mesmo UPDATE
-- entrar em ciclo consigo mesmo.
--
-- A correção usa uma função SECURITY DEFINER que recebe o id da linha e os
-- valores propostos e devolve um boolean comparando com o que está gravado.
-- Por ser SECURITY DEFINER, a consulta interna roda como o dono da função —
-- que, como o dono de qualquer tabela, não está sujeito à RLS da própria
-- tabela por padrão — então não reabre as políticas de questions/answers e
-- não recursiona. Devolver só um boolean (não a linha) mantém a função
-- segura mesmo se alguém chamar via RPC direto sem os valores corretos:
-- como can_access_course, é um portão binário, não uma forma de ler
-- conteúdo.
create or replace function public.pergunta_mantem_chaves(p_id uuid, p_lesson_id uuid, p_author_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.questions
    where id = p_id and lesson_id = p_lesson_id and author_id = p_author_id
  );
$$;

create or replace function public.resposta_mantem_chaves(p_id uuid, p_question_id uuid, p_author_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.answers
    where id = p_id and question_id = p_question_id and author_id = p_author_id
  );
$$;

drop policy perguntas_edita on public.questions;
create policy perguntas_edita on public.questions
  for update to authenticated
  using (
    (author_id = auth.uid() and public.auth_is_active())
    or exists (select 1 from public.lessons l where l.id = lesson_id and public.can_manage_course(l.course_id))
  )
  with check (public.pergunta_mantem_chaves(id, lesson_id, author_id));

drop policy respostas_edita on public.answers;
create policy respostas_edita on public.answers
  for update to authenticated
  using (author_id = auth.uid() and public.auth_is_active())
  with check (public.resposta_mantem_chaves(id, question_id, author_id));
