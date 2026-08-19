/**
 * Avatar com iniciais.
 *
 * A cor vem do nome, e não é sorteada: a mesma pessoa precisa ter sempre a
 * mesma cor, senão o avatar deixa de ajudar a reconhecer quem é numa lista e
 * vira enfeite que muda a cada carregamento.
 */
const CORES = [
  'var(--violeta)',
  'var(--menta)',
  'var(--azul)',
  'var(--ambar)',
  'var(--coral)',
] as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? '?';
  const ultima = partes.length > 1 ? partes[partes.length - 1]?.[0] : '';

  return `${primeira}${ultima ?? ''}`.toUpperCase();
}

function corDoNome(nome: string): string {
  // Soma dos códigos das letras: simples, estável e suficiente para espalhar.
  const soma = [...nome].reduce((total, letra) => total + letra.charCodeAt(0), 0);
  return CORES[soma % CORES.length]!;
}

export function Avatar({ nome, tamanho = 36 }: { nome: string; tamanho?: number }) {
  /*
   * Nome ausente vira interrogação, e não exceção.
   *
   * O tipo diz `string`, mas dado vindo da rede chega como o servidor mandou, e
   * um campo que sumiu do formato quebrava a árvore inteira aqui. Um avatar é
   * detalhe de canto: ele não pode ter poder de apagar a tela.
   */
  const seguro = typeof nome === 'string' && nome.trim().length > 0 ? nome : '?';

  return (
    <span
      className="avatar"
      style={{
        width: tamanho,
        height: tamanho,
        background: corDoNome(seguro),
        fontSize: Math.round(tamanho * 0.38),
      }}
      // Decorativo: o nome já está escrito ao lado, e repeti-lo faria o leitor
      // de tela dizer duas vezes.
      aria-hidden
    >
      {iniciais(seguro)}
    </span>
  );
}
