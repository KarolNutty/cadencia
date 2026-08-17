import { View } from 'react-native';
import { cores } from '../compartilhado/tema';

/**
 * O progresso da sessão, marcado em batidas.
 *
 * Uma barra contínua diz "falta mais ou menos isso". As batidas dizem
 * exatamente quantas cartas faltam, e quem estuda conta os traços do jeito que
 * se marca compasso.
 *
 * As marcas têm **largura fixa e são mais altas que largas**. Distribuí-las com
 * `flex: 1` parecia razoável e produzia o contrário: com vinte cartas numa tela
 * de celular, cada marca virava um tracinho horizontal, e o conjunto lia como
 * linha pontilhada. Marca de compasso é vertical — se ela for mais larga que
 * alta, deixa de ser marca.
 */
const LARGURA_DA_MARCA = 3;
const ALTURA_FEITA = 16;
const ALTURA_PENDENTE = 7;

/** Acima disto as marcas ficariam grudadas, e a régua vira barra. */
const MAXIMO_DE_MARCAS = 28;

export function Batidas({ feitas, total }: { feitas: number; total: number }) {
  if (total > MAXIMO_DE_MARCAS) {
    return (
      <View
        style={{
          height: 4,
          backgroundColor: cores.linhaEscura,
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 4,
            width: `${Math.round((feitas / Math.max(total, 1)) * 100)}%`,
            backgroundColor: cores.textoClaro,
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        height: ALTURA_FEITA,
      }}
      // O leitor de tela anuncia o progresso de uma vez, em vez de ler vinte
      // retângulos sem rótulo.
      accessibilityRole="progressbar"
      accessibilityLabel={`${feitas} de ${total} cartas`}
    >
      {Array.from({ length: total }, (_, indice) => {
        const concluida = indice < feitas;

        return (
          <View
            key={indice}
            style={{
              width: LARGURA_DA_MARCA,
              height: concluida ? ALTURA_FEITA : ALTURA_PENDENTE,
              borderRadius: LARGURA_DA_MARCA / 2,
              backgroundColor: concluida ? cores.textoClaro : cores.linhaEscura,
            }}
          />
        );
      })}
    </View>
  );
}
