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
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set());

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
    setRevealedIndices(new Set());
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
    // Haptic feedback or sound can be added here
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
    setRevealedIndices(new Set([...revealedIndices, cellIndex]));

    if (clickedCell.isBomb) {
      newBoard.forEach((c) => {
        if (c.isBomb) c.revealed = true;
      });
      playSound('bomb');
      setBoard(newBoard);
      setGameOver(true);
      onGameEnd(false, revealedNonBombs * (size === 3 ? 5 : 8));
    } else {
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
  const cellSizeClass = size === 3 ? 'w-20 h-20' : 'w-14 h-14';
  const cellSize = size === 3 ? 80 : 56;

  return (
    <div className="w-full max-w-full space-y-4">
      {!gameStarted ? (
        <div className="text-center space-y-4 p-4">
          <div className="text-6xl animate-bounce">💣</div>
          <h3 className="text-2xl font-black">Minesweeper</h3>
          <p className="text-sm text-ink/60 max-w-sm leading-relaxed">
            Click all the safe cards without hitting a bomb. The larger grid gives bigger rewards!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                setSize(3);
                setGameStarted(true);
              }}
              className="rounded-xl bg-mint/12 px-6 py-3 text-sm font-bold text-mint hover:bg-mint/20 transition active:scale-95"
            >
              3×3 Easy
              <div className="text-xs text-mint/70 mt-0.5">4 coins</div>
            </button>
            <button
              onClick={() => {
                setSize(5);
                setGameStarted(true);
              }}
              className="rounded-xl bg-coral/12 px-6 py-3 text-sm font-bold text-coral hover:bg-coral/20 transition active:scale-95"
            >
              5×5 Hard
              <div className="text-xs text-coral/70 mt-0.5">8 coins</div>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats */}
          <div className="flex items-center justify-between px-2">
            <div className="text-sm font-black">
              Found: <span className="text-mint">{revealedNonBombs}</span>/<span className="text-ink/50">{totalNonBombs}</span>
            </div>
            <div className="text-sm font-black text-citrus">💰 {score}</div>
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="text-ink/40 hover:text-ink transition p-1.5"
              title="Toggle sound"
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>

          {/* Board */}
          <div className="flex justify-center overflow-auto py-2">
            <div
              className="rounded-2xl border-2 border-line bg-white p-4 shadow-soft"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
                gap: `${size === 3 ? 10 : 8}px`,
                width: 'fit-content',
              }}
            >
              {board.map((cell, idx) => {
                const isRevealing = revealedIndices.has(idx) && !gameOver && !won;
                return (
                  <button
                    key={cell.id}
                    onClick={() => handleCellClick(cell.id)}
                    className={`
                      relative overflow-hidden rounded-xl font-bold transition-all duration-200 select-none
                      ${
                        cell.revealed
                          ? cell.isBomb
                            ? 'bg-coral shadow-soft scale-95 animate-shake cursor-default'
                            : 'bg-gradient-to-br from-mint to-mint/80 text-white shadow-soft cursor-default'
                          : 'bg-white border-2 border-line hover:border-ink/40 hover:shadow-soft cursor-pointer active:scale-95 transition-transform'
                      }
                    `}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      animation: isRevealing ? 'fadeIn 300ms ease-out' : 'none',
                    }}
                    disabled={gameOver || cell.revealed}
                  >
                    {cell.revealed && (
                      <span className={`text-4xl ${cell.isBomb ? '' : 'animate-bounce'}`}>
                        {cell.isBomb ? '💣' : '✓'}
                      </span>
                    )}
                    {!cell.revealed && cell.flagged && <span className="text-2xl">🚩</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Game end */}
          {gameOver && (
            <div className="text-center space-y-4 animate-reward-pop">
              <div className={`text-6xl ${won ? 'animate-bounce text-mint' : 'animate-bounce text-coral'}`}>
                {won ? '🎉' : '💥'}
              </div>
              <div>
                <p className={`font-black text-xl ${won ? 'text-mint' : 'text-coral'}`}>
                  {won ? 'All bombs avoided!' : 'Hit a bomb!'}
                </p>
                <p className="text-sm text-ink/60 font-semibold">Final score: {score} coins</p>
              </div>
              <button
                onClick={() => {
                  setGameStarted(false);
                  setBoard([]);
                  setSize(3);
                  setRevealedIndices(new Set());
                }}
                className="mx-auto rounded-xl bg-ink px-8 py-3 text-sm font-bold text-white transition hover:shadow-lift active:scale-95"
              >
                Play again
              </button>
            </div>
          )}

          {/* Instructions */}
          {!gameOver && (
            <p className="text-center text-xs text-ink/40">
              Click to reveal • Right-click to flag
            </p>
          )}
        </div>
      )}
    </div>
  );
}
