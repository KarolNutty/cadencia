// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import usuario from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BotaoDeTema } from '@/componentes/BotaoDeTema';
import { ProvedorDeTema, useTema } from '@/provedores/tema';

/** Deixa o sistema respondendo claro ou escuro, como o navegador faria. */
function sistemaEscuro(escuro: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (consulta: string) => ({
      matches: escuro,
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

function Espiao() {
  const { preferencia, aplicado } = useTema();
  return <span data-testid="estado">{`${preferencia}:${aplicado}`}</span>;
}

function montar() {
  return render(
    <ProvedorDeTema>
      <BotaoDeTema />
      <Espiao />
    </ProvedorDeTema>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sistemaEscuro(false);
});

afterEach(() => {
  delete document.documentElement.dataset.tema;
});

describe('escolha de tema', () => {
  it('segue o sistema por padrão', () => {
    // Quem já configurou o computador não deveria configurar de novo.
    sistemaEscuro(true);
    montar();

    expect(screen.getByTestId('estado').textContent).toBe('sistema:escuro');
  });

  it('aplica o tema no elemento raiz', () => {
    sistemaEscuro(true);
    montar();

    expect(document.documentElement.dataset.tema).toBe('escuro');
  });

  it('a escolha manual vence a do sistema', async () => {
    sistemaEscuro(true);
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Tema claro' }));

    expect(screen.getByTestId('estado').textContent).toBe('claro:claro');
    expect(document.documentElement.dataset.tema).toBe('claro');
  });

  it('guarda a escolha manual', async () => {
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Tema escuro' }));

    expect(localStorage.getItem('cadencia.tema')).toBe('escuro');
  });

  it('voltar para o sistema apaga a escolha guardada', async () => {
    /**
     * Guardar "sistema" como se fosse um tema faria a tela parar de acompanhar
     * quando a pessoa mudasse a preferência do computador.
     */
    montar();

    await usuario.click(screen.getByRole('button', { name: 'Tema escuro' }));
    await usuario.click(screen.getByRole('button', { name: 'Seguir o sistema' }));

    expect(localStorage.getItem('cadencia.tema')).toBeNull();
    expect(screen.getByTestId('estado').textContent).toBe('sistema:claro');
  });

  it('lê a escolha guardada ao montar', () => {
    localStorage.setItem('cadencia.tema', 'escuro');
    montar();

    expect(screen.getByTestId('estado').textContent).toBe('escuro:escuro');
  });

  it('anuncia qual opção está ativa', () => {
    // O símbolo sozinho não diz nada para o leitor de tela.
    montar();

    const ativa = screen.getByRole('button', { pressed: true });
    expect(ativa.getAttribute('aria-label')).toBe('Seguir o sistema');
  });
});
