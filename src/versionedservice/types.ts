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
  comment: string
}

export interface VersionStorage extends VersionCommon {
  undo: string
}

export interface Version extends VersionCommon {
  tags: string[]
}

export interface Tag {
  id: string
  version: number
  tag: string
  user: string
  date: Date
}

export interface Index {
  name: string
  values: string[]
}

export interface IndexStorage {
  id: string
  version: number
  name: string
  value_id: number
}

export interface IndexJoinedStorage extends IndexStorage {
  value: string
}

export class NotFoundError extends Error {
  constructor (message?: string) {
    super(message ?? 'Object not found.')
  }
}

export class UpdateConflictError extends Error {
  constructor (id: string) {
    super(`Unable to update object with id: ${id}. Another user has updated the object since you loaded it.`)
  }
}