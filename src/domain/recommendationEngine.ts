import type {
  ActivityId,
  ChecklistItem,
  OutingDraft,
  RecommendationResult,
  WeatherContext,
} from '../types/app'

type Recommendation = Omit<ChecklistItem, 'completed'>

interface RuleContext {
  draft: OutingDraft
  weather?: WeatherContext
  durationHours: number
  startMinutes: number
  endMinutes: number
  returnsAfterSunset: boolean
}

interface RecommendationRule {
  id: string
  label: string
  applies: (context: RuleContext) => boolean
  recommend: (context: RuleContext) => Recommendation[]
}

const recommendation = (
  id: string,
  label: string,
  reason: string,
  category: ChecklistItem['category'],
  priority: ChecklistItem['priority'] = 'normal',
): Recommendation => ({ id, label, reason, category, priority })

const activityRecommendations: Record<ActivityId, Recommendation[]> = {
  work: [
    recommendation('laptop', 'Ordenador portátil', 'Tu actividad es una jornada de trabajo', 'Actividad', 'high'),
    recommendation('work-id', 'Identificación del trabajo', 'Puede ser necesaria para acceder a tu lugar de trabajo', 'Actividad', 'high'),
    recommendation('headphones', 'Auriculares', 'Útiles para llamadas o concentración durante el trabajo', 'Actividad'),
  ],
  university: [
    recommendation('study-material', 'Cuaderno o material de clase', 'Tienes una salida de universidad', 'Actividad', 'high'),
    recommendation('pens', 'Bolígrafos', 'Los necesitarás para tomar apuntes', 'Actividad'),
    recommendation('student-id', 'Credencial universitaria', 'Puede ser necesaria para acceder al campus', 'Actividad', 'high'),
  ],
  gym: [
    recommendation('sportswear', 'Ropa deportiva', 'Has elegido una sesión de gimnasio', 'Actividad', 'high'),
    recommendation('towel', 'Toalla', 'Útil durante y después del entrenamiento', 'Actividad'),
    recommendation('water', 'Botella de agua', 'Es importante hidratarte durante el entrenamiento', 'Actividad', 'high'),
    recommendation('locker-lock', 'Candado', 'Puede ser necesario para guardar tus cosas', 'Actividad'),
  ],
  bike: [
    recommendation('helmet', 'Casco', 'Tu salida incluye un trayecto en bicicleta', 'Actividad', 'high'),
    recommendation('water', 'Botella de agua', 'Conviene mantenerte hidratado durante el trayecto', 'Actividad'),
    recommendation('repair-kit', 'Kit básico de reparación', 'Puede ayudarte ante un pinchazo o ajuste inesperado', 'Actividad'),
  ],
  errand: [
    recommendation('reusable-bag', 'Bolsa reutilizable', 'Puede ser útil para tus compras o recados', 'Actividad'),
    recommendation('errand-list', 'Lista del recado', 'Te ayudará a completar todo en una sola salida', 'Actividad'),
  ],
  custom: [],
}

