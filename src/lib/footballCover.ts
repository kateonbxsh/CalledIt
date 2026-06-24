import type { FootballMatchLink, FootballTeamLink } from '../types';
import { footballCrestProxyUrl } from '../services/footballService';

const WIDTH = 960;
const HEIGHT = 540;
const MAX_OUTPUT_CHARS = 520_000;

function loadCrest(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load team crest.'));
    image.src = footballCrestProxyUrl(url);
  });
}

function teamLabel(team: FootballTeamLink) {
  return team.shortName || team.name;
}

function teamInitials(team: FootballTeamLink) {
  return team.tla || team.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
}

function drawContained(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  maxSize: number,
) {
  const scale = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
}

function drawFallback(context: CanvasRenderingContext2D, team: FootballTeamLink, x: number) {
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(x, 245, 112, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#192538';
  context.font = '900 68px Inter, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(teamInitials(team), x, 247);
}

export async function createFootballMatchCover(match: FootballMatchLink) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the match image.');

  context.fillStyle = '#eaf3ff';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#eee9ff';
  context.beginPath();
  context.moveTo(580, 0);
  context.lineTo(WIDTH, 0);
  context.lineTo(WIDTH, HEIGHT);
  context.lineTo(380, HEIGHT);
  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(255,255,255,.9)';
  context.lineWidth = 14;
  context.beginPath();
  context.moveTo(580, -10);
  context.lineTo(380, HEIGHT + 10);
  context.stroke();

  const [homeCrest, awayCrest] = await Promise.all([
    match.homeTeam.crest ? loadCrest(match.homeTeam.crest).catch(() => null) : Promise.resolve(null),
    match.awayTeam.crest ? loadCrest(match.awayTeam.crest).catch(() => null) : Promise.resolve(null),
  ]);

  if (homeCrest) drawContained(context, homeCrest, 285, 240, 230);
  else drawFallback(context, match.homeTeam, 285);
  if (awayCrest) drawContained(context, awayCrest, 675, 240, 230);
  else drawFallback(context, match.awayTeam, 675);

  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(WIDTH / 2, HEIGHT / 2, 44, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#192538';
  context.font = '900 25px Inter, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('VS', WIDTH / 2, HEIGHT / 2 + 1);

  context.fillStyle = '#192538';
  context.font = '800 28px Inter, sans-serif';
  context.fillText(teamLabel(match.homeTeam), 250, 454, 340);
  context.fillText(teamLabel(match.awayTeam), 710, 454, 340);
  context.fillStyle = 'rgba(25,37,56,.55)';
  context.font = '700 17px Inter, sans-serif';
  context.fillText(match.competitionName, WIDTH / 2, 505, 620);

  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_OUTPUT_CHARS) return dataUrl;
  }
  throw new Error('The generated match image is too large.');
}
