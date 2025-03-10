import { createHash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { access, constants, mkdir, rename, unlink, stat } from 'fs/promises'
import { nanoid } from 'nanoid'
import { dirname } from 'path'
import { type Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { rescue } from 'txstate-utils'

interface FileHandler {
  init: () => Promise<void>
  put: (stream: Readable) => Promise<{ checksum: string, size: number }> // returns a checksum
  get: (checksum: string) => Readable
  remove: (checksum: string) => Promise<void>
}

class FileSystemHandler implements FileHandler {
  #getTmpLocation () {
    return `/files/tmp/${nanoid()}`
  }

  #getFileLocation (checksum: string) {
    return `/files/storage/${checksum.slice(0, 1)}/${checksum.slice(1, 2)}/${checksum.slice(2)}`
  }

  async #moveToPerm (tmp: string, checksum: string) {
    const checksumpath = this.#getFileLocation(checksum)
    await mkdir(dirname(checksumpath), { recursive: true })
    await rename(tmp, checksumpath)
  }

  async init () {
    await mkdir('/files/tmp', { recursive: true })
    await mkdir('/files/storage', { recursive: true })
  }

  get (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    const stream = createReadStream(filepath)
    return stream
  }

  async exists (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    return (await rescue(access(filepath, constants.R_OK), false)) ?? true
  }

  async fileSize (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    const info = await stat(filepath)
    return info.size
  }

  async put (stream: Readable) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha256')
    let size = 0
    stream.on('data', (data: Buffer) => { hash.update(data); size += data.length })
    try {
      const out = createWriteStream(tmp)
      const flushedPromise = new Promise((resolve, reject) => {
        out.on('close', resolve as () => void)
        out.on('error', reject)
      })
      await pipeline(stream, out)
      await flushedPromise
      const checksum = hash.digest('base64url')
      const rereadhash = createHash('sha256')
      const read = createReadStream(tmp)
      for await (const chunk of read) {
        rereadhash.update(chunk)
      }
      const rereadsum = rereadhash.digest('base64url')
      if (rereadsum !== checksum) throw new Error('File did not write to disk correctly. Please try uploading again.')
      await this.#moveToPerm(tmp, checksum)
      return { checksum, size }
    } catch (e: any) {
      await rescue(unlink(tmp))
      throw e
    }
  }

  async remove (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    try {
      await unlink(filepath)
    } catch (e: any) {
      if (e.code === 'ENOENT') console.warn('Tried to delete file with checksum', checksum, 'but it did not exist.')
      else console.warn(e)
    }
  }
}

export const fileHandler = new FileSystemHandler()
