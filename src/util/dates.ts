import { type DateTime } from 'luxon'

export function formatSavedAtVersion (datetime: DateTime) {
  return datetime.toFormat('yLLddHHmmss')
}
