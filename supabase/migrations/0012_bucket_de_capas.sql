-- Bucket de capas, para upload direto do navegador (área e curso).
--
-- Público, ao contrário de 'lesson-attachments' (privado, link assinado): a
-- capa aparece para qualquer pessoa que vê o catálogo, inclusive nos cursos
-- e áreas BLOQUEADOS para ela — é justamente essa prévia que faz alguém
-- pedir acesso. Não há o que proteger. Anexo é o contrário (material da
-- aula, só para quem já tem acesso) e continua privado.
--
-- 5 MB (5242880 bytes, igual a MAX_CAPA_BYTES em src/lib/storage/capas.ts):
-- uma imagem de 1600×1000 bem comprimida em JPEG/WebP fica na casa de
-- 200–400 KB. 5 MB é folga larga para uma arte mal otimizada sem deixar um
-- bucket PÚBLICO virar depósito de arquivo grande.
insert into storage.buckets (id, name, public, file_size_limit)
values ('capas', 'capas', true, 5242880)
on conflict (id) do nothing;

-- Nenhuma política de escrita — deliberado, mesmo raciocínio que fez a
-- migration 0008 remover 'anexos_storage_escrita': o produto nunca
-- exercita upload direto contra o Storage com o token de sessão do
-- usuário. O upload de verdade acontece com uma URL assinada, mintada pelo
-- servidor (createCapaUpload, em src/server/capas.ts) DEPOIS de checar
-- papel e acesso ao recurso específico — a URL assinada é a autorização.
-- Um bucket sem política de escrita não aceita upload direto de ninguém,
-- nem de quem está logado, o que é exatamente o que queremos: o único
-- caminho de escrita é o que já passou pela checagem de permissão.
--
-- Leitura pública não precisa de política em storage.objects: o bucket
-- marcado public=true já serve qualquer objeto por URL direta
-- ({SUPABASE_URL}/storage/v1/object/public/capas/{path}), sem RLS.
