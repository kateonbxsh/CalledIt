import { useState, useEffect, useRef } from 'react';

interface AirplaneState {
  x: number;
  y: number;
  velocityY: number;
  isLanded: boolean;
  crashed: boolean;
}

interface Boat {
  x: number;
  width: number;
}

interface Hazard {
  id: string;
  x: number;
  type: 'coin' | 'rocket';
}

const GRAVITY = 0.3;
const BOOST_POWER = -8;
const ROCKET_PUSH = 5;
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 400;

export function AirplaneLandingGame({ onGameEnd }: { onGameEnd: (won: boolean, score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<AirplaneState>({
    x: CANVAS_WIDTH / 2,
    y: 50,
    velocityY: 0,
    isLanded: false,
    crashed: false,
  });
  const [boats, setBoats] = useState<Boat[]>([
    { x: 50, width: 50 },
    { x: 150, width: 50 },
    { x: 250, width: 50 },
  ]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const gameStateRef = useRef(gameState);
  const hazardsRef = useRef(hazards);
  const scoreRef = useRef(score);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    hazardsRef.current = hazards;
  }, [hazards]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let hazardSpawner: NodeJS.Timeout;

    const gameLoop = () => {
      const state = gameStateRef.current;
      if (state.crashed || state.isLanded || gameOver) return;

      // Physics
      let newVelocityY = state.velocityY + GRAVITY;
      const newY = state.y + newVelocityY;

      // Spawn hazards occasionally
      if (Math.random() < 0.02) {
        const newHazard: Hazard = {
          id: Math.random().toString(),
          x: Math.random() * (CANVAS_WIDTH - 20),
          type: Math.random() < 0.3 ? 'coin' : 'rocket',
        };
        setHazards([...hazardsRef.current, newHazard]);
      }

      // Update hazards
      const newHazards = hazardsRef.current
        .map((h) => ({ ...h, x: h.x + 1 }))
        .filter((h) => h.x < CANVAS_WIDTH);

      setHazards(newHazards);

      // Check hazard collisions
      newHazards.forEach((hazard) => {
        const dist = Math.sqrt((state.x - hazard.x) ** 2 + (state.y - hazard.y) ** 2);
        if (dist < 20) {
          if (hazard.type === 'coin') {
            setScore(scoreRef.current + 10);
          } else {
            newVelocityY += ROCKET_PUSH;
          }
          setHazards(newHazards.filter((h) => h.id !== hazard.id));
        }
      });

      // Check boat landing
      const landingZone = boats.find((boat) => newY + 15 >= CANVAS_HEIGHT - 30 && state.x >= boat.x && state.x <= boat.x + boat.width);
      if (newY + 15 >= CANVAS_HEIGHT - 30) {
        if (landingZone && Math.abs(newVelocityY) < 5) {
          setGameState({ ...state, y: CANVAS_HEIGHT - 45, isLanded: true, velocityY: 0 });
          setGameOver(true);
          onGameEnd(true, scoreRef.current);
          return;
        } else {
          setGameState({ ...state, crashed: true });
          setGameOver(true);
          onGameEnd(false, scoreRef.current);
          return;
        }
      }

      setGameState({
        ...state,
        y: newY,
        velocityY: newVelocityY,
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        setGameState((prev) => ({ ...prev, velocityY: BOOST_POWER }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    animationId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animationId);
    };
  }, [gameOver, onGameEnd]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#edf0e8';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw water
    ctx.fillStyle = '#3b75af';
    ctx.fillRect(0, CANVAS_HEIGHT - 40, CANVAS_WIDTH, 40);

    // Draw boats
    ctx.fillStyle = '#d49a25';
    boats.forEach((boat) => {
      ctx.fillRect(boat.x, CANVAS_HEIGHT - 35, boat.width, 20);
      ctx.strokeStyle = '#8f5f3d';
      ctx.lineWidth = 2;
      ctx.strokeRect(boat.x, CANVAS_HEIGHT - 35, boat.width, 20);
    });

    // Draw airplane
    ctx.fillStyle = gameState.crashed ? '#d95f46' : gameState.isLanded ? '#2f7d63' : '#121417';
    ctx.beginPath();
    ctx.arc(gameState.x, gameState.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw hazards
    hazards.forEach((hazard) => {
      if (hazard.type === 'coin') {
        ctx.fillStyle = '#d49a25';
        ctx.beginPath();
        ctx.arc(hazard.x, hazard.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8f5f3d';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = '#d95f46';
        ctx.fillRect(hazard.x - 8, hazard.y - 8, 16, 16);
        ctx.strokeStyle = '#8f3d2e';
        ctx.lineWidth = 2;
        ctx.strokeRect(hazard.x - 8, hazard.y - 8, 16, 16);
      }
    });

    // Draw UI
    ctx.fillStyle = '#121417';
    ctx.font = 'bold 16px Inter';
    ctx.fillText(`Score: ${score}`, 10, 25);
    ctx.font = '12px Inter';
    ctx.fillText('Press SPACE to boost', 10, CANVAS_HEIGHT - 10);
  }, [gameState, hazards, score, boats]);

  return (
    <div className="text-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="mx-auto rounded-lg border border-line shadow-soft"
      />
      {gameOver && (
        <div className="mt-3 space-y-2">
          <p className={`text-sm font-black ${gameState.isLanded ? 'text-mint' : 'text-coral'}`}>
            {gameState.isLanded ? '✓ Safe landing!' : '✗ Crashed!'}
          </p>
          <p className="text-xs text-ink/60">Final score: {score}</p>
        </div>
      )}
    </div>
  );
}
