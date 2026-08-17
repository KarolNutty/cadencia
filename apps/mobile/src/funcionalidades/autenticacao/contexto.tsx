import { getCalendars } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EntrarSaida, Usuario } from '@cadencia/contrato';
import { type DiaDeEstudo, diaDeEstudoDe } from '@cadencia/dominio';
import { criarCliente, type Cliente, type Tokens } from '@cadencia/cliente-api';
import { apagarTokens, lerTokens, salvarTokens } from '../../compartilhado/armazenamento';
import { descobrirEnderecoDaApi } from '../../compartilhado/endereco-da-api';

interface Sessao {
  usuario: Usuario | null;
  carregando: boolean;
  cliente: Cliente;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** O dia de estudo de agora, no fuso do aparelho. */
  hoje: () => DiaDeEstudo;
}

const Contexto = createContext<Sessao | null>(null);

const URL_DA_API = descobrirEnderecoDaApi();

export function ProvedorDeSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  /**
   * Os tokens vivem numa ref, e não em estado.
   *
   * O cliente HTTP precisa do valor mais recente no momento da chamada. Guardado
   * em estado, ele seria capturado pelo fechamento da renderização anterior — e
   * uma chamada disparada logo depois de uma renovação usaria o token velho,
   * tomaria 401 e renovaria de novo. Renovação repetida é exatamente o que o
   * servidor lê como token roubado, e a família cairia.
   */
  const tokens = useRef<Tokens | null>(null);

  const perderSessao = useCallback(async () => {
    tokens.current = null;
    await apagarTokens();
    setUsuario(null);
  }, []);

  const cliente = useMemo(
    () =>
      criarCliente({
        baseUrl: URL_DA_API,
        obterTokens: async () => tokens.current,
        salvarTokens: async (novos) => {
          tokens.current = novos;
          await salvarTokens(novos);
        },
        aoPerderSessao: perderSessao,
      }),
    [perderSessao],
  );

  // Ao abrir o app, tenta reaproveitar a sessão guardada.
  useEffect(() => {
    let ativo = true;

    void (async () => {
      const guardados = await lerTokens();
      tokens.current = guardados;

      if (guardados) {
        try {
          const dados = await cliente.chamar<{ usuario: Usuario }>('/eu');
          if (ativo) setUsuario(dados.usuario);
        } catch {
          // Token vencido ou revogado: a tela de entrada assume.
          await perderSessao();
        }
      }

      if (ativo) setCarregando(false);
    })();

    return () => {
      ativo = false;
    };
  }, [cliente, perderSessao]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const dados = await cliente.chamar<EntrarSaida>('/sessoes', {
        metodo: 'POST',
        corpo: { email, senha },
        publica: true,
      });

      if (!dados.renovacao) {
        throw new Error('O servidor não devolveu o token de renovação.');
      }

      const novos = { acesso: dados.acesso, renovacao: dados.renovacao };
      tokens.current = novos;
      await salvarTokens(novos);
      setUsuario(dados.usuario);
    },
    [cliente],
  );

  const sair = useCallback(async () => {
    const atuais = tokens.current;

    if (atuais) {
      try {
        await cliente.chamar('/sessoes', {
          metodo: 'DELETE',
          corpo: { renovacao: atuais.renovacao },
        });
      } catch {
        // Sem rede, o token local some do mesmo jeito. Prender a pessoa numa
        // sessão que ela pediu para encerrar é pior do que o servidor ficar com
        // um registro que expira sozinho.
      }
    }

    await perderSessao();
  }, [cliente, perderSessao]);

  const hoje = useCallback((): DiaDeEstudo => {
    // O fuso vem do aparelho, e não do cadastro: é onde a pessoa está agora que
    // define se o dia de estudo já virou.
    const fuso = getCalendars()[0]?.timeZone ?? 'America/Sao_Paulo';
    return diaDeEstudoDe(new Date(), fuso);
  }, []);

  const valor = useMemo(
    () => ({ usuario, carregando, cliente, entrar, sair, hoje }),
    [usuario, carregando, cliente, entrar, sair, hoje],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de ProvedorDeSessao.');
  return contexto;
}
