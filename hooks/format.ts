// Time and count labels shown on the board (pt-BR UI copy).

const MINUTE_MS = 60_000

const pad = (value: number): string => String(value).padStart(2, '0')

export const shortDate = (iso: string): string => {
  const time = Date.parse(iso)
  if (!iso || Number.isNaN(time)) return ''
  const date = new Date(time)
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`
}

export const relativeTime = (iso: string, now: number): string => {
  const time = Date.parse(iso)
  if (!iso || Number.isNaN(time)) return ''
  const minutes = Math.round((now - time) / MINUTE_MS)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return days === 1 ? 'ontem' : `há ${days} dias`
  return shortDate(iso)
}

export const countSessions = (count: number): string => (count === 1 ? '1 sessão' : `${count} sessões`)
