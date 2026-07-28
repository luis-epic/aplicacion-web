import type { ResolvedLocation } from '../types/app'

const LOCATION_TIMEOUT_MS = 12_000
const LOCATION_MAX_AGE_MS = 0

function locationErrorMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'No concediste acceso a la ubicación. Puedes escribir una ciudad manualmente.'
    case error.POSITION_UNAVAILABLE:
      return 'No pudimos determinar tu ubicación. Comprueba la señal o usa una ciudad manual.'
    case error.TIMEOUT:
      return 'La ubicación tardó demasiado en responder. Inténtalo de nuevo o usa una ciudad.'
    default:
      return 'No pudimos acceder a tu ubicación. Puedes continuar escribiendo una ciudad.'
  }
}

export function requestCurrentLocation(): Promise<ResolvedLocation> {
  if (!window.isSecureContext) {
    return Promise.reject(
      new Error('La ubicación requiere una conexión segura HTTPS o localhost.'),
    )
  }

  if (!navigator.geolocation) {
    return Promise.reject(
      new Error('Este navegador no admite ubicación. Usa la búsqueda manual por ciudad.'),
    )
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          name: 'Tu ubicación',
          accuracyMeters: Math.max(1, Math.round(position.coords.accuracy)),
          detail: 'Coordenadas aproximadas',
          source: 'device',
        })
      },
      (error) => reject(new Error(locationErrorMessage(error))),
      {
        enableHighAccuracy: true,
        maximumAge: LOCATION_MAX_AGE_MS,
        timeout: LOCATION_TIMEOUT_MS,
      },
    )
  })
}
