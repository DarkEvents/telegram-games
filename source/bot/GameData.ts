import TicTacToeGame from "./tictactoe/TicTacToeGame";
import OthelloGame from "./othello/OthelloGame";

export interface GameData {
	board: number[][];
	challenged: number;
	challenger: number;
	message: number;
	round: number;
}

export const validClassNames = ['tris', 'othello'] as const;
export type ValidClassName = typeof validClassNames[number];

// Mappa dei nomi delle classi
export const classMap: { [key in ValidClassName]: any } = {
  tris: TicTacToeGame,
	othello: OthelloGame,
//   othello: OthelloGame
};

export function createInstance(className: keyof typeof classMap) {
  const ContextClass = classMap[className];

  if (ContextClass) {
    return ContextClass;
  }

  throw new Error(`Classe non trovata per il nome: ${className}`);
}
