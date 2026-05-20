const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_OUTPUT_CHARS = 180_000;
const MAX_BET_OUTPUT_CHARS = 520_000;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(image.src);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error('Could not read that image.'));
    };
    image.src = URL.createObjectURL(file);
  });
}

async function downscaleImage(file: File, options: {
  size: number;
  square: boolean;
  maxOutputChars: number;
}) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Choose an image under 5 MB.');
  }

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const scale = options.square
    ? options.size / Math.min(image.naturalWidth, image.naturalHeight)
    : Math.min(1, options.size / Math.max(image.naturalWidth, image.naturalHeight));
  const width = options.square ? options.size : Math.round(image.naturalWidth * scale);
  const height = options.square ? options.size : Math.round(image.naturalHeight * scale);
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not resize the image.');

  const sourceWidth = options.square ? Math.min(image.naturalWidth, image.naturalHeight) : image.naturalWidth;
  const sourceHeight = options.square ? sourceWidth : image.naturalHeight;
  const sourceX = options.square ? (image.naturalWidth - sourceWidth) / 2 : 0;
  const sourceY = options.square ? (image.naturalHeight - sourceHeight) / 2 : 0;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

  for (const quality of [0.78, 0.68, 0.58, 0.48]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= options.maxOutputChars) return dataUrl;
  }

  throw new Error('That image is still too large after resizing.');
}

export function downscaleProfileImage(file: File) {
  return downscaleImage(file, {
    size: 192,
    square: true,
    maxOutputChars: MAX_PROFILE_OUTPUT_CHARS,
  });
}

export function downscaleBetImage(file: File) {
  return downscaleImage(file, {
    size: 960,
    square: false,
    maxOutputChars: MAX_BET_OUTPUT_CHARS,
  });
}
