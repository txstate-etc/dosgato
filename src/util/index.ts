import path from 'path'
import { isNotBlank } from 'txstate-utils'

export * from './authservice'
export * from './indexing'
export * from './migrations'
export * from './registry'
export * from './rules'
export * from './sharedtypes'
export * from './mutationlogger'
export * from './filehandler'
export * from './dates'

export function normalizePath (path: string) {
  return (path.startsWith('/') ? '' : '/') + (path.endsWith('/') ? path.substr(0, -1) : path)
    .replace(/[^/]*\/\.\./, '').replace(/\/+/, '/')
    .replace(/\.\w{1,12}$/i, '')
}

export function appendPath (a: string, b: string) {
  return `${a}${a === '/' ? '' : '/'}${b}`
}

export function popPath (path: string) {
  return `/${path.split('/').filter(isNotBlank).slice(0, -1).join('/')}`
}

export function basename (p: string) {
  return path.basename(p)
}
