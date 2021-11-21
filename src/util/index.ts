export function normalizePath (path: string) {
  return (path.startsWith('/') ? '' : '/') + (path.endsWith('/') ? path.substr(0, -1) : path)
    .replace(/[^/]*\/\.\./, '').replace(/\/+/, '/')
    .replace(/\.\w{1,12}$/i, '')
}
