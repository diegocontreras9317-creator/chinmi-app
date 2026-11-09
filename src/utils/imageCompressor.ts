/**
 * Client-side image compressor utility
 * Resizes and compresses uploaded images so they don't bloat localStorage or Firestore (1MB limit),
 * while preserving high visual fidelity for restaurant logos, banners and menu cards.
 */
export function compressImageFile(
  file: File,
  maxWidth = 1200,
  maxHeight = 600,
  quality = 0.82,
  preserveAlpha = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error('No se pudo leer el archivo.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }

        // Enable high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const isPng = file.type === 'image/png';
        const isSvg = file.type.includes('svg');

        if (isSvg) {
          // SVGs are vector, if small enough return directly
          resolve(src);
          return;
        }

        if (!preserveAlpha && !isPng) {
          // Fill background white for JPEG images
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first for great compression with alpha support, fallback to JPEG/PNG
        try {
          if (preserveAlpha && isPng) {
            // Test if canvas supports webp
            const webpDataUrl = canvas.toDataURL('image/webp', quality);
            if (webpDataUrl.startsWith('data:image/webp')) {
              resolve(webpDataUrl);
              return;
            }
            resolve(canvas.toDataURL('image/png'));
            return;
          }

          const webpDataUrl = canvas.toDataURL('image/webp', quality);
          if (webpDataUrl.startsWith('data:image/webp')) {
            resolve(webpDataUrl);
            return;
          }

          const jpegDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(jpegDataUrl);
        } catch {
          resolve(src);
        }
      };

      img.onerror = () => {
        reject(new Error('Error al decodificar la imagen.'));
      };

      img.src = src;
    };

    reader.onerror = () => {
      reject(new Error('Error al cargar el archivo.'));
    };

    reader.readAsDataURL(file);
  });
}
