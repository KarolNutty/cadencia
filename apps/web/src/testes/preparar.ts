/**
 * Preparo dos testes de componente.
 *
 * `jsdom` não implementa `matchMedia`, e o provedor de tema usa isso para
 * descobrir a preferência do sistema. A alternativa seria escrever
 * `window.matchMedia?.()` no código de produção, o que enfraqueceria a
 * aplicação para acomodar uma limitação do ambiente de teste. É melhor o teste
 * fornecer o que o navegador fornece.
 */
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (consulta: string) => ({
      matches: false,
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * `scrollIntoView` também não existe no jsdom.
 *
 * Mesma escolha de sempre: o ambiente de teste fornece o que o navegador
 * fornece, em vez de o código de produção virar `elemento?.scrollIntoView?.()`
 * para acomodar uma limitação que só existe aqui.
 */
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
