// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Cliente } from '@cadencia/cliente-api';
import { Estrutura } from '@/componentes/Estrutura';
import { montarComProvedores } from '@/testes/montar';

/**
 * A gaveta de navegação.
 *
 * Recolher a lateral num celular é fácil. O que custa é manter o que a coluna
 * fixa dava de graça: fechar com Escape, fechar tocando fora, o foco entrar e
 * voltar, e a rolagem de trás não se mexer. Sem isso, a versão móvel é uma
 * regressão disfarçada de adaptação.
 */

const CLIENTE = {
  chamar: vi.fn(async () => ({
    turmas: [{ id: 't1', nome: 'Inglês A1', idioma: 'ingles' }],
  })),
} as unknown as Cliente;

/**
 * Sem sessão, a estrutura mostra as seções do aluno, que é o papel mais
 * restrito. Testar assim exercita o caminho que qualquer pessoa vê primeiro.
 */
function montar(aoTrocar = vi.fn()) {
  montarComProvedores(
    <Estrutura secao="estudar" aoTrocarSecao={aoTrocar}>
      <p>conteúdo</p>
    </Estrutura>,
    CLIENTE,
  );

  return aoTrocar;
}

describe('gaveta de navegação', () => {
  it('começa fechada', () => {
    montar();

    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('abre ao tocar no botão', async () => {
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));

    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('trava a rolagem do fundo enquanto está aberta', async () => {
    // Sem travar, arrastar sobre a gaveta move a página atrás e a pessoa perde
    // o lugar onde estava.
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Escape fecha e devolve a rolagem', async () => {
    // É o que todo mundo tenta antes de procurar o botão de fechar.
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));
    await usuario.keyboard('{Escape}');

    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }).getAttribute('aria-expanded'),
    ).toBe('false');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('o botão de fechar dentro da gaveta funciona', async () => {
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));
    await usuario.click(screen.getByRole('button', { name: 'Fechar navegação' }));

    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('existe um único botão de fechar anunciado', async () => {
    /**
     * A cortina fecha ao toque, mas fica fora da árvore de acessibilidade. Dois
     * botões com o mesmo nome fariam o leitor de tela repetir a mesma opção,
     * sem dizer que uma delas é a área ao redor.
     */
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));

    expect(screen.getAllByRole('button', { name: 'Fechar navegação' })).toHaveLength(1);
  });

  it('escolher uma seção navega e fecha', async () => {
    // Deixar a gaveta aberta depois de navegar esconde a tela que a pessoa
    // acabou de pedir.
    const aoTrocar = montar();

    await usuario.click(screen.getByRole('button', { name: 'Abrir navegação' }));
    await usuario.click(screen.getByRole('button', { name: /Progresso/ }));

    expect(aoTrocar).toHaveBeenCalledWith('progresso');
    expect(
      screen.getByRole('button', { name: 'Abrir navegação' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('o foco volta para o botão que abriu', async () => {
    // Quem navega por teclado precisa continuar de onde estava, e não no topo
    // do documento.
    montar();

    const abrir = screen.getByRole('button', { name: 'Abrir navegação' });

    await usuario.click(abrir);
    await usuario.keyboard('{Escape}');

    expect(document.activeElement).toBe(abrir);
  });

  it('a seção atual é anunciada como página corrente', () => {
    montar();

    const ativo = screen.getByRole('button', { current: 'page' });
    expect(ativo.textContent).toContain('Estudar');
  });
});
