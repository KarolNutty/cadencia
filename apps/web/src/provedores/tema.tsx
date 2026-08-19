import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

/**
 * Tema claro, escuro ou o do sistema.
 *
 * O padrão é **seguir o sistema**. Quem já configurou o computador não deveria
 * configurar de novo, e a maioria nunca abre a preferência do aplicativo.
 *
 * A escolha é guardada, mas o valor guardado pode ser "sistema": tratar
 * "escuro" e "sigo o sistema, que está escuro" como a mesma coisa faria a tela
 * parar de acompanhar quando a pessoa mudasse o computador.
 */

export type Preferencia = 'claro' | 'escuro' | 'sistema';
export type TemaAplicado = 'claro' | 'escuro';

const CHAVE = 'cadencia.tema';

interface Contexto {
  preferencia: Preferencia;
  aplicado: TemaAplicado;
  escolher: (preferencia: Preferencia) => void;
}

const ContextoDoTema = createContext<Contexto | null>(null);

function lerPreferencia(): Preferencia {
  const guardada = localStorage.getItem(CHAVE);
  return guardada === 'claro' || guardada === 'escuro' ? guardada : 'sistema';
}

function sistemaEstaEscuro(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ProvedorDeTema({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<Preferencia>(lerPreferencia);
  const [sistemaEscuro, setSistemaEscuro] = useState(sistemaEstaEscuro);

  // Quem escolheu "sistema" acompanha a mudança sem recarregar a página.
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = (evento: MediaQueryListEvent) => setSistemaEscuro(evento.matches);

    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const aplicado: TemaAplicado =
    preferencia === 'sistema' ? (sistemaEscuro ? 'escuro' : 'claro') : preferencia;

  useEffect(() => {
    document.documentElement.dataset.tema = aplicado;
  }, [aplicado]);

  const escolher = useCallback((nova: Preferencia) => {
    setPreferencia(nova);

    if (nova === 'sistema') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, nova);
  }, []);

  const valor = useMemo(
    () => ({ preferencia, aplicado, escolher }),
    [preferencia, aplicado, escolher],
  );

  return <ContextoDoTema.Provider value={valor}>{children}</ContextoDoTema.Provider>;
}

export function useTema(): Contexto {
  const contexto = useContext(ContextoDoTema);
  if (!contexto) throw new Error('useTema precisa estar dentro de ProvedorDeTema.');
  return contexto;
}
