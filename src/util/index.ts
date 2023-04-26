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
export * from './zip.js'

export function normalizePath (path: string) {
  path = path.trim().toLocaleLowerCase()
  return (path.startsWith('/') ? '' : '/') + (path.endsWith('/') ? path.substring(0, path.length - 1) : path)
    .replace(/[^/]*\/\.\./, '').replace(/\/+/, '/')
}

export function parsePath (path: string) {
  path = normalizePath(path)
  return {
    path: path.replace(/\.\w{1,12}$/i, ''),
    extension: path.includes('.') ? path.replace(/^.*?\.(\w{1,12})$/i, '$1') || undefined : undefined
  }
}

export function normalizeHost (host: string) {
  return host
}

export function appendPath (a: string, b: string) {
  return `${a}${a === '/' ? '' : '/'}${b}`
}

export function popPath (path: string) {
  return `/${path.split('/').filter(isNotBlank).slice(0, -1).join('/')}`
}

/**
 * removes the leading directory from a path
 *
 * must begin with a / or else it will remove two directories
 */
export function shiftPath (path: string) {
  return '/' + path.split('/').slice(2).join('/')
}

export function basename (p: string) {
  return path.basename(p)
}

export function numerate (name: string) {
  if (/\d+$/.test(name)) return name.replace(/(\d+)$/, num => String(Number(num) + 1).padStart(num.length, '0'))
  return name.replace(/[._\s-]+$/, '') + '-1'
}

export function numerateBasedOnExisting (base: string, usedNames: string[]) {
  let maxArchiveNum: number | undefined
  for (const n of usedNames) {
    const m = n.match(new RegExp(base + '(-(\\d+))?$'))
    if (m) {
      const num = m[2] ? Number(m[2]) : 1
      if (maxArchiveNum == null || num > maxArchiveNum) maxArchiveNum = num
    }
  }
  return base + (maxArchiveNum != null ? '-' + String(maxArchiveNum + 1) : '')
}
