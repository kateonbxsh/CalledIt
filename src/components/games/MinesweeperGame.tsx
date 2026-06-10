import { useState, useMemo } from 'react';

type BoardSize = 3 | 5;

interface Cell {
  id: string;
  isBomb: boolean;
  revealed: boolean;
  flagged: boolean;
}

export function MinesweeperGame({ onGameEnd, initialSize = 3 }: { onGameEnd: (won: boolean, score: number) => void; initialSize?: BoardSize }) {
  const [size, setSize] = useState<BoardSize>(initialSize);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const { board, totalNonBombs } = useMemo(() => {
    const bombCount = size === 3 ? 2 : 6;
    const totalCells = size * size;
    const nonBombCount = totalCells - bombCount;
    const cells: Cell[] = Array.from({ length: totalCells }, (_, i) => ({
      id: `${i}`,
      isBomb: i < bombCount,
      revealed: false,
      flagged: false,
    }));
    // Shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return { board: cells, totalNonBombs: nonBombCount };
  }, [size, gameStarted]);

  const revealedNonBombs = useMemo(() => board.filter((c) => c.revealed && !c.isBomb).length, [board]);
  const isWon = revealedNonBombs === totalNonBombs;

  function handleCellClick(id: string) {
    if (gameOver || won || !gameStarted) return;

    const cell = board.find((c) => c.id === id);
    if (!cell || cell.revealed || cell.flagged) return;

    const newBoard = board.map((c) => (c.id === id ? { ...c, revealed: true } : c));

    if (cell.isBomb) {
      // Game over - reveal all bombs
      const allRevealed = newBoard.map((c) => (c.isBomb ? { ...c, revealed: true } : c));
      setGameOver(true);
      onGameEnd(false, revealedNonBombs * 5);
      return;
    }

    // Check win condition
    const newRevealedNonBombs = newBoard.filter((c) => c.revealed && !c.isBomb).length;
    if (newRevealedNonBombs === totalNonBombs) {
      setWon(true);
      setGameOver(true);
      onGameEnd(true, totalNonBombs * 5);
    }
  }

  function handleRightClick(e: React.MouseEvent, id: string) {
    e.preventDefault();
    if (gameOver || won || !gameStarted) return;

    const cell = board.find((c) => c.id === id);
    if (!cell || cell.revealed) return;

    // Flagging doesn't affect game, just visual helper
  }

  const score = revealedNonBombs * 5;

  return (
    <div className="space-y-3">
      {!gameStarted ? (
        <div className="space-y-2">
          <p className="text-sm text-ink/60">Choose a difficulty:</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSize(3);
                setGameStarted(true);
                setGameOver(false);
                setWon(false);
              }}
              className="flex-1 rounded-lg bg-mint/12 px-3 py-2 text-sm font-bold text-mint hover:bg-mint/20"
            >
              3×3 (Easy)
            </button>
            <button
              onClick={() => {
                setSize(5);
                setGameStarted(true);
                setGameOver(false);
                setWon(false);
              }}
              className="flex-1 rounded-lg bg-coral/12 px-3 py-2 text-sm font-bold text-coral hover:bg-coral/20"
            >
              5×5 (Hard)
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-sm font-bold text-ink/60">Score: {score} | Found: {revealedNonBombs}/{totalNonBombs}</div>
          <div
            className="mx-auto w-fit gap-1 rounded-lg border border-line bg-field p-2"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
            }}
          >
            {board.map((cell) => (
              <button
                key={cell.id}
                onClick={() => handleCellClick(cell.id)}
                onContextMenu={(e) => handleRightClick(e, cell.id)}
                className={`h-12 w-12 rounded-md border transition font-bold text-xs ${
                  cell.revealed
                    ? cell.isBomb
                      ? 'bg-coral border-coral text-white'
                      : 'bg-white border-line text-ink'
                    : 'bg-white border-line hover:bg-field cursor-pointer'
                }`}
              >
                {cell.revealed && cell.isBomb && '💣'}
                {cell.revealed && !cell.isBomb && '✓'}
              </button>
            ))}
          </div>
          {gameOver && (
            <div className="space-y-2 text-center">
              <p className={`text-sm font-bold ${won ? 'text-mint' : 'text-coral'}`}>
                {won ? '✓ All safe cards found!' : '✗ Hit a bomb!'}
              </p>
              <p className="text-xs text-ink/60">Final score: {score}</p>
              <button
                onClick={() => {
                  setGameStarted(false);
                  setGameOver(false);
                  setWon(false);
                }}
                className="w-full rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white"
              >
                Play again
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
