import { carregarAmbiente, carregarArquivoDeAmbiente } from '@cadencia/config';
import { criarHashDeSenha } from '../funcionalidades/autenticacao/senha';
import { conectar, type Banco } from './banco';

/**
 * Popula o banco com uma turma de verdade, para desenvolvimento.
 *
 * O conteúdo é vocabulário real de inglês inicial, e não `palavra 1 / palavra
 * 2`. A diferença não é estética: com conteúdo de mentira ninguém percebe que a
 * palavra longa quebra a linha, que a dica ajuda ou atrapalha, nem que quarenta
 * cartas numa sessão são cansativas. Dado falso esconde exatamente os problemas
 * que a tela existe para revelar.
 */

interface Palavra {
  frente: string;
  verso: string;
  dica?: string;
}

const VOCABULARIO: Palavra[] = [
  { frente: 'to gather', verso: 'reunir, juntar', dica: 'usado para pessoas e coisas' },
  { frente: 'though', verso: 'embora, no entanto', dica: 'parece "through", mas não é' },
  { frente: 'to afford', verso: 'ter condições de pagar' },
  { frente: 'awkward', verso: 'constrangedor, sem jeito' },
  { frente: 'to bother', verso: 'incomodar, dar-se ao trabalho' },
  { frente: 'meanwhile', verso: 'enquanto isso' },
  { frente: 'to reckon', verso: 'achar, calcular', dica: 'comum no inglês britânico' },
  { frente: 'straightforward', verso: 'direto, simples' },
  { frente: 'to overcome', verso: 'superar' },
  { frente: 'reliable', verso: 'confiável' },
  { frente: 'to look forward to', verso: 'ansiar por', dica: 'sempre com verbo em -ing' },
  { frente: 'chore', verso: 'tarefa doméstica' },
  { frente: 'to complain', verso: 'reclamar' },
  { frente: 'worth it', verso: 'valer a pena' },
  { frente: 'to catch up', verso: 'colocar o assunto em dia' },
  { frente: 'harsh', verso: 'severo, áspero' },
  { frente: 'to make up for', verso: 'compensar' },
  { frente: 'nevertheless', verso: 'ainda assim' },
  { frente: 'to be about to', verso: 'estar prestes a' },
  { frente: 'shallow', verso: 'raso, superficial' },
  { frente: 'to keep track of', verso: 'acompanhar, controlar' },
  { frente: 'stubborn', verso: 'teimoso' },
  { frente: 'to figure out', verso: 'descobrir, entender' },
  { frente: 'thorough', verso: 'minucioso', dica: 'mais uma da família de "though"' },
  { frente: 'to rely on', verso: 'depender de, contar com' },
  { frente: 'spare', verso: 'de reserva, sobressalente' },
  { frente: 'to point out', verso: 'apontar, destacar' },
  { frente: 'blunt', verso: 'sem rodeios, direto demais' },
  { frente: 'to keep up with', verso: 'acompanhar o ritmo de' },
  { frente: 'handy', verso: 'útil, à mão' },
  { frente: 'to come across', verso: 'topar com, encontrar por acaso' },
  { frente: 'willing', verso: 'disposto a' },
  { frente: 'to give up', verso: 'desistir' },
  { frente: 'tricky', verso: 'complicado, capcioso' },
  { frente: 'to take over', verso: 'assumir o controle' },
  { frente: 'eager', verso: 'ansioso, entusiasmado' },
  { frente: 'to run out of', verso: 'ficar sem' },
  { frente: 'ashamed', verso: 'envergonhado' },
  {
    frente: 'to work out',
    verso: 'dar certo; treinar',
    dica: 'dois sentidos bem diferentes',
  },
  { frente: 'unless', verso: 'a menos que' },
  { frente: 'to sort out', verso: 'resolver, organizar' },
  { frente: 'aware', verso: 'ciente' },
  { frente: 'to hang out', verso: 'passar um tempo com alguém' },
  { frente: 'clumsy', verso: 'desastrado' },
  { frente: 'to show up', verso: 'aparecer, comparecer' },
  { frente: 'regardless', verso: 'independentemente' },
  { frente: 'to get rid of', verso: 'se livrar de' },
  { frente: 'thrilled', verso: 'empolgadíssimo' },
];

const SENHA = 'estudar-todo-dia-2026';

/**
 * Perguntas do teste de nivelamento, duas por nível.
 *
 * O conteúdo é real: cada uma testa algo característico do seu nível. Um banco
 * de perguntas genéricas faria o teste convergir para o lugar errado, e o
 * defeito só apareceria com aluno de verdade.
 */
