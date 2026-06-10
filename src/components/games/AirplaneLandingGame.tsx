import { useState, useEffect, useRef } from 'react';

interface GameState {
  x: number;
  y: number;
  velocityY: number;
  velocityX: number;
  angle: number;
  isLanded: boolean;
  crashed: boolean;
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
  color: string;
}

const GAME_WIDTH = 420;
const GAME_HEIGHT = 700;
const GRAVITY = 0.25;
const MAX_VELOCITY = 15;
const BOOST_STRENGTH = -7;

export function AirplaneLandingGame({ onGameEnd }: { onGameEnd: (won: boolean, score: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    x: GAME_WIDTH / 2,
    y: 50,
    velocityY: 1,
    velocityX: 0,
    angle: 0,
    isLanded: false,
    crashed: false,
  });
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [score, setScore] = useState(0);
  const [landingQuality, setLandingQuality] = useState<'perfect' | 'good' | 'ok' | 'crash' | null>(null);
  const [particles, setParticles] = useState<Array<{ x: number; y: number; vx: number; vy: number; life: number }>>([]);
  const gameStateRef = useRef(gameState);
  const obstaclesRef = useRef(obstacles);
  const scoreRef = useRef(score);
  const particlesRef = useRef(particles);
  const keysPressed = useRef<Record<string, boolean>>({});

  const platforms: Platform[] = [
    { x: 30, width: 80, color: '#4CAF50' },
    { x: 165, width: 90, color: '#FFC107' },
    { x: 310, width: 80, color: '#FF9800' },
  ];

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    particlesRef.current = particles;
  }, [particles]);

  useEffect(() => {
    if (!gameStarted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      if (e.key === ' ') {
        e.preventDefault();
        setGameState((prev) => ({ ...prev, velocityY: BOOST_STRENGTH }));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches[0].clientY < window.innerHeight / 2) {
        setGameState((prev) => ({ ...prev, velocityY: BOOST_STRENGTH }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
    };
  }, [gameStarted]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;

    const gameLoop = () => {
      const state = gameStateRef.current;

      // Keyboard input
      let newVelocityX = state.velocityX * 0.98;
      if (keysPressed.current['arrowleft'] || keysPressed.current['a']) {
        newVelocityX = Math.max(-8, newVelocityX - 0.5);
      }
      if (keysPressed.current['arrowright'] || keysPressed.current['d']) {
        newVelocityX = Math.min(8, newVelocityX + 0.5);
      }

      let newVelocityY = Math.min(state.velocityY + GRAVITY, MAX_VELOCITY);
      let newX = state.x + newVelocityX;
      let newY = state.y + newVelocityY;

      // Wrapping
      if (newX < 0) newX = GAME_WIDTH;
      if (newX > GAME_WIDTH) newX = 0;

      // Spawn obstacles
      if (Math.random() < 0.016 && obstaclesRef.current.length < 10) {
        const type = Math.random() < 0.5 ? 'coin' : Math.random() < 0.7 ? 'storm' : 'wind';
        setObstacles([
          ...obstaclesRef.current,
          {
            id: Math.random().toString(),
            x: Math.random() * GAME_WIDTH,
            y: -30,
            type,
          },
        ]);
      }

      // Update obstacles
      const newObstacles = obstaclesRef.current
        .map((obs) => ({ ...obs, y: obs.y + 3.5 }))
        .filter((obs) => obs.y < GAME_HEIGHT + 50);

      // Check collisions
      newObstacles.forEach((obs) => {
        const dist = Math.sqrt((newX - obs.x) ** 2 + (newY - obs.y) ** 2);
        if (dist < 35 && !obs.collected) {
          if (obs.type === 'coin') {
            setScore((s) => s + 15);
            // Particle burst
            const newParticles = Array.from({ length: 6 }, (_, i) => ({
              x: obs.x,
              y: obs.y,
              vx: Math.cos((i / 6) * Math.PI * 2) * 4,
              vy: Math.sin((i / 6) * Math.PI * 2) * 4 - 2,
              life: 1,
            }));
            setParticles([...particlesRef.current, ...newParticles]);
          } else if (obs.type === 'storm') {
            newVelocityY += 2.5;
          } else {
            newVelocityX += (Math.random() - 0.5) * 3;
          }
          obs.collected = true;
        }
      });

      setObstacles(newObstacles.filter((obs) => !obs.collected));

      // Update particles
      const newParticles = particlesRef.current
        .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 0.02 }))
        .filter((p) => p.life > 0);
      setParticles(newParticles);

      // Check landing
      const angle = Math.min(Math.max(newVelocityY / 2, -30), 30);
      const landingZone = platforms.find((p) => newY >= GAME_HEIGHT - 80 && newX >= p.x && newX <= p.x + p.width);

      if (newY >= GAME_HEIGHT - 80) {
        const speed = Math.abs(newVelocityY);
        let quality: 'perfect' | 'good' | 'ok' = 'ok';
        let bonus = 0;

        if (speed < 2 && Math.abs(newVelocityX) < 1 && landingZone) {
          quality = 'perfect';
          bonus = 100;
        } else if (speed < 4 && Math.abs(newVelocityX) < 2 && landingZone) {
          quality = 'good';
          bonus = 50;
        }

        if (landingZone) {
          setLandingQuality(quality);
          setGameState({ ...state, y: GAME_HEIGHT - 80, isLanded: true, velocityY: 0, angle });
          setGameOver(true);
          onGameEnd(true, scoreRef.current + bonus);
        } else {
          setLandingQuality('crash');
          setGameState({ ...state, crashed: true, angle });
          setGameOver(true);
          onGameEnd(false, Math.floor(scoreRef.current * 0.4));
        }
      } else {
        setGameState({
          ...state,
          x: newX,
          y: newY,
          velocityY: newVelocityY,
          velocityX: newVelocityX,
          angle,
        });
      }
    };

    const id = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(id);
  }, [gameStarted, gameOver, onGameEnd]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, '#87CEEB');
    sky.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    [50, 180, 320].forEach((y, i) => {
      ctx.beginPath();
      ctx.ellipse(80 + i * 140, y, 55, 22, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Water
    const water = ctx.createLinearGradient(0, GAME_HEIGHT - 80, 0, GAME_HEIGHT);
    water.addColorStop(0, '#1E90FF');
    water.addColorStop(1, '#0055BB');
    ctx.fillStyle = water;
    ctx.fillRect(0, GAME_HEIGHT - 80, GAME_WIDTH, 80);

    // Wave pattern
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 70, GAME_HEIGHT - 50);
      ctx.quadraticCurveTo(i * 70 + 20, GAME_HEIGHT - 55, i * 70 + 40, GAME_HEIGHT - 50);
      ctx.stroke();
    }

    // Landing platforms
    platforms.forEach((platform) => {
      ctx.fillStyle = platform.color;
      ctx.fillRect(platform.x, GAME_HEIGHT - 80, platform.width, 20);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(platform.x, GAME_HEIGHT - 80, platform.width, 20);

      // Platform label
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.font = 'bold 11px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('LAND', platform.x + platform.width / 2, GAME_HEIGHT - 60);
    });

    // Airplane
    ctx.save();
    ctx.translate(gameState.x, gameState.y);
    ctx.rotate((gameState.angle * Math.PI) / 180);

    ctx.fillStyle = gameState.crashed ? '#FF5252' : '#FFD700';
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(10, -3, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-26, -10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, -4);
    ctx.lineTo(26, -10);
    ctx.stroke();

    ctx.restore();

    // Obstacles
    obstacles.forEach((obs) => {
      if (obs.type === 'coin') {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(obs.x, obs.y, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF8C00';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (obs.type === 'storm') {
        ctx.fillStyle = '#505050';
        [0, 6, 12].forEach((offset) => {
          ctx.beginPath();
          ctx.arc(obs.x - 6 + offset, obs.y - 2, 6, 0, Math.PI * 2);
          ctx.fill();
        });
      } else {
        ctx.fillStyle = '#87CEEB';
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y - 12);
        ctx.lineTo(obs.x - 10, obs.y + 12);
        ctx.lineTo(obs.x + 10, obs.y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    // Particles
    particles.forEach((p) => {
      ctx.fillStyle = `rgba(255, 215, 0, ${p.life})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // UI
    ctx.fillStyle = '#000';
    ctx.font = 'bold 18px Inter';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 15, 35);

    ctx.font = '11px Inter';
    ctx.fillStyle = '#333';
    ctx.fillText('SPACE or TAP to boost • Arrow keys to steer', 15, GAME_HEIGHT - 15);
  }, [gameState, obstacles, score, particles]);

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      {!gameStarted ? (
        <div className="text-center space-y-4 p-4">
          <div className="text-6xl animate-bounce">✈️</div>
          <h3 className="text-2xl font-black">Airplane Landing</h3>
          <p className="text-sm text-ink/60 max-w-sm leading-relaxed">
            Guide your plane safely to a landing platform. Collect coins for bonus points, avoid storms and wind. Land smoothly for extra rewards!
          </p>
          <div className="flex gap-3 justify-center text-xs text-ink/40">
            <span>🪙 +15pts</span>
            <span>⛈️ -gravity</span>
            <span>💨 drift</span>
          </div>
          <button
            onClick={() => {
              setGameStarted(true);
              setGameOver(false);
              setGameState({ x: GAME_WIDTH / 2, y: 50, velocityY: 1, velocityX: 0, angle: 0, isLanded: false, crashed: false });
              setScore(0);
              setObstacles([]);
              setParticles([]);
              setLandingQuality(null);
            }}
            className="mt-4 rounded-xl bg-sky px-8 py-3 text-sm font-bold text-white shadow-soft hover:shadow-lift transition active:scale-95"
          >
            Start flying
          </button>
        </div>
      ) : (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-2xl sm:rounded-3xl border-4 border-white shadow-lift w-full max-w-lg h-auto"
            style={{ aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}`, maxHeight: '95vh' }}
          />
          {gameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 animate-reward-pop pointer-events-none">
              <div className={`text-6xl drop-shadow-lg ${gameState.isLanded ? 'text-mint animate-bounce' : 'text-coral animate-bounce'}`}>
                {gameState.isLanded ? (landingQuality === 'perfect' ? '🎯' : '✅') : '💥'}
              </div>
              <div className="text-center drop-shadow-lg bg-white/95 rounded-xl px-4 py-3">
                <p className={`font-black text-lg sm:text-xl ${gameState.isLanded ? 'text-mint' : 'text-coral'}`}>
                  {gameState.isLanded ? (landingQuality === 'perfect' ? 'Perfect landing!' : landingQuality === 'good' ? 'Great landing!' : 'Safe landing') : 'Crashed!'}
                </p>
                <p className="text-xs sm:text-sm text-ink/70 font-semibold">
                  Score: {gameState.isLanded ? score : Math.floor(score * 0.4)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
