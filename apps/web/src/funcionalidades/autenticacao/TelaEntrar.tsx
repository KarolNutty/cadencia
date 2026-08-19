import { useState } from 'react';
import { FalhaDaApi, SemRede } from '@cadencia/cliente-api';
import { useSessao } from '@/provedores/sessao';

/**
 * Entrada e cadastro na mesma tela, com o painel que desliza.
 *
 * A troca entre os dois é uma transformação de um painel colorido, e não uma
 * navegação: quem errou de formulário volta com um clique, sem perder o que
 * digitou no outro lado. Os dois formulários existem ao mesmo tempo no DOM, e é
 * o painel que se move sobre eles.
 *
 * O cadastro é só para **aluno**. Professor é criado pela escola, e o papel
 * nunca vem do formulário, senão qualquer pessoa se declararia professor e
 * veria a turma inteira.
 */
export function TelaEntrar() {
  const { entrar, cadastrar } = useSessao();
  const [criando, setCriando] = useState(false);

  return (
    <div className="portal">
      <div className={`portal__caixa${criando ? ' portal__caixa--criando' : ''}`}>
        <div className="portal__forma portal__forma--entrar">
          <FormaDeEntrar aoEntrar={entrar} />
        </div>

        <div className="portal__forma portal__forma--criar">
          <FormaDeCadastro aoCadastrar={cadastrar} />
        </div>

        {/* O painel que desliza. Em tela estreita ele some e vira um botão de
            texto: cobrir metade de um celular deixaria o formulário sem espaço. */}
        <div className="portal__capa">
          <div className="portal__capa-interna">
            <div className="portal__lado portal__lado--esquerdo">
              <h2 className="portal__titulo">Já estuda aqui?</h2>
              <p className="portal__texto">
                Entre para ver o que vence hoje e continuar de onde parou.
              </p>
              <button className="botao botao--vazado" onClick={() => setCriando(false)}>
                Entrar
              </button>
            </div>

            <div className="portal__lado portal__lado--direito">
              <h2 className="portal__titulo">Primeira vez?</h2>
              <p className="portal__texto">
                Crie sua conta com o e-mail que a escola usou para te convidar, você entra
                na turma na hora.
              </p>
              <button className="botao botao--vazado" onClick={() => setCriando(true)}>
                Criar conta
              </button>
            </div>
          </div>
        </div>
      </div>

      <button className="portal__troca" onClick={() => setCriando((estava) => !estava)}>
        {criando ? 'Já tenho conta' : 'Criar uma conta'}
      </button>
    </div>
  );
}

function mensagemDoErro(causa: unknown): string {
  if (causa instanceof SemRede) return 'Sem conexão com o servidor.';
  if (causa instanceof FalhaDaApi) return causa.corpo.mensagem;
  return 'Algo deu errado. Tente de novo.';
}

function FormaDeEntrar({
  aoEntrar,
}: {
  aoEntrar: (email: string, senha: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    try {
      await aoEntrar(email.trim(), senha);
    } catch (causa) {
      setErro(mensagemDoErro(causa));
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <h1 className="portal__marca">Cadência</h1>
      <p className="portal__abertura">Entre na sua conta</p>

      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
      <Campo rotulo="Senha" tipo="password" valor={senha} aoMudar={setSenha} />

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <button
        className="botao"
        type="submit"
        disabled={ocupado || email.trim().length < 4 || senha.length < 8}
      >
        {ocupado ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

function FormaDeCadastro({
  aoCadastrar,
}: {
  aoCadastrar: (nome: string, email: string, senha: string) => Promise<number>;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const curta = senha.length > 0 && senha.length < 12;

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);

    try {
      await aoCadastrar(nome.trim(), email.trim(), senha);
    } catch (causa) {
      setErro(mensagemDoErro(causa));
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      <h1 className="portal__marca">Cadência</h1>
      <p className="portal__abertura">Crie sua conta</p>

      <Campo rotulo="Nome" tipo="text" valor={nome} aoMudar={setNome} />
      <Campo rotulo="E-mail" tipo="email" valor={email} aoMudar={setEmail} />
      <Campo
        rotulo="Senha"
        tipo="new-password"
        valor={senha}
        aoMudar={setSenha}
        apoio={
          curta
            ? `Faltam ${12 - senha.length} caracteres`
            : 'Doze caracteres ou mais. Uma frase funciona bem.'
        }
      />

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <button
        className="botao"
        type="submit"
        disabled={
          ocupado || nome.trim().length < 2 || !email.includes('@') || senha.length < 12
        }
      >
        {ocupado ? 'Criando…' : 'Criar conta'}
      </button>
    </form>
  );
}

function Campo({
  rotulo,
  tipo,
  valor,
  aoMudar,
  apoio,
}: {
  rotulo: string;
  tipo: 'email' | 'password' | 'new-password' | 'text';
  valor: string;
  aoMudar: (valor: string) => void;
  apoio?: string;
}) {
  const senha = tipo === 'password' || tipo === 'new-password';

  return (
    <label className="campo">
      <span className="campo__rotulo">{rotulo}</span>
      <input
        className="campo__entrada"
        type={senha ? 'password' : tipo}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        // Liga o gerenciador de senhas do sistema. Sem isso, quem usa senha
        // longa e única, que é o que a política do servidor incentiva, // precisa digitar tudo à mão.
        autoComplete={
          tipo === 'email'
            ? 'email'
            : tipo === 'new-password'
              ? 'new-password'
              : tipo === 'password'
                ? 'current-password'
                : 'name'
        }
      />
      {apoio && <span className="campo__apoio">{apoio}</span>}
    </label>
  );
}