const PERGUNTAS: {
  nivel: string;
  enunciado: string;
  alternativas: string[];
  correta: number;
}[] = [
  {
    nivel: 'A1',
    enunciado: 'She ___ a teacher.',
    alternativas: ['is', 'are', 'am', 'be'],
    correta: 0,
  },
  {
    nivel: 'A1',
    enunciado: 'Qual é a tradução de "book"?',
    alternativas: ['mesa', 'livro', 'porta', 'janela'],
    correta: 1,
  },
  {
    nivel: 'A2',
    enunciado: 'I ___ to the beach last weekend.',
    alternativas: ['go', 'goes', 'went', 'gone'],
    correta: 2,
  },
  {
    nivel: 'A2',
    enunciado: 'There ___ many people at the party.',
    alternativas: ['was', 'were', 'is', 'has'],
    correta: 1,
  },
  {
    nivel: 'B1',
    enunciado: 'If it rains tomorrow, we ___ the trip.',
    alternativas: ['cancel', 'will cancel', 'cancelled', 'would cancel'],
    correta: 1,
  },
  {
    nivel: 'B1',
    enunciado: 'She has lived here ___ 2015.',
    alternativas: ['for', 'since', 'from', 'during'],
    correta: 1,
  },
  {
    nivel: 'B2',
    enunciado: 'I wish I ___ more time to study.',
    alternativas: ['have', 'had', 'will have', 'am having'],
    correta: 1,
  },
  {
    nivel: 'B2',
    enunciado: 'O que significa "to put up with"?',
    alternativas: ['hospedar', 'tolerar', 'levantar', 'construir'],
    correta: 1,
  },
  {
    nivel: 'C1',
    enunciado: 'Had I known about the delay, I ___ earlier.',
    alternativas: ['would leave', 'had left', 'would have left', 'left'],
    correta: 2,
  },
  {
    nivel: 'C1',
    enunciado: 'O que "a blessing in disguise" quer dizer?',
    alternativas: [
      'uma bênção esperada',
      'algo ruim que acaba sendo bom',
      'um disfarce',
      'uma oração',
    ],
    correta: 1,
  },
  {
    nivel: 'C2',
    enunciado: 'Scarcely ___ the door when the phone rang.',
    alternativas: ['I had opened', 'had I opened', 'I opened', 'did I open'],
    correta: 1,
  },
  {
    nivel: 'C2',
    enunciado: 'O que significa "to hedge one\'s bets"?',
    alternativas: [
      'apostar tudo numa opção',
      'reduzir o risco apoiando mais de uma opção',
      'desistir de apostar',
      'aumentar a aposta',
    ],
    correta: 1,
  },
];

async function semear(sql: Banco): Promise<void> {
  // Semear é destrutivo e roda por engano quando alguém sobe com a variável
  // errada. A checagem no nome é a mesma da recriação para testes.
  const senhaHash = await criarHashDeSenha(SENHA);

  await sql.begin(async (transacao) => {
    const [professor] = await transacao<{ id: string }[]>`
      INSERT INTO usuarios ${transacao({
        nome: 'Helena Prado',
        email: 'helena@escola.com.br',
        senha_hash: senhaHash,
        papel: 'professor',
        fuso: 'America/Sao_Paulo',
      })}
      ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id
    `;

    const [aluna] = await transacao<{ id: string }[]>`
      INSERT INTO usuarios ${transacao({
        nome: 'Marina Costa',
        email: 'marina@escola.com.br',
        senha_hash: senhaHash,
        papel: 'aluno',
        fuso: 'America/Sao_Paulo',
      })}
      ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id
    `;

    const [turma] = await transacao<{ id: string }[]>`
      INSERT INTO turmas ${transacao({
        nome: 'Inglês · Intermediário 2',
        idioma: 'ingles',
        professor_id: professor!.id,
      })}
      RETURNING id
    `;

    await transacao`
      INSERT INTO matriculas ${transacao({ turma_id: turma!.id, aluno_id: aluna!.id })}
      ON CONFLICT DO NOTHING
    `;

    const [baralho] = await transacao<{ id: string }[]>`
      INSERT INTO baralhos ${transacao({
        turma_id: turma!.id,
        titulo: 'Palavras que aparecem toda hora',
      })}
      RETURNING id
    `;

    for (const palavra of VOCABULARIO) {
      await transacao`
        INSERT INTO cartoes ${transacao({
          baralho_id: baralho!.id,
          frente: palavra.frente,
          verso: palavra.verso,
          dica: palavra.dica ?? null,
        })}
      `;
    }

    for (const pergunta of PERGUNTAS) {
      await transacao`
        INSERT INTO perguntas_de_nivelamento ${transacao({
          idioma: 'ingles',
          nivel: pergunta.nivel,
          enunciado: pergunta.enunciado,
          alternativas: pergunta.alternativas,
          correta: pergunta.correta,
        })}
      `;
    }

    console.warn('');
    console.warn('  Turma criada com', VOCABULARIO.length, 'cartas.');
    console.warn('  Nivelamento com', PERGUNTAS.length, 'perguntas.');
    console.warn('');
    console.warn('  Aluna:      marina@escola.com.br');
    console.warn('  Professora: helena@escola.com.br');
    console.warn('  Senha:      ', SENHA);
    console.warn('  Turma:      ', turma!.id);
    console.warn('');
    console.warn('  Entre no app com a aluna: o próprio app descobre a turma.');
    console.warn('');
  });
}

async function principal(): Promise<void> {
  carregarArquivoDeAmbiente();
  const ambiente = carregarAmbiente();

  if (ambiente.producao) {
    throw new Error('Semear não roda em produção. Isto cria usuários com senha conhecida.');
  }

  const sql = conectar({ url: ambiente.DATABASE_URL, maximoDeConexoes: 1 });

  try {
    await semear(sql);
  } finally {
    await sql.end();
  }
}

principal().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
