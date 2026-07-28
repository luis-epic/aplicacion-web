import type { EarthquakeEvent } from '../services/earthquakeFeed'
import type { ResolvedLocation } from '../types/app'

const EARTH_RADIUS_KM = 6_371

export interface EarthquakeFilters {
  minimumMagnitude: number
  radiusKm: number
}

export interface NearbyEarthquake extends EarthquakeEvent {
  distanceKm: number
}

function degreesToRadians(value: number): number {
  return value * (Math.PI / 180)
}

export function distanceInKilometres(
  first: Pick<ResolvedLocation, 'latitude' | 'longitude'>,
  second: Pick<EarthquakeEvent, 'latitude' | 'longitude'>,
): number {
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude)
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude)
  const firstLatitude = degreesToRadians(first.latitude)
  const secondLatitude = degreesToRadians(second.latitude)

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  const boundedHaversine = Math.min(1, Math.max(0, haversine))
  const angularDistance = 2 * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine),
  )
  return EARTH_RADIUS_KM * angularDistance
}

export function nearbyEarthquakes(
  events: EarthquakeEvent[],
  location: ResolvedLocation,
  filters: EarthquakeFilters,
): NearbyEarthquake[] {
  return events
    .filter((event) => event.magnitude >= filters.minimumMagnitude)
    .map((event) => ({
      event,
      exactDistanceKm: distanceInKilometres(location, event),
    }))
    .filter(({ exactDistanceKm }) => exactDistanceKm <= filters.radiusKm)
    .map(({ event, exactDistanceKm }) => ({
      ...event,
      distanceKm: Math.round(exactDistanceKm),
    }))
    .sort((first, second) => second.occurredAt - first.occurredAt)
}

export function magnitudeTone(magnitude: number): 'low' | 'medium' | 'high' {
  if (magnitude >= 6) return 'high'
  if (magnitude >= 4.5) return 'medium'
  return 'low'
}
