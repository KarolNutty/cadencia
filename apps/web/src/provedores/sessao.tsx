import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { criarCliente, type Cliente, type Tokens } from '@cadencia/cliente-api';
import type { CadastrarSaida, EntrarSaida, Usuario } from '@cadencia/contrato';

const URL_DA_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

interface Sessao {
  usuario: Usuario | null;
  /** Verdadeiro enquanto a sessão guardada está sendo retomada. */
  carregando: boolean;
  cliente: Cliente;
  entrar: (email: string, senha: string) => Promise<void>;
  /** Devolve em quantas turmas a pessoa entrou por convite pendente. */
  cadastrar: (nome: string, email: string, senha: string) => Promise<number>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

/**
 * A sessão do painel.
 *
 * A diferença essencial em relação ao aplicativo: aqui o token de acesso vive
 * **só em memória**, e o de renovação nunca chega ao JavaScript, ele viaja em
 * cookie `httpOnly` que o navegador envia sozinho.
 *
 * Guardar o acesso em `localStorage` seria mais cômodo e traria a persistência
 * entre recargas de graça. Também deixaria qualquer script injetado na página
 * ler a sessão inteira. O preço da escolha correta é este: ao recarregar a
 * página, o app pede um token novo usando o cookie, e é por isso que a
 * primeira renderização tenta renovar antes de decidir que não há sessão.
 */
export function ProvedorDeSessao({
  children,
  clienteDeTeste,
}: {
  children: ReactNode;
  /** Injetado nos testes, para exercitar a tela sem rede. */
  clienteDeTeste?: Cliente;
}) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);
  const acesso = useRef<string | null>(null);

  const perderSessao = useCallback(async () => {
    acesso.current = null;
    setUsuario(null);
  }, []);

  const cliente = useMemo(() => {
    if (clienteDeTeste) return clienteDeTeste;

    return criarCliente({
      baseUrl: URL_DA_API,
      // O servidor decide por aqui que o token de renovação vai para o cookie
      // `httpOnly`, e não para o corpo da resposta.
      plataforma: 'web',
      // O painel só tem o token de acesso; o de renovação está no cookie.
      obterTokens: async () =>
        acesso.current ? { acesso: acesso.current, renovacao: '' } : null,
      salvarTokens: async (novos) => {
        acesso.current = novos.acesso;
      },
      aoPerderSessao: perderSessao,
      // Sem isto o navegador não manda o cookie de renovação, e a sessão do
      // painel morreria a cada quinze minutos.
      credenciais: 'include',
      renovarSessao: async (buscar, baseUrl): Promise<Tokens | null> => {
        const resposta = await buscar(`${baseUrl}/sessoes/renovar`, {
          method: 'POST',
          credentials: 'include',
          /*
           * Sem `content-type`, porque não há corpo.
           *
           * No navegador o token viaja no cookie, e a requisição vai vazia.
           * Anunciar `application/json` sem mandar JSON faz o Fastify recusar
           * antes de a rota rodar, e o erro fala de corpo vazio, não de sessão.
           */
          headers: { 'x-plataforma': 'web' },
        });

        if (!resposta.ok) return null;

        const dados = (await resposta.json()) as { acesso: string };
        // A renovação fica vazia de propósito: ela não passa por aqui.
        return { acesso: dados.acesso, renovacao: '' };
      },
    });
  }, [clienteDeTeste, perderSessao]);

  /**
   * Retoma a sessão ao abrir ou recarregar a página.
   *
   * O token de acesso vive só em memória, e memória some no recarregamento. O
   * de renovação está no cookie `httpOnly`, que o navegador manda sozinho: a
   * primeira chamada leva 401, o cliente troca o cookie por um acesso novo e
   * repete. Sem este passo, guardar o token em memória, que é a escolha certa
   * contra script injetado, custaria um logout a cada F5.
   *
   * Quando não há cookie válido, a renovação falha em silêncio e a tela de
   * entrada assume. Não é erro: é a primeira visita de alguém.
   */
  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const dados = await cliente.chamar<{ usuario: Usuario }>('/eu');
        if (ativo) setUsuario(dados.usuario);
      } catch {
        if (ativo) setUsuario(null);
      } finally {
        if (ativo) setCarregando(false);
      }
    })();

    return () => {
      ativo = false;
    };
  }, [cliente]);

  const entrar = useCallback(
    async (email: string, senha: string) => {
      const dados = await cliente.chamar<EntrarSaida>('/sessoes', {
        metodo: 'POST',
        corpo: { email, senha },
        publica: true,
      });

      acesso.current = dados.acesso;
      setUsuario(dados.usuario);
    },
    [cliente],
  );

  const cadastrar = useCallback(
    async (nome: string, email: string, senha: string) => {
      const dados = await cliente.chamar<CadastrarSaida>('/usuarios', {
        metodo: 'POST',
        corpo: {
          nome,
          email,
          senha,
          // O fuso vem do navegador: é onde a pessoa está que define quando o
          // dia de estudo vira.
          fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        publica: true,
      });

      acesso.current = dados.acesso;
      setUsuario(dados.usuario);

      return dados.turmasQueEntrou;
    },
    [cliente],
  );

  const sair = useCallback(async () => {
    try {
      await cliente.chamar('/sessoes', { metodo: 'DELETE' });
    } catch {
      // O cookie some do lado do servidor ou expira sozinho. Prender a pessoa
      // numa sessão que ela pediu para encerrar é pior.
    }
    await perderSessao();
  }, [cliente, perderSessao]);

  const valor = useMemo(
    () => ({ usuario, carregando, cliente, entrar, cadastrar, sair }),
    [usuario, carregando, cliente, entrar, cadastrar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de ProvedorDeSessao.');
  return contexto;
}
