import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

/**
 * Capture a meal photo. Uses Capacitor Camera on Android/iOS;
 * returns null on web so the caller can fall back to file input.
 */
export async function captureMealPhoto() {
  if (!isNativeApp()) return null;

  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

    const perm = await Camera.checkPermissions();
    if (perm.camera !== 'granted') {
      const req = await Camera.requestPermissions({ permissions: ['camera'] });
      if (req.camera !== 'granted') {
        throw new Error('Camera permission denied');
      }
    }

    const photo = await Camera.getPhoto({
      quality: 82,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      correctOrientation: true,
      width: 1280,
    });

    if (!photo.dataUrl) return null;

    const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
    return {
      dataUrl: photo.dataUrl,
      base64: photo.dataUrl.split(',')[1],
      mimeType,
    };
  } catch (err) {
    if (err?.message === 'User cancelled photos app') return null;
    throw err;
  }
}

export async function pickMealPhotoFromGallery() {
  if (!isNativeApp()) return null;

  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 82,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    correctOrientation: true,
    width: 1280,
  });

  if (!photo.dataUrl) return null;
  const mimeType = photo.format === 'png' ? 'image/png' : 'image/jpeg';
  return {
    dataUrl: photo.dataUrl,
    base64: photo.dataUrl.split(',')[1],
    mimeType,
  };
}
