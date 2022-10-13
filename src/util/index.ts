import path from 'path'
import { isNotBlank } from 'txstate-utils'

export * from './authservice.js'
export * from './indexing.js'
export * from './migrations.js'
export * from './registry.js'
export * from './rules.js'
export * from './scheduler.js'
export * from './mutationlogger.js'
export * from './dates.js'
export * from './login.js'

export function normalizePath (path: string) {
  return (path.startsWith('/') ? '' : '/') + (path.endsWith('/') ? path.substr(0, -1) : path)
    .replace(/[^/]*\/\.\./, '').replace(/\/+/, '/')
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
