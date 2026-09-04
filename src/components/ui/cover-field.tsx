'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/cn'
import { ALLOWED_CAPA_MIME, CAPA_BUCKET, validateCapa, type CapaEscopo } from '@/lib/storage/capas'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { confirmCapaUpload, createCapaUpload } from '@/server/capas'
import { Field } from './field'
import { Input } from './input'

const ACCEPT = Object.keys(ALLOWED_CAPA_MIME).join(',')

/**
 * Campo de URL de capa com um retângulo na proporção real.
 *
 * O retângulo existe por um pedido concreto do dono do produto: quem vai
 * fazer a arte precisa saber a medida ANTES de fazer, senão sobe uma imagem
 * de proporção errada e ela aparece esticada ou cortada. Vazio, o retângulo
 * declara a medida; preenchido, mostra a prévia com o MESMO corte da tela
 * real, para o problema aparecer aqui e não depois.
 *
 * Colar a URL sempre funcionou e continua funcionando — é o que mantém
 * capas já cadastradas editáveis. `escopo`+`entidadeId` acrescentam o
 * upload direto (o retângulo vira também a área de escolher arquivo, como
 * um <label> associado ao <input type="file"> escondido — um único parada
 * de tabulação, não dois); sem os dois, o campo se comporta exatamente como
 * antes, só por URL.
 */
