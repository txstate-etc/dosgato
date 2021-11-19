/**
 * These types are shared with dosgato-templating. They probably need moved
 * to a central location at some point.
 */

export interface ComponentData {
  templateKey: string
  areas: Record<string, ComponentData[]>
}

export interface PageData extends ComponentData {
  savedAtVersion: Date
}
