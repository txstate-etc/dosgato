import { templateRegistry, type Page } from '../internal'

export type EventInfo = PublishEvent | UnpublishEvent

export interface PublishEvent {
  type: 'publish'
  page: Page
}

export interface UnpublishEvent {
  type: 'unpublish'
  page: Page
}

export async function fireEvent (ev: EventInfo) {
  try {
    await templateRegistry.serverConfig.onEvent?.(ev)
  } catch (e: any) {
    console.error(e)
  }
}
