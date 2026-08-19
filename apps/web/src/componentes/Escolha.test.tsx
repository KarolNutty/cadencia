// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Escolha } from '@/componentes/Escolha';

/**
 * Construir um seletor significa reimplementar o que o `<select>` nativo dava
 * de graça. Estes testes existem para garantir que a troca não custou
 * acessibilidade, que é o preço usual de trocar o nativo por aparência.
 */

const OPCOES = [
  { valor: 'a', rotulo: 'Inglês A1' },
  { valor: 'b', rotulo: 'Inglês A2' },
  { valor: 'c', rotulo: 'Espanhol B1' },
];

function montar(aoEscolher = vi.fn()) {
  render(<Escolha rotulo="Turma" opcoes={OPCOES} valor="a" aoEscolher={aoEscolher} />);
  return aoEscolher;
}

describe('o seletor próprio', () => {
  it('mostra a opção escolhida', () => {
    montar();
    expect(screen.getByRole('button', { name: /Inglês A1/ })).toBeTruthy();
  });

  it('abre e fecha ao clicar', async () => {
    montar();
    const gatilho = screen.getByRole('button', { name: /Inglês A1/ });

    expect(gatilho.getAttribute('aria-expanded')).toBe('false');

    await usuario.click(gatilho);
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(gatilho.getAttribute('aria-expanded')).toBe('true');

    await usuario.click(gatilho);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('escolhe ao clicar numa opção', async () => {
    const aoEscolher = montar();

    await usuario.click(screen.getByRole('button', { name: /Inglês A1/ }));
    await usuario.click(screen.getByRole('option', { name: /Espanhol B1/ }));

    expect(aoEscolher).toHaveBeenCalledWith('c');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('abre com a seta para baixo e escolhe com Enter', async () => {
    // É o que o nativo fazia sozinho. Sem isto, quem navega por teclado fica
    // preso no campo.
    const aoEscolher = montar();

    screen.getByRole('button', { name: /Inglês A1/ }).focus();
    await usuario.keyboard('{ArrowDown}');

    expect(screen.getByRole('listbox')).toBeTruthy();

    await usuario.keyboard('{ArrowDown}{Enter}');
    expect(aoEscolher).toHaveBeenCalledWith('b');
  });

  it('a seta para cima dá a volta na lista', async () => {
    const aoEscolher = montar();

    screen.getByRole('button', { name: /Inglês A1/ }).focus();
    await usuario.keyboard('{ArrowDown}{ArrowUp}{Enter}');

    expect(aoEscolher).toHaveBeenCalledWith('c');
  });

  it('fecha com Escape sem escolher nada', async () => {
    const aoEscolher = montar();

    screen.getByRole('button', { name: /Inglês A1/ }).focus();
    await usuario.keyboard('{ArrowDown}{Escape}');

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it('fecha ao clicar fora', async () => {
    montar();

    await usuario.click(screen.getByRole('button', { name: /Inglês A1/ }));
    await usuario.click(document.body);

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('anuncia qual opção está marcada', async () => {
    // `aria-selected` é como o leitor de tela informa a escolha atual.
    montar();

    await usuario.click(screen.getByRole('button', { name: /Inglês A1/ }));

    const escolhida = screen.getByRole('option', { selected: true });
    expect(escolhida.textContent).toContain('Inglês A1');
  });
});
