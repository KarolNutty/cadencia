import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { criarCliente, type Cliente, type Tokens } from '@cadencia/cliente-api';
import type { EntrarSaida, Usuario } from '@cadencia/contrato';

const URL_DA_API = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

interface Sessao {
  usuario: Usuario | null;
  cliente: Cliente;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

/**
 * A sessão do painel.
 *
 * A diferença essencial em relação ao aplicativo: aqui o token de acesso vive
 * **só em memória**, e o de renovação nunca chega ao JavaScript — ele viaja em
 * cookie `httpOnly` que o navegador envia sozinho.
 *
 * Guardar o acesso em `localStorage` seria mais cômodo e traria a persistência
 * entre recargas de graça. Também deixaria qualquer script injetado na página
 * ler a sessão inteira. O preço da escolha correta é este: ao recarregar a
 * página, o app pede um token novo usando o cookie — e é por isso que a
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
  const acesso = useRef<string | null>(null);

  const perderSessao = useCallback(async () => {
    acesso.current = null;
    setUsuario(null);
  }, []);

  const cliente = useMemo(() => {
    if (clienteDeTeste) return clienteDeTeste;

    return criarCliente({
      baseUrl: URL_DA_API,
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
          headers: { 'content-type': 'application/json', 'x-plataforma': 'web' },
        });

        if (!resposta.ok) return null;

        const dados = (await resposta.json()) as { acesso: string };
        // A renovação fica vazia de propósito: ela não passa por aqui.
        return { acesso: dados.acesso, renovacao: '' };
      },
    });
  }, [clienteDeTeste, perderSessao]);

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
    () => ({ usuario, cliente, entrar, sair }),
    [usuario, cliente, entrar, sair],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('useSessao precisa estar dentro de ProvedorDeSessao.');
  return contexto;
}
