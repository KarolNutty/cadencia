/**
 * Um dia de estudo, no formato `AAAA-MM-DD`.
 *
 * **Não é a data do relógio, é a data do negócio.** Os dois quase sempre
 * coincidem, e é justamente por isso que a diferença passa despercebida até
 * quebrar.
 */
export type DiaDeEstudo = string & { readonly __marca: 'DiaDeEstudo' };

/**
 * Hora em que o dia de estudo vira.
 *
 * Quem senta para estudar à uma da manhã ainda está no dia de ontem, para ele,
 * o dia não acabou. Se o corte fosse à meia-noite, esse aluno perderia a
 * sequência **por estar estudando**, que é o pior incentivo possível.
 *
 * Quatro da manhã é onde praticamente ninguém está acordado por vontade própria.
 */
export const HORA_DE_VIRADA = 4;

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function ehDiaDeEstudo(valor: string): valor is DiaDeEstudo {
  if (!FORMATO_DATA.test(valor)) return false;

  // O formato não basta: "2026-02-31" passa no regex e não existe no calendário.
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

export function diaDeEstudo(valor: string): DiaDeEstudo {
  if (!ehDiaDeEstudo(valor)) {
    throw new RangeError(`"${valor}" não é um dia de estudo válido (use AAAA-MM-DD).`);
  }
  return valor;
}

interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
}

/**
 * Quebra um instante nas partes de calendário do fuso informado.
 *
 * Usa `Intl` em vez de aritmética com deslocamento porque horário de verão não
 * é um número fixo: entre 2018 e 2019 o Brasil mudou o próprio calendário dele.
 * A tabela de fusos do sistema sabe disso; uma conta de `-3` não sabe.
 */
function partesNoFuso(instante: Date, fuso: string): PartesLocais {
  const formatador = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    // h23 evita o "24" que alguns ambientes devolvem para a meia-noite.
    hourCycle: 'h23',
  });

  const partes = Object.fromEntries(
    formatador.formatToParts(instante).map((parte) => [parte.type, parte.value]),
  ) as Record<string, string>;

  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
  };
}

function formatar(ano: number, mes: number, dia: number): DiaDeEstudo {
  const texto = new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
  return texto as DiaDeEstudo;
}

/**
 * A que dia de estudo pertence este instante, para um aluno neste fuso.
 *
 * Antes das 4h, ainda é o dia anterior.
 */
export function diaDeEstudoDe(instante: Date, fuso: string): DiaDeEstudo {
  const { ano, mes, dia, hora } = partesNoFuso(instante, fuso);
  return hora < HORA_DE_VIRADA
    ? formatar(ano, mes, dia - 1) // Date.UTC normaliza dia 0 para o mês anterior
    : formatar(ano, mes, dia);
}

export function somarDias(dia: DiaDeEstudo, quantidade: number): DiaDeEstudo {
  const base = new Date(`${dia}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + quantidade);
  return base.toISOString().slice(0, 10) as DiaDeEstudo;
}

export function diasEntre(inicio: DiaDeEstudo, fim: DiaDeEstudo): number {
  const a = Date.parse(`${inicio}T00:00:00.000Z`);
  const b = Date.parse(`${fim}T00:00:00.000Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Comparação de dia de estudo é comparação de texto, porque o formato é ordenável. */
export function ehAnteriorOuIgual(a: DiaDeEstudo, b: DiaDeEstudo): boolean {
  return a <= b;
}
