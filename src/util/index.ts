export * from './authservice'
export * from './indexing'
export * from './migrations'
export * from './registry'
export * from './rules'
export * from './sharedtypes'
export * from './mutationlogger'
export * from './filehandler'

export function normalizePath (path: string) {
  return (path.startsWith('/') ? '' : '/') + (path.endsWith('/') ? path.substr(0, -1) : path)
    .replace(/[^/]*\/\.\./, '').replace(/\/+/, '/')
    .replace(/\.\w{1,12}$/i, '')
}

export function appendPath (a: string, b: string) {
  return `${a}${a === '/' ? '' : '/'}${b}`
}
