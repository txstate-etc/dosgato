import { Operation } from 'fast-json-patch'

interface VersionedCommon {
  id: string
  type: string
  version: number
  created: Date
  createdBy: string
  modified: Date
  modifiedBy: string
  comment: string
}
export interface Versioned extends VersionedCommon {
  data: any
}
export interface VersionedStorage extends VersionedCommon {
  data: string
}

interface VersionCommon {
  id: string
  version: number
  date: Date
  user: string
}

export interface VersionStorage extends VersionCommon {
  undo: string
}

export interface Version extends VersionCommon {
  undo: Operation[]
  tags: string[]
}

export interface Tag {
  id: string
  version: number
  tag: string
}

export interface Index {
  name: string
  values: string[]
}

export interface IndexStorage {
  id: string
  version: number
  name: string
  value: string
}

export class NotFoundError extends Error {
  constructor (message?: string) {
    super(message ?? 'Object not found.')
  }
}
