import { Duplex, PassThrough, Readable, Transform, Writable } from 'stream'
import { pipeline } from 'stream/promises'
import { extract, pack } from 'tar-stream'
import { createGunzip, createGzip } from 'zlib'

export interface GZipFile {
  fileName: string
  content: Buffer
}

export function readTarGz (inputStream: Readable) {
  const gunzip = createGunzip()
  const tarExtractor = extract()
  const output = new Readable({ objectMode: true })
  tarExtractor.on('entry', async (header, stream, next) => {
    if (header.type !== 'file') return
    const bufs: Buffer[] = []
    for await (const chunk of stream) bufs.push(chunk)
    const buf = Buffer.concat(bufs)
    output.push({ fileName: header.name, content: buf })
    next()
  })
  pipeline(inputStream, gunzip, tarExtractor).then(() => output.push(null)).catch(e => output.destroy(e))
  return output
}

export function tarGzStream () {
  const output = new Transform({
    transform (data, encoding, next) {
      next(undefined, data)
    }
  })
  const gzip = createGzip()
  gzip.on('error', e => output.destroy(e))
  const tarPacker = pack()
  tarPacker.on('error', e => gzip.destroy(e))
  const input = new Readable({
    objectMode: true
  })
  input._read = () => {}
  input.on('data', (data: { fileName: string, content: Buffer }) => {
    tarPacker.entry({ name: data.fileName, type: 'file', size: data.content.length }, data.content)
  })
  input.on('error', e => tarPacker.destroy(e))
  input.on('close', () => {
    tarPacker.finalize()
  })
  tarPacker.pipe(gzip).pipe(output)
  return { input, output }
}
