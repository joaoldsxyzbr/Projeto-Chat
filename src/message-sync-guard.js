export function criarGuardaSincronizacaoMensagens() {
  let versao = 0

  return {
    capturar() {
      return versao
    },
    mudouDesde(capturada) {
      return versao !== capturada
    },
    registrarMutacao() {
      versao += 1
    },
  }
}
