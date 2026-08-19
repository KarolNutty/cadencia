// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar } from '@/componentes/Avatar';

describe('avatar', () => {
  it('usa a primeira e a última inicial', () => {
    render(<Avatar nome="Marina Costa Silva" />);
    expect(screen.getByText('MS')).toBeTruthy();
  });

  it('nome de uma palavra usa só a primeira letra', () => {
    render(<Avatar nome="Helena" />);
    expect(screen.getByText('H')).toBeTruthy();
  });

  it('a cor é sempre a mesma para o mesmo nome', () => {
    // Sorteada, o avatar deixa de ajudar a reconhecer quem é numa lista e vira
    // enfeite que muda a cada carregamento.
    const { container: um } = render(<Avatar nome="Marina Costa" />);
    const { container: outro } = render(<Avatar nome="Marina Costa" />);

    expect(um.querySelector('.avatar')?.getAttribute('style')).toBe(
      outro.querySelector('.avatar')?.getAttribute('style'),
    );
  });

  it('nome vazio não quebra a tela', () => {
    /**
     * O tipo diz `string`, mas dado vindo da rede chega como o servidor mandou.
     * Um campo que sumiu do formato derrubava a árvore inteira aqui, e um
     * avatar é detalhe de canto: ele não pode ter poder de apagar a tela.
     */
    expect(() => render(<Avatar nome="" />)).not.toThrow();
    expect(screen.getByText('?')).toBeTruthy();
  });

  it('nome ausente também não quebra', () => {
    expect(() => render(<Avatar nome={undefined as unknown as string} />)).not.toThrow();
  });
});
