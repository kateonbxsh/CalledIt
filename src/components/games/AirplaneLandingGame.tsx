import { useState, useEffect, useRef } from 'react';
import { Cloud, Zap } from 'lucide-react';

interface GameState {
  x: number;
  y: number;
  velocityY: number;
  velocityX: number;
  angle: number;
  isLanded: boolean;
  crashed: boolean;
  fuel: number;
}

interface Obstacle {
  id: string;
  x: number;
  y: number;
  type: 'coin' | 'storm' | 'wind';
  collected?: boolean;
}

interface Platform {
  x: number;
  width: number;
  quality: 'good' | 'ok' | 'risky';
}

const GAME_WIDTH = 400;
const GAME_HEIGHT = 600;
const GRAVITY = 0.25;
const MAX_VELOCITY = 15;
const BOOST_STRENGTH = -7;
const AIRPLANE_SIZE = 20;

export function AirplaneLandingGame({ onGameEnd }: { onGameEnd: (won: boolean, score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    x: GAME_WIDTH / 2,
    y: 40,
    velocityY: 1,
    velocityX: 0,
    angle: 0,
    isLanded: false,
    crashed: false,
    fuel: 100,
  });
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [landingQuality, setLandingQuality] = useState<'perfect' | 'good' | 'ok' | 'crash' | null>(null);
  const gameStateRef = useRef(gameState);
  const obstaclesRef = useRef(obstacles);
  const scoreRef = useRef(score);
  const platformsRef = useRef<Platform[]>([
    { x: 40, width: 70, quality: 'good' },
    { x: 160, width: 80, quality: 'ok' },
    { x: 290, width: 70, quality: 'good' },
  ]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    scoreRef.useRef = score;
  }, [score]);

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let animationId: number;
    let obstacleSpawner: NodeJS.Timeout;

    const gameLoop = () => {
      const state = gameStateRef.current;
      if (state.crashed || state.isLanded || gameOver) return;

      // Physics
      let newVelocityY = Math.min(state.velocityY + GRAVITY, MAX_VELOCITY);
      let newVelocityX = state.velocityX * 0.98; // Air resistance
      let newX = state.x + newVelocityX;
      let newY = state.y + newVelocityY;

      // Boundary wrapping
      if (newX < 0) newX = GAME_WIDTH;
      if (newX > GAME_WIDTH) newX = 0;

      // Angle based on velocity
      const newAngle = Math.min(Math.max(newVelocityY / 2, -30), 30);

      // Spawn obstacles
      if (Math.random() < 0.015 && obstaclesRef.current.length < 8) {
        const newObstacle: Obstacle = {
          id: Math.random().toString(),
          x: Math.random() * GAME_WIDTH,
          y: -30,
          type: ['coin', 'coin', 'storm', 'wind'][Math.floor(Math.random() * 4)] as 'coin' | 'storm' | 'wind',
        };
        setObstacles([...obstaclesRef.current, newObstacle]);
      }

      // Update obstacles
      const newObstacles = obstaclesRef.current
        .map((obs) => ({ ...obs, y: obs.y + 3 }))
        .filter((obs) => obs.y < GAME_HEIGHT + 50);

      // Check obstacle collisions
      newObstacles.forEach((obs) => {
        const dist = Math.sqrt((newX - obs.x) ** 2 + (newY - obs.y) ** 2);
        if (dist < 30 && !obs.collected) {
          if (obs.type === 'coin') {
            setScore(scoreRef.current + 15);
          } else if (obs.type === 'storm') {
            newVelocityY += 3;
          } else if (obs.type === 'wind') {
            newVelocityX += (Math.random() - 0.5) * 4;
          }
          obs.collected = true;
        }
      });

      setObstacles(newObstacles.filter((obs) => !obs.collected));

      // Check landing
      const landingZone = platformsRef.current.find(
        (p) => newY >= GAME_HEIGHT - 60 && newX >= p.x && newX <= p.x + p.width,
      );

      if (newY >= GAME_HEIGHT - 60) {
        if (landingZone) {
          const speedFactor = Math.abs(newVelocityY);
          let quality: 'perfect' | 'good' | 'ok' = 'ok';
          let bonusScore = 0;

          if (speedFactor < 2 && Math.abs(newVelocityX) < 1) {
            quality = 'perfect';
            bonusScore = 100;
          } else if (speedFactor < 4 && Math.abs(newVelocityX) < 2) {
            quality = 'good';
            bonusScore = 50;
          }

          setLandingQuality(quality);
          setScore(scoreRef.current + bonusScore);
          setGameState({ ...state, y: GAME_HEIGHT - 60, isLanded: true, velocityY: 0 });
          setGameOver(true);
          onGameEnd(true, scoreRef.current + bonusScore);
          return;
        } else {
          setLandingQuality('crash');
          setGameState({ ...state, crashed: true });
          setGameOver(true);
          onGameEnd(false, Math.floor(scoreRef.current * 0.5));
          return;
        }
      }

      setGameState({
        ...state,
        x: newX,
        y: newY,
        velocityY: newVelocityY,
        velocityX: newVelocityX,
        angle: newAngle,
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp') {
        e.preventDefault();
        setGameState((prev) => ({ ...prev, velocityY: BOOST_STRENGTH, fuel: Math.max(0, prev.fuel - 15) }));
      } else if (e.key === 'ArrowLeft') {
        setGameState((prev) => ({ ...prev, velocityX: Math.max(-8, prev.velocityX - 1) }));
      } else if (e.key === 'ArrowRight') {
        setGameState((prev) => ({ ...prev, velocityX: Math.min(8, prev.velocityX + 1) }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    animationId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animationId);
      clearInterval(obstacleSpawner);
    };
  }, [gameStarted, gameOver, onGameEnd]);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sky gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, '#87ceeb');
    gradient.addColorStop(1, '#e0f6ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Clouds
    for (let i = 0; i < 3; i++) {
      const cloudY = 50 + i * 100;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.ellipse(100 + i * 120, cloudY, 60, 25, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Water
    ctx.fillStyle = '#1e90ff';
    ctx.fillRect(0, GAME_HEIGHT - 50, GAME_WIDTH, 50);
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 50, GAME_HEIGHT - 40);
      ctx.bezierCurveTo(i * 50 + 15, GAME_HEIGHT - 45, i * 50 + 25, GAME_HEIGHT - 35, i * 50 + 40, GAME_HEIGHT - 40);
      ctx.stroke();
    }

    // Platforms
    platformsRef.current.forEach((platform, idx) => {
      const colors = ['#4CAF50', '#FFC107', '#FF9800'];
      ctx.fillStyle = colors[idx];
      ctx.fillRect(platform.x, GAME_HEIGHT - 50, platform.width, 15);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.strokeRect(platform.x, GAME_HEIGHT - 50, platform.width, 15);
    });

    // Airplane
    ctx.save();
    ctx.translate(gameState.x, gameState.y);
    ctx.rotate((gameState.angle * Math.PI) / 180);

    // Airplane body
    ctx.fillStyle = gameState.crashed ? '#FF6B6B' : '#FFD700';
    ctx.beginPath();
    ctx.ellipse(0, 0, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cockpit
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(8, -2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-15, -3);
    ctx.lineTo(-25, -8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, -3);
    ctx.lineTo(25, -8);
    ctx.stroke();

    // Tail
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(-28, 5);
    ctx.stroke();

    ctx.restore();

    // Obstacles
    obstacles.forEach((obs) => {
      if (obs.type === 'coin') {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF8C00';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#FF8C00';
        ctx.fillText('$', obs.x - 3, obs.y + 3);
      } else if (obs.type === 'storm') {
        ctx.fillStyle = '#4A4A4A';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(obs.x - 6 + i * 6, obs.y - 3, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#87CEEB';
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y - 10);
        ctx.lineTo(obs.x - 8, obs.y + 10);
        ctx.lineTo(obs.x + 8, obs.y + 10);
        ctx.closePath();
        ctx.fill();
      }
    });

    // UI
    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px Inter, sans-serif';
    ctx.fillText(`Score: ${score}`, 15, 30);
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText('↑ SPACE / ↑↓← → Arrows', 15, GAME_HEIGHT - 15);
  }, [gameState, obstacles, score]);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {!gameStarted ? (
        <div className="text-center space-y-4">
          <div className="text-5xl">✈️</div>
          <h3 className="text-xl font-black">Airplane Landing</h3>
          <p className="text-sm text-ink/60 max-w-xs">
            Guide your plane to a safe landing. Collect coins for bonuses, avoid storms and wind gusts. Land smoothly for extra points!
          </p>
          <button
            onClick={() => {
              setGameStarted(true);
              setGameOver(false);
              setGameState({
                x: GAME_WIDTH / 2,
                y: 40,
                velocityY: 1,
                velocityX: 0,
                angle: 0,
                isLanded: false,
                crashed: false,
                fuel: 100,
              });
              setScore(0);
              setObstacles([]);
              setLandingQuality(null);
            }}
            className="mt-4 rounded-xl bg-sky px-6 py-3 text-sm font-bold text-white"
          >
            Start flying
          </button>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-2xl border-4 border-white shadow-lift max-w-full"
          />
          {gameOver && (
            <div className="text-center space-y-3 animate-reward-pop">
              <div
                className={`text-4xl ${
                  gameState.isLanded
                    ? landingQuality === 'perfect'
                      ? 'text-mint'
                      : landingQuality === 'good'
                        ? 'text-sky'
                        : 'text-ink'
                    : 'text-coral'
                }`}
              >
                {gameState.isLanded ? (landingQuality === 'perfect' ? '🎯' : landingQuality === 'good' ? '✓' : '✓') : '💥'}
              </div>
              <div>
                <p className={`font-black text-lg ${gameState.isLanded ? 'text-mint' : 'text-coral'}`}>
                  {gameState.isLanded
                    ? landingQuality === 'perfect'
                      ? 'Perfect landing!'
                      : landingQuality === 'good'
                        ? 'Great landing!'
                        : 'Safe landing'
                    : 'Crashed!'}
                </p>
                <p className="text-sm text-ink/60">Score: {gameState.isLanded ? score : Math.floor(score * 0.5)}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
