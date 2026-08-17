import { useState } from 'react';
import { FalhaDaApi, SemRede } from '@cadencia/cliente-api';
import { cores, fontes } from '../../compartilhado/estilos';
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
      setErro(
        causa instanceof SemRede
          ? 'Sem conexão com o servidor.'
          : causa instanceof FalhaDaApi
            ? causa.corpo.mensagem
            : 'Não foi possível entrar agora.',
      );
      setOcupado(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: cores.fundo,
        padding: 24,
      }}
    >
      {/* Um <form> de verdade: o navegador dá o envio pelo Enter, o
          preenchimento do gerenciador de senhas e a navegação por teclado sem
          nenhuma linha a mais. Trocar por div com onClick joga tudo isso fora. */}
      <form onSubmit={enviar} style={{ width: '100%', maxWidth: 380 }}>
        <h1
          style={{
            fontFamily: fontes.titulo,
            fontSize: 44,
            color: cores.texto,
            margin: 0,
          }}
        >
          Cadência
        </h1>
        <p
          style={{
            fontFamily: fontes.texto,
            color: cores.textoMedio,
            marginTop: 8,
            marginBottom: 32,
          }}
        >
          Painel do professor
        </p>

        <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
        <Campo rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} />

        {erro !== null && (
          <p
            // Anuncia o erro para o leitor de tela assim que ele aparece.
            role="alert"
            style={{ color: cores.erro, fontFamily: fontes.texto, fontSize: 14 }}
          >
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={ocupado || email.trim().length < 4 || senha.length < 8}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '14px 20px',
            fontFamily: fontes.texto,
            fontSize: 15,
            fontWeight: 700,
            color: '#FFFFFF',
            background: cores.marca,
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
          }}
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
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span
        style={{
          display: 'block',
          fontFamily: fontes.texto,
          fontSize: 13,
          color: cores.textoMedio,
          marginBottom: 6,
        }}
      >
        {rotulo}
      </span>
      <input
        type={tipo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        autoComplete={tipo === 'email' ? 'email' : 'current-password'}
        style={{
          width: '100%',
          padding: '12px 14px',
          fontFamily: fontes.texto,
          fontSize: 15,
          color: cores.texto,
          background: cores.superficie,
          border: `1px solid ${cores.linha}`,
          borderRadius: 10,
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}
