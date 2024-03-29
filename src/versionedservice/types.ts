export interface VersionedCommon {
  id: number
  type: string
  version: number
  created: Date
  createdBy: string
  modified: Date
  modifiedBy: string
  markedAt?: Date
  comment: string
}
export interface Versioned<DataType = any> extends VersionedCommon {
  data: DataType
}
export interface VersionedStorage extends VersionedCommon {
  data: string
}

interface VersionCommon {
  id: number
  version: number
  date: Date
  user: string
  comment: string
  markedAt?: Date
}

export interface VersionStorage extends VersionCommon {
  undo: string
}

export interface Version extends VersionCommon {
  tags: string[]
}

export interface Tag {
  id: number
  version: number
  tag: string
  user: string
  date: Date
}

export interface Index {
  name: string
  values: (string | number)[]
}
export interface IndexStringified {
  name: string
  values: string[]
}

export interface IndexStorage {
  id: number
  version: number
  name_id: number
  name: string
  value_id: number
}

export interface IndexJoinedStorage extends IndexStorage {
  value: string
}

export interface SearchBaseRule {
  indexName: string
}
export interface SearchGreaterRule extends SearchBaseRule {
  greaterThan: string | number
  orEqual?: boolean
}
export interface SearchLessRule extends SearchBaseRule {
  lessThan: string | number
  orEqual?: boolean
}
export interface SearchEqualRule extends SearchBaseRule {
  equal: string | number
}
export interface SearchNotEqualRule extends SearchBaseRule {
  notEqual: string | number
}
export interface SearchInRule extends SearchBaseRule {
  in: (string | number)[]
}
export interface SearchNotInRule extends SearchBaseRule {
  notIn: (string | number)[]
}
export interface SearchStartsWithRule extends SearchBaseRule {
  startsWith: string | number
}
export type SearchRule = SearchEqualRule | SearchNotEqualRule | SearchInRule | SearchNotInRule | SearchGreaterRule | SearchLessRule | SearchStartsWithRule

export class NotFoundError extends Error {
  constructor (message?: string) {
    super(message ?? 'Object not found.')
  }
}

export class UpdateConflictError extends Error {
  constructor (id: number) {
    super(`Unable to update object with id: ${id}. Another user has updated the object since you loaded it.`)
  }
}
