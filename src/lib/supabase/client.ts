import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

/**
 * Cliente do navegador. Usado para login, logout e troca de senha — e, desde
 * o upload direto de anexos, também para subir o arquivo para o Storage com
 * `uploadToSignedUrl()`. É um dos poucos lugares em que um componente toca o
 * Supabase direto (a regra do projeto é "nenhum componente chama Supabase
 * direto"): a URL assinada em si é a autorização (mintada no servidor, em
 * `createAttachmentUpload`, só depois de checar o acesso), então o upload
 * aqui não abre nenhum buraco novo — é o mesmo carve-out que login já tinha.
 */
export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
