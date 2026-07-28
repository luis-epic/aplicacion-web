import type { IconName } from '../types/app'

interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
}

const iconPaths: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M9 21v-7h6v7'],
  checklist: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'm3.5 6 1.5 1.5L7.5 5', 'm3.5 12 1.5 1.5 2.5-2.5', 'm3.5 18 1.5 1.5 2.5-2.5'],
  routines: ['M4 5h16v14H4z', 'M8 3v4', 'M16 3v4', 'M4 10h16', 'M8 14h3', 'M13 14h3'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.05.05-2.83 2.83-.05-.05a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.07a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.05.05-2.83-2.83.05-.05A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.07 14H3v-4h.07A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.05-.05 2.83-2.83.05.05A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.07V3h4v.07a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.05-.05 2.83 2.83-.05.05A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 20.93 10H21v4h-.07A1.7 1.7 0 0 0 19.4 15Z'],
  briefcase: ['M4 7h16v12H4z', 'M9 7V4h6v3', 'M4 12h16', 'M10 12v2h4v-2'],
  book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z', 'M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z'],
  activity: ['M3 12h4l2-6 4 12 2-6h6'],
  bike: ['M6 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M18 18a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'm6 14 4-7h3l5 7', 'M9 9h7', 'm14 5 2 2'],
  shopping: ['M3 4h2l2 11h10l3-8H6', 'M9 20h.01', 'M17 20h.01'],
  sparkles: ['m12 3 1.1 3.2L16 8l-2.9 1.8L12 13l-1.1-3.2L8 8l2.9-1.8z', 'm5 14 .8 2.2L8 17.5l-2.2 1.3L5 21l-.8-2.2L2 17.5l2.2-1.3z', 'm19 13 .6 1.6 1.4.9-1.4.9L19 18l-.6-1.6-1.4-.9 1.4-.9z'],
  location: ['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  weather: ['M7 15a4 4 0 1 1 1.2-7.8A5.5 5.5 0 0 1 18.7 9 3 3 0 0 1 18 15Z', 'M12 2v2', 'm4.9 4.9 1.4 1.4', 'M2 12h2', 'm19.1 4.9-1.4 1.4', 'M20 12h2'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  arrow: ['M5 12h14', 'm14 7 5 5-5 5'],
  plus: ['M12 5v14', 'M5 12h14'],
  share: ['M8 12v7h11V8h-4', 'm12 3 4 4-4 4', 'M16 7H8a3 3 0 0 0-3 3v2'],
  check: ['m5 12 4 4L19 6'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'm6 7 1 10h10l1-10', 'M10 11v5', 'M14 11v5'],
  microphone: ['M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3', 'M9 21h6'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', 'm9 12 2 2 4-5'],
  earthquake: ['M3 12h4l2-5 3 10 3-7 2 4h4', 'M5 4l3 2 2-3 3 3 3-2 3 3', 'M4 20h16'],
}

export function Icon({ name, size = 20, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      {iconPaths[name].map((path) => (
        <path
          d={path}
          key={path}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ))}
    </svg>
  )
}
