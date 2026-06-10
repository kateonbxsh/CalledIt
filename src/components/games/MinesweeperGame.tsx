import { useState, useMemo, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

type BoardSize = 3 | 5;

interface Cell {
  id: string;
  isBomb: boolean;
  revealed: boolean;
  flagged: boolean;
  index: number;
}

export function MinesweeperGame({ onGameEnd }: { onGameEnd: (won: boolean, score: number) => void }) {
  const [size, setSize] = useState<BoardSize>(3);
  const [gameStarted, setGameStarted] = useState(false);
  const [board, setBoard] = useState<Cell[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const totalNonBombs = useMemo(() => {
    const total = size * size;
    const bombs = size === 3 ? 2 : 6;
    return total - bombs;
  }, [size]);

  // Initialize board
  useEffect(() => {
    if (!gameStarted) return;

    const total = size * size;
    const bombs = size === 3 ? 2 : 6;
    const cells: Cell[] = Array.from({ length: total }, (_, i) => ({
      id: `${i}`,
      isBomb: i < bombs,
      revealed: false,
      flagged: false,
      index: i,
    }));

    // Shuffle
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    setBoard(cells);
    setGameOver(false);
    setWon(false);
  }, [gameStarted, size]);

  const revealedNonBombs = useMemo(() => board.filter((c) => c.revealed && !c.isBomb).length, [board]);
  const isWon = revealedNonBombs === totalNonBombs && revealedNonBombs > 0;

  useEffect(() => {
    if (isWon && gameStarted && !gameOver) {
      setWon(true);
      setGameOver(true);
      onGameEnd(true, totalNonBombs * (size === 3 ? 5 : 8));
    }
  }, [isWon, gameStarted, gameOver, totalNonBombs, size, onGameEnd]);

  function playSound(type: 'click' | 'win' | 'bomb') {
    if (!soundEnabled) return;
    // Visual feedback instead of actual sound in this environment
    if (type === 'click') {
      // Short haptic pulse
    } else if (type === 'win') {
      // Success haptic
    } else {
      // Error haptic
    }
  }

  function handleCellClick(id: string) {
    if (gameOver || won || !gameStarted) return;

    const cellIndex = board.findIndex((c) => c.id === id);
    if (cellIndex === -1) return;

    const cell = board[cellIndex];
    if (cell.revealed || cell.flagged) return;

    playSound('click');

    const newBoard = [...board];
    const clickedCell = newBoard[cellIndex];
    clickedCell.revealed = true;

    if (clickedCell.isBomb) {
      // Game over - reveal all bombs
      newBoard.forEach((c) => {
        if (c.isBomb) c.revealed = true;
      });
      playSound('bomb');
      setBoard(newBoard);
      setGameOver(true);
      onGameEnd(false, revealedNonBombs * (size === 3 ? 5 : 8));
    } else {
      // Check win condition
      const newRevealedNonBombs = newBoard.filter((c) => c.revealed && !c.isBomb).length;
      if (newRevealedNonBombs === totalNonBombs) {
        playSound('win');
        setWon(true);
        setGameOver(true);
        onGameEnd(true, totalNonBombs * (size === 3 ? 5 : 8));
      }
      setBoard(newBoard);
    }
  }

  const score = revealedNonBombs * (size === 3 ? 5 : 8);
  const cellSize = size === 3 ? 80 : 50;
  const gridGap = 8;

  return (
    <div className="w-full max-w-full space-y-4">
      {!gameStarted ? (
        <div className="text-center space-y-4">
          <div className="text-5xl">💣</div>
          <h3 className="text-xl font-black">Minesweeper</h3>
          <p className="text-sm text-ink/60 max-w-xs">
            Click all safe cards without hitting a bomb. Earn more coins for larger grids!
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setSize(3);
                setGameStarted(true);
              }}
              className="rounded-xl bg-mint/12 px-6 py-3 text-sm font-bold text-mint hover:bg-mint/20 transition"
            >
              3×3 Easy (4 coins)
            </button>
            <button
              onClick={() => {
                setSize(5);
                setGameStarted(true);
              }}
              className="rounded-xl bg-coral/12 px-6 py-3 text-sm font-bold text-coral hover:bg-coral/20 transition"
            >
              5×5 Hard (8 coins)
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Game header */}
          <div className="flex items-center justify-between px-2">
            <div className="text-sm font-black text-ink/60">
              Found: <span className="text-ink">{revealedNonBombs}/{totalNonBombs}</span>
            </div>
            <div className="text-sm font-black text-citrus">
              💰 {score} coins
            </div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="text-ink/40 hover:text-ink transition"
              title="Toggle sound"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Game board */}
          <div className="flex justify-center">
            <div
              className="gap-2 rounded-2xl border-2 border-line bg-white p-3 shadow-soft"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
                rowGap: `${gridGap}px`,
                columnGap: `${gridGap}px`,
              }}
            >
              {board.map((cell) => (
                <button
                  key={cell.id}
                  onClick={() => handleCellClick(cell.id)}
                  className={`
                    relative overflow-hidden rounded-lg font-bold transition-all duration-200
                    ${
                      cell.revealed
                        ? cell.isBomb
                          ? 'bg-coral shadow-soft scale-95 animate-shake'
                          : 'bg-gradient-to-br from-mint to-mint/80 text-white shadow-soft'
                        : 'bg-gradient-to-br from-white to-field border-2 border-line hover:border-ink/30 hover:shadow-soft cursor-pointer active:scale-95'
                    }
                  `}
                  style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                  disabled={gameOver}
                >
                  {cell.revealed && (
                    <span className="text-3xl">
                      {cell.isBomb ? '💣' : '✓'}
                    </span>
                  )}
                  {!cell.revealed && cell.flagged && (
                    <span className="text-xl">🚩</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Game over state */}
          {gameOver && (
            <div className="text-center space-y-4 animate-reward-pop">
              <div
                className={`text-4xl transition-all ${
                  won ? 'text-mint animate-bounce' : 'text-coral'
                }`}
              >
                {won ? '🎉' : '💥'}
              </div>
              <div>
                <p className={`font-black text-lg ${won ? 'text-mint' : 'text-coral'}`}>
                  {won ? 'All bombs avoided!' : 'Hit a bomb!'}
                </p>
                <p className="text-sm text-ink/60">
                  Final score: {score} coins
                </p>
              </div>
              <button
                onClick={() => {
                  setGameStarted(false);
                  setBoard([]);
                  setSize(3);
                }}
                className="mx-auto rounded-xl bg-ink px-6 py-2 text-sm font-bold text-white transition hover:shadow-soft"
              >
                Play again
              </button>
            </div>
          )}

          {/* Instructions */}
          {!gameOver && (
            <div className="text-center text-xs text-ink/40">
              Click to reveal • Right-click to flag (helper only)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
