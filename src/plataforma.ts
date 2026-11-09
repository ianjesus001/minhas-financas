// Detalhes de iPhone/Android: instalação na tela de início e salvar arquivos.

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Aberto pelo ícone da tela de início (e não dentro do Safari/Chrome). */
export const isInstalado = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches

export const isMobile = () => isIOS() || /Android/.test(navigator.userAgent)

/**
 * Salva um arquivo. No celular abre a folha de compartilhar (Salvar em Arquivos, WhatsApp, Drive);
 * no iPhone instalado é o único jeito confiável, porque lá o <a download> não funciona.
 * Retorna false se a pessoa cancelou.
 */
export async function salvarArquivo(blob: Blob, nome: string): Promise<boolean> {
  const file = new File([blob], nome, { type: blob.type || 'application/octet-stream' })
  if (isMobile() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome })
      return true
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false
      // outro erro: tenta o download normal
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}
