import { createHash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { access, constants, mkdir, rename, unlink } from 'fs/promises'
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

  async put (stream: Readable) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha256')
    let size = 0
    stream.on('data', (data: Buffer) => { hash.update(data); size += data.length })
    try {
      await pipeline(stream, createWriteStream(tmp))
      const checksum = hash.digest('base64url')
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
      await unlink(filepath); return
    } catch (e: any) {
      if (e.code === 'ENOENT') console.warn('Tried to delete file with checksum', checksum, 'but it did not exist.')
      else console.warn(e)
    }
  }
}

export const fileHandler = new FileSystemHandler()