export function CoverField({
  id,
  name,
  largura,
  altura,
  defaultValue,
  label = 'URL da capa',
  escopo,
  entidadeId,
}: {
  id?: string
  name: string
  largura: number
  altura: number
  defaultValue?: string
  label?: string
  /**
   * Presentes só quando o recurso já tem um id de verdade (edição). Ao
   * criar uma área (area-form.tsx) a área ainda não existe — inventar um id
   * provisório só para poder mintar um upload que pode nunca virar uma área
   * de verdade trocaria um problema pequeno (upload indisponível na
   * criação) por um maior (imagem órfã no bucket público sempre que alguém
   * abandona o formulário depois de escolher o arquivo). Por isso o upload
   * direto só aparece a partir da edição — colar uma URL continua
   * disponível também na criação. area-row.tsx e course-settings.tsx (só
   * telas de edição) passam os dois; area-form.tsx (criação) não passa
   * nenhum.
   */
  escopo?: CapaEscopo
  entidadeId?: string
}) {
  // Sem `id`, cai no `name`. Correto quando só existe uma instância na
  // página (ex.: area-form.tsx), mas quebra quando o mesmo `name` aparece
  // em mais de um formulário montado ao mesmo tempo — o formulário "Nova
  // área", sempre presente no aside, e o de edição de cada AreaRow, que
  // abre por cima da listagem. Quem monta várias instâncias (area-row.tsx)
  // deve passar um `id` namespaced, do mesmo jeito que já faz para os
  // outros campos do formulário de edição.
  const fieldId = id ?? name
  const arquivoId = useId()
  const [url, setUrl] = useState(defaultValue ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const podeEnviar = Boolean(escopo && entidadeId)

  // O upload não cabe num único <form action={...}> de Server Action: o
  // arquivo sobe direto do navegador para o Storage (uploadToSignedUrl),
  // entre autorizar/mintar (createCapaUpload) e confirmar (confirmCapaUpload).
  // Por isso a orquestração é manual aqui, não useActionState — mesmo desenho
  // de attachment-manager.tsx. O formulário que envolve este campo (o Salvar
  // de area-row.tsx / course-settings.tsx) continua sendo uma Server Action
  // normal: o upload só atualiza `url`, que é o valor do input de URL — o
  // Salvar manda essa URL como qualquer outra colada à mão.
  async function enviarArquivo(file: File) {
    // Mesma função pura que o servidor usa (validateCapa), rodada aqui antes
    // de mintar: dá a mensagem específica — tipo errado, acima de 5 MB — na
    // hora, sem esperar o round-trip do mint. Não é a barreira de verdade
    // (createCapaUpload e verifyCapaUpload validam de novo no servidor,
    // contra o que o Storage realmente recebeu).
    const erroValidacao = validateCapa({ name: file.name, type: file.type, size: file.size })
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }
    if (!escopo || !entidadeId) return

    setEnviando(true)
    setErro(null)
    try {
      const mintForm = new FormData()
      mintForm.set('escopo', escopo)
      mintForm.set('id', entidadeId)
      mintForm.set('fileName', file.name)
      mintForm.set('mimeType', file.type)
      mintForm.set('sizeBytes', String(file.size))

      const mint = await createCapaUpload(null, mintForm)
      if (!mint.ok) {
        setErro(mint.error)
        return
      }

      const browser = createBrowserSupabase()
      const { error: erroUpload } = await browser.storage
        .from(CAPA_BUCKET)
        .uploadToSignedUrl(mint.data.path, mint.data.token, file, { contentType: file.type })
      if (erroUpload) {
        setErro('Não foi possível enviar a imagem. Tente novamente.')
        return
      }

      const confirmForm = new FormData()
      confirmForm.set('escopo', escopo)
      confirmForm.set('id', entidadeId)
      confirmForm.set('path', mint.data.path)
      // `url` aqui ainda é a capa ANTERIOR — só é sobrescrita por setUrl(),
      // mais abaixo, depois que o servidor confirma o upload novo (e, se for
      // o caso, apaga o antigo). Vazio quando esta é a primeira capa da
      // entidade — não há nada para o servidor substituir.
      if (url) confirmForm.set('previousUrl', url)

      const confirmado = await confirmCapaUpload(null, confirmForm)
      if (!confirmado.ok) {
        setErro(confirmado.error)
        return
      }

      setUrl(confirmado.data.url)
    } finally {
      setEnviando(false)
    }
  }

  const conteudo = url ? (
    // Capa é URL externa (colada, ou pública no Storage depois do upload);
    // next/image exigiria allowlist de domínio. Mesmo mecanismo de
    // course-card.tsx.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="text-xs text-texto-suave">
      {largura} × {altura} px
    </span>
  )

  return (
    <Field
      label={label}
      htmlFor={fieldId}
      hint={
        podeEnviar
          ? `${largura} × ${altura} px. Envie um arquivo (PNG, JPEG ou WebP, até 5 MB) ou cole uma URL. Deixe o essencial no centro: em telas largas a imagem é cortada em faixa.`
          : `${largura} × ${altura} px. Deixe o essencial no centro: em telas largas a imagem é cortada em faixa.`
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          id={fieldId}
          name={name}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        {podeEnviar ? (
          // <label htmlFor> associado ao <input type="file"> escondido: o
          // próprio navegador cuida do clique (em qualquer ponto do
          // retângulo, imagem incluída) e do teclado (o input é o único
          // parada de tabulação — Espaço nele já abre o seletor de arquivo,
          // comportamento nativo, sem handler nenhum escrito aqui). Um
          // `<div role="button">` ao lado do input, como numa versão
          // anterior deste componente, criava DOIS paradas de tabulação
          // para a mesma ação — este desenho tem só um.
          <label
            htmlFor={arquivoId}
            className={cn(
              'relative flex items-center justify-center overflow-hidden rounded-card border border-dashed border-borda bg-fundo',
              enviando ? 'cursor-wait' : 'cursor-pointer',
            )}
            style={{ aspectRatio: `${largura} / ${altura}` }}
          >
            <span className="sr-only">Escolher arquivo de imagem para a capa</span>
            {conteudo}
            {enviando && (
              // Visível nos dois ramos (com capa já preenchida OU vazio):
              // sem isto, alguém reenviando a capa de um curso que já TEM
              // capa via clicava, via a imagem antiga parada e nenhum sinal
              // de que algo estava acontecendo durante toda a ida e volta de
              // rede — justamente o caso comum (editar, não criar do zero).
              <span className="absolute inset-0 flex items-center justify-center bg-fundo/85 text-xs text-texto-suave">
                Enviando…
              </span>
            )}
            <input
              id={arquivoId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={enviando}
              onChange={(evento) => {
                const file = evento.target.files?.[0]
                evento.target.value = ''
                if (file) void enviarArquivo(file)
              }}
            />
          </label>
        ) : (
          <div
            className="flex items-center justify-center overflow-hidden rounded-card border border-dashed border-borda bg-fundo"
            style={{ aspectRatio: `${largura} / ${altura}` }}
          >
            {conteudo}
          </div>
        )}
        {erro && (
          <p role="alert" className="text-xs text-perigo">
            {erro}
          </p>
        )}
      </div>
    </Field>
  )
}
