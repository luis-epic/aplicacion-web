import type {
  ActivityOption,
  AppPreferences,
  OutingDraft,
  Routine,
} from '../types/app'
import { toLocalIsoDate } from '../utils/dates'

const localToday = toLocalIsoDate(new Date())

export const activityOptions: ActivityOption[] = [
  {
    id: 'work',
    label: 'Trabajo',
    description: 'Oficina o jornada habitual',
    icon: 'briefcase',
  },
  {
    id: 'university',
    label: 'Universidad',
    description: 'Clases, biblioteca o estudio',
    icon: 'book',
  },
  {
    id: 'gym',
    label: 'Gimnasio',
    description: 'Entrenamiento o deporte',
    icon: 'activity',
  },
  {
    id: 'bike',
    label: 'Bicicleta',
    description: 'Trayecto o paseo en bici',
    icon: 'bike',
  },
  {
    id: 'errand',
    label: 'Recado',
    description: 'Compra o gestión rápida',
    icon: 'shopping',
  },
  {
    id: 'custom',
    label: 'Otra salida',
    description: 'Configúrala a tu manera',
    icon: 'sparkles',
  },
]

export const initialDraft: OutingDraft = {
  activity: 'work',
  date: localToday,
  time: '08:30',
  duration: '8',
  transport: 'public',
  locationMode: 'current',
  city: '',
}

export const initialPreferences: AppPreferences = {
  defaultCity: '',
  temperatureUnit: 'celsius',
  suggestions: true,
  notifications: false,
}

export const routines: Routine[] = []

export const activityLabels = Object.fromEntries(
  activityOptions.map((activity) => [activity.id, activity.label]),
) as Record<OutingDraft['activity'], string>

export const transportLabels: Record<OutingDraft['transport'], string> = {
  walking: 'A pie',
  public: 'Transporte público',
  car: 'Coche',
  bike: 'Bicicleta',
}
