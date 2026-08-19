import { useTema, type Preferencia } from '@/provedores/tema';

/**
 * A troca de tema.
 *
 * Três estados, e não um interruptor de dois. Um interruptor obrigaria a
 * escolher entre claro e escuro para sempre, e quem quer que o aplicativo
 * acompanhe o sistema perderia essa opção depois do primeiro toque.
 */
const OPCOES: { valor: Preferencia; rotulo: string; simbolo: string }[] = [
  { valor: 'claro', rotulo: 'Tema claro', simbolo: '☀' },
  { valor: 'escuro', rotulo: 'Tema escuro', simbolo: '☾' },
  { valor: 'sistema', rotulo: 'Seguir o sistema', simbolo: '⌘' },
];

export function BotaoDeTema() {
  const { preferencia, escolher } = useTema();

  return (
    <div className="tema" role="group" aria-label="Tema">
      {OPCOES.map((opcao) => (
        <button
          key={opcao.valor}
          className={`tema__opcao${preferencia === opcao.valor ? ' tema__opcao--ativa' : ''}`}
          onClick={() => escolher(opcao.valor)}
          aria-pressed={preferencia === opcao.valor}
          // O símbolo sozinho não diz nada para o leitor de tela.
          aria-label={opcao.rotulo}
          title={opcao.rotulo}
        >
          <span aria-hidden>{opcao.simbolo}</span>
        </button>
      ))}
    </div>
  );
}