const rules: RecommendationRule[] = [
  {
    id: 'essentials',
    label: 'Básicos para cualquier salida',
    applies: () => true,
    recommend: () => [
      recommendation('keys', 'Llaves', 'Esencial para volver a casa', 'Esenciales', 'high'),
      recommendation('phone', 'Teléfono', 'Te permitirá comunicarte y consultar tu salida', 'Esenciales', 'high'),
      recommendation('wallet', 'Cartera y documentación', 'Conviene llevar identificación y un método de pago', 'Esenciales', 'high'),
    ],
  },
  {
    id: 'activity',
    label: 'Objetos según la actividad',
    applies: ({ draft }) => activityRecommendations[draft.activity].length > 0,
    recommend: ({ draft }) => activityRecommendations[draft.activity],
  },
  {
    id: 'public-transport',
    label: 'Trayecto en transporte público',
    applies: ({ draft }) => draft.transport === 'public',
    recommend: () => [
      recommendation('transport-card', 'Tarjeta de transporte', 'Has elegido transporte público', 'Transporte', 'high'),
    ],
  },
  {
    id: 'car',
    label: 'Trayecto en coche',
    applies: ({ draft }) => draft.transport === 'car',
    recommend: () => [
      recommendation('driver-license', 'Permiso de conducir', 'Vas a desplazarte en coche', 'Transporte', 'high'),
      recommendation('car-keys', 'Llaves del coche', 'Las necesitarás para tu trayecto', 'Transporte', 'high'),
    ],
  },
  {
    id: 'bike-transport',
    label: 'Trayecto en bicicleta',
    applies: ({ draft }) => draft.transport === 'bike',
    recommend: () => [
      recommendation('helmet', 'Casco', 'Has elegido la bicicleta como transporte', 'Transporte', 'high'),
      recommendation('bike-lock', 'Candado para bicicleta', 'Te permitirá asegurarla al llegar', 'Transporte'),
    ],
  },
  {
    id: 'medium-duration',
    label: 'Salida de varias horas',
    applies: ({ durationHours }) => durationHours >= 4,
    recommend: ({ durationHours }) => [
      recommendation('charger', 'Cargador', `Estarás fuera durante ${durationHours} horas`, 'Actividad'),
      recommendation('water', 'Botella de agua', `Tu salida durará ${durationHours} horas`, 'Actividad'),
    ],
  },
  {
    id: 'long-duration',
    label: 'Salida prolongada',
    applies: ({ durationHours }) => durationHours >= 8,
    recommend: ({ durationHours }) => [
      recommendation('snack', 'Algo para comer', `La salida está prevista para ${durationHours} horas`, 'Actividad'),
      recommendation('power-bank', 'Batería portátil', 'Puede ser útil durante una salida larga', 'Actividad'),
    ],
  },
  {
    id: 'full-day',
    label: 'Salida de día completo',
    applies: ({ durationHours }) => durationHours >= 24,
    recommend: () => [
      recommendation('change-clothes', 'Muda de ropa', 'Estarás fuera durante todo el día', 'Actividad'),
      recommendation('toiletries', 'Aseo básico', 'Puede ser útil durante una salida de día completo', 'Actividad'),
    ],
  },
  {
    id: 'possible-rain',
    label: 'Posibilidad de lluvia',
    applies: ({ weather }) => Boolean(weather && weather.rainProbability >= 40),
    recommend: ({ weather }) => [
      recommendation('umbrella', 'Paraguas compacto', `Hay un ${weather?.rainProbability ?? 0}% de probabilidad de lluvia`, 'Clima'),
    ],
  },
  {
    id: 'heavy-rain',
    label: 'Lluvia muy probable',
    applies: ({ weather }) => Boolean(weather && weather.rainProbability >= 70),
    recommend: ({ weather }) => [
      recommendation('raincoat', 'Chaqueta impermeable', `La probabilidad de lluvia alcanza el ${weather?.rainProbability ?? 0}%`, 'Clima', 'high'),
    ],
  },
  {
    id: 'cool-weather',
    label: 'Temperatura fresca',
    applies: ({ weather }) => Boolean(weather && weather.temperatureMin <= 14),
    recommend: ({ weather }) => [
      recommendation('light-jacket', 'Chaqueta ligera', `La temperatura puede bajar hasta ${weather?.temperatureMin ?? 0} °C`, 'Clima'),
    ],
  },
  {
    id: 'hot-weather',
    label: 'Temperatura elevada',
    applies: ({ weather }) => Boolean(weather && weather.temperatureMax >= 27),
    recommend: ({ weather }) => [
      recommendation('water', 'Botella de agua', `La temperatura puede alcanzar ${weather?.temperatureMax ?? 0} °C`, 'Clima', 'high'),
      recommendation('sunscreen', 'Protector solar', 'Se espera una temperatura elevada', 'Clima'),
    ],
  },
  {
    id: 'strong-wind',
    label: 'Viento fuerte',
    applies: ({ weather }) => Boolean(weather && weather.windSpeed >= 30),
    recommend: ({ weather }) => [
      recommendation('windbreaker', 'Cortavientos', `Se esperan rachas cercanas a ${weather?.windSpeed ?? 0} km/h`, 'Clima'),
    ],
  },
  {
    id: 'bike-after-dark',
    label: 'Bicicleta después del atardecer',
    applies: ({ draft, returnsAfterSunset }) =>
      returnsAfterSunset && (draft.transport === 'bike' || draft.activity === 'bike'),
    recommend: () => [
      recommendation('bike-lights', 'Luces para bicicleta', 'Tu salida terminará después del atardecer', 'Transporte', 'high'),
      recommendation('reflective-item', 'Elemento reflectante', 'Te hará más visible cuando haya poca luz', 'Transporte', 'high'),
    ],
  },
]

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function buildContext(draft: OutingDraft, weather?: WeatherContext): RuleContext {
  const durationHours = Number.parseInt(draft.duration, 10) || 1
  const startMinutes = timeToMinutes(draft.time)
  const endMinutes = startMinutes + durationHours * 60
  const sunsetMinutes = weather ? timeToMinutes(weather.sunset) : Number.POSITIVE_INFINITY

  return {
    draft,
    weather,
    durationHours,
    startMinutes,
    endMinutes,
    returnsAfterSunset: endMinutes >= sunsetMinutes || endMinutes >= 24 * 60,
  }
}

export function generateChecklist(
  draft: OutingDraft,
  weather?: WeatherContext,
): RecommendationResult {
  const context = buildContext(draft, weather)
  const uniqueItems = new Map<string, ChecklistItem>()
  const appliedRules: string[] = []

  for (const rule of rules) {
    if (!rule.applies(context)) continue
    appliedRules.push(rule.label)

    for (const item of rule.recommend(context)) {
      const existingItem = uniqueItems.get(item.id)
      if (!existingItem) {
        uniqueItems.set(item.id, { ...item, completed: false })
        continue
      }

      if (item.priority === 'high' && existingItem.priority !== 'high') {
        uniqueItems.set(item.id, { ...existingItem, priority: 'high' })
      }
    }
  }

  return {
    items: [...uniqueItems.values()],
    appliedRules,
  }
}
