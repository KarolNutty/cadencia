// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BarreiraDeErro } from '@/componentes/BarreiraDeErro';

/**
 * Sem barreira, um componente que quebra derruba a árvore inteira e a pessoa vê
 * uma tela preta, sem explicação e sem saída. Foi o que aconteceu quando o
 * avatar recebeu um nome vazio: um detalhe de canto apagou o aplicativo.
 */

function Quebra(): never {
  throw new Error('falhei de propósito');
}

beforeEach(() => {
  // O React registra o erro no console mesmo quando a barreira o captura, e o
  // ruído esconde as falhas de verdade da suíte.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('barreira de erro', () => {
  it('deixa passar o que funciona', () => {
    render(
      <BarreiraDeErro>
        <p>conteúdo normal</p>
      </BarreiraDeErro>,
    );

    expect(screen.getByText('conteúdo normal')).toBeTruthy();
  });

  it('mostra uma tela com saída quando algo quebra', () => {
    render(
      <BarreiraDeErro>
        <Quebra />
      </BarreiraDeErro>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeTruthy();
  });

  it('guarda o detalhe técnico sem jogá-lo na cara', () => {
    // Importa para quem desenvolve e não ajuda quem só queria estudar.
    render(
      <BarreiraDeErro>
        <Quebra />
      </BarreiraDeErro>,
    );

    expect(screen.getByText('falhei de propósito')).toBeTruthy();
    expect(screen.getByText('Detalhe técnico')).toBeTruthy();
  });

  it('anuncia como alerta, para leitor de tela avisar', () => {
    render(
      <BarreiraDeErro>
        <Quebra />
      </BarreiraDeErro>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
