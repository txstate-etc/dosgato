import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { Queue } from 'txstate-utils'
import { createGunzip, createGzip } from 'zlib'

export function jsonlGzStream () {
  const gzip = createGzip()
  return {
    push: async function (obj: any) {
      const keepgoing = gzip.write(Buffer.from(JSON.stringify(obj) + '\n', 'utf8'))
      if (!keepgoing) await new Promise(resolve => gzip.once('drain', resolve))
    },
    done: () => {
      gzip.end()
    },
    output: gzip,
    error: (e: any) => {
      gzip.destroy(e)
    }
  }
}

export function gzipJsonLToJSON (input: Readable) {
  const gunzip = createGunzip()
  const output = new Readable({ objectMode: true })
  const backlog = new Queue()
  output._read = () => { output.emit('read') }
  let buffer = ''
  gunzip.on('data', (chunk: Buffer) => {
    if (output.destroyed) return
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      try {
        if (line.trim().length) backlog.enqueue(JSON.parse(line))
      } catch (e: any) {
        if (!input.destroyed) input.destroy(e)
        output.destroy(e)
      }
    }
    let keepgoing = true
    while (backlog.size && keepgoing) {
      keepgoing = output.push(backlog.dequeue())
    }
    if (backlog.size) {
      gunzip.pause()
      const onresume = () => {
        keepgoing = true
        while (backlog.size && keepgoing) keepgoing = output.push(backlog.dequeue())
        if (backlog.size) output.once('read', onresume)
        else gunzip.resume()
      }
      output.once('read', onresume)
    }
  })
  gunzip.on('end', () => {
    try {
      if (buffer.trim().length) output.push(JSON.parse(buffer))
    } catch (e: any) {
      output.destroy(e)
    }
    output.push(null)
  })
  pipeline(input, gunzip).catch(e => { output.destroy(e) })
  return output
}
