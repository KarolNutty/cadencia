import { useState } from 'react';
import { FalhaDaApi, SemRede } from '@cadencia/cliente-api';
import { useSessao } from '../../compartilhado/sessao';

export function TelaEntrar() {
  const { entrar } = useSessao();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    try {
      await entrar(email.trim(), senha);
    } catch (causa) {
      // Falha de rede recebe texto próprio: dizer "e-mail ou senha incorretos"
      // seria mentira, e faria a pessoa tentar outra senha à toa.
      setErro(
        causa instanceof SemRede
          ? 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
          : causa instanceof FalhaDaApi
            ? causa.corpo.mensagem
            : 'Não foi possível entrar agora.',
      );
      setOcupado(false);
    }
  }

  return (
    <main className="entrada">
      {/* Um <form> de verdade: o navegador dá o envio pelo Enter, o
          preenchimento do gerenciador de senhas e a navegação por teclado sem
          nenhuma linha a mais. */}
      <form className="entrada__forma" onSubmit={enviar}>
        <h1 className="entrada__marca">Cadência</h1>
        <p className="entrada__nota">Painel do professor</p>

        <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
        <Campo rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} />

        {erro !== null && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <button
          className="botao"
          type="submit"
          style={{ marginTop: 16 }}
          disabled={ocupado || email.trim().length < 4 || senha.length < 8}
        >
          {ocupado ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}

function Campo({
  rotulo,
  tipo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  tipo: 'email' | 'password';
  valor: string;
  aoMudar: (valor: string) => void;
}) {
  return (
    <label className="campo">
      <span className="campo__rotulo">{rotulo}</span>
      <input
        className="campo__entrada"
        type={tipo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        autoComplete={tipo === 'email' ? 'email' : 'current-password'}
      />
    </label>
  );
}
