import { randomUUID } from 'node:crypto';
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

    /*
     * Histórico de estudo, e não uma base zerada.
     *
     * Quem clona o repositório e roda vê o produto com vida, e não seis telas
     * vazias explicando o que apareceria se alguém usasse. O estado vazio é a
     * primeira impressão de todo mundo, e uma base sem dado nenhum esconde
     * justamente o que o projeto faz.
     *
     * Os dias são contados para trás a partir de hoje, então a sequência de
     * estudo e a frequência ficam corretas em qualquer data que se rode.
     */
    const cartoes = await transacao<{ id: string; ordem: number }[]>`
      SELECT id, ordem FROM cartoes WHERE baralho_id = ${baralho!.id} ORDER BY ordem
    `;

    const hoje = new Date();
    const diaAtras = (dias: number) => {
      const data = new Date(hoje);
      data.setUTCDate(data.getUTCDate() - dias);
      return data.toISOString().slice(0, 10);
    };

    // Seis dias seguidos de estudo: a ofensiva aparece, e o ranking tem valor.
    for (let dias = 5; dias >= 0; dias -= 1) {
      const doDia = cartoes.slice((5 - dias) * 4, (5 - dias) * 4 + 4);

      for (const cartao of doDia) {
        await transacao`
          INSERT INTO revisoes ${transacao({
            aluno_id: aluna!.id,
            cartao_id: cartao.id,
            avaliacao: 'bom',
            dia: diaAtras(dias),
            intervalo_anterior: 0,
            intervalo_novo: 3,
            lote_id: randomUUID(),
          })}
        `;
      }

      await transacao`
        INSERT INTO pontos_por_dia ${transacao({
          aluno_id: aluna!.id,
          turma_id: turma!.id,
          dia: diaAtras(dias),
          xp: 40,
        })}
        ON CONFLICT (aluno_id, turma_id, dia) DO UPDATE SET xp = EXCLUDED.xp
      `;
    }

    // Quatro palavras travadas: é o que o painel do professor existe para
    // mostrar, e sem elas a tela principal dele nasce vazia.
    for (const cartao of cartoes.slice(0, 4)) {
      await transacao`
        INSERT INTO agendamentos ${transacao({
          aluno_id: aluna!.id,
          cartao_id: cartao.id,
          intervalo_dias: 1,
          facilidade: 1.3,
          repeticoes: 0,
          lapsos: 4 + (cartao.ordem % 3),
          vence_em: diaAtras(0),
          sinalizado: true,
        })}
        ON CONFLICT (aluno_id, cartao_id) DO UPDATE SET
          sinalizado = true, lapsos = EXCLUDED.lapsos
      `;
    }

    // Um punhado em dia, para o progresso não parecer que ela só erra.
    for (const cartao of cartoes.slice(4, 16)) {
      await transacao`
        INSERT INTO agendamentos ${transacao({
          aluno_id: aluna!.id,
          cartao_id: cartao.id,
          intervalo_dias: 8,
          facilidade: 2.5,
          repeticoes: 3,
          lapsos: 0,
          vence_em: diaAtras(-5),
          sinalizado: false,
        })}
        ON CONFLICT (aluno_id, cartao_id) DO NOTHING
      `;
    }

    // Duas aulas registradas, com presença e dever.
    for (const [dias, conteudo, dever] of [
      [
        7,
        'Past simple: verbos regulares e os irregulares mais comuns.',
        'Exercícios 4 a 9, página 32.',
      ],
      [
        2,
        'Phrasal verbs do dia a dia: look for, give up, run out of.',
        'Escrever cinco frases usando os verbos da aula.',
      ],
    ] as [number, string, string][]) {
      const [aula] = await transacao<{ id: string }[]>`
        INSERT INTO aulas ${transacao({
          turma_id: turma!.id,
          dia: diaAtras(dias),
          conteudo,
          dever,
          encontro: null,
        })}
        RETURNING id
      `;

      await transacao`
        INSERT INTO presencas ${transacao({
          aula_id: aula!.id,
          aluno_id: aluna!.id,
          situacao: dias === 7 ? 'presente' : 'justificada',
        })}
      `;
    }

    // Um tema de redação com entrega e parecer, para as duas telas terem o quê
    // mostrar sem depender de alguém escrever na hora.
    const [tema] = await transacao<{ id: string }[]>`
      INSERT INTO temas_de_redacao ${transacao({
        turma_id: turma!.id,
        titulo: 'Um dia inesquecível',
        enunciado: 'Descreva um dia que você não esquece. Use o passado.',
        nivel: 'B1',
      })}
      RETURNING id
    `;

    const TEXTO_DA_ALUNA = [
      'Last year I traveled to Salvador with my family.',
      'We arrived early in the morning and the weather was perfect.',
      'I am agree that the beaches there are the best in Brazil.',
      'We ate acarajé every day and my father made a question to a local woman',
      'about the recipe. She laughed and told us the secret is the palm oil.',
      'It was actually the best trip of my life.',
    ].join(' ');

    await transacao`
      INSERT INTO redacoes ${transacao({
        tema_id: tema!.id,
        aluno_id: aluna!.id,
        texto: TEXTO_DA_ALUNA,
        palavras: TEXTO_DA_ALUNA.split(/\s+/).length,
        analise: null,
        provedor: null,
        analisada_em: null,
      })}
    `;

    console.warn('');
    console.warn('  Turma criada com', VOCABULARIO.length, 'cartas.');
    console.warn('  Nivelamento com', PERGUNTAS.length, 'perguntas.');
    console.warn('');
    console.warn('  Aluna:      marina@escola.com.br');
    console.warn('  Professora: helena@escola.com.br');
    console.warn('  Senha:      ', SENHA);
    console.warn('  Turma:      ', turma!.id);
    console.warn('');
    console.warn('  A aluna já tem 6 dias de estudo, 4 palavras travadas,');
    console.warn('  2 aulas registradas e uma redação entregue.');
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
