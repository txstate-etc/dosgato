import { createHash } from 'crypto'
import { createReadStream, createWriteStream } from 'fs'
import { mkdir, rename } from 'fs/promises'
import { nanoid } from 'nanoid'
import { dirname } from 'path'
import sharp from 'sharp'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'

interface FileHandler {
  init: () => Promise<void>
  put: (stream: Readable) => Promise<string> // returns a checksum
  get: (checksum: string) => Readable
  sharp: (checksum: string, opts?: sharp.SharpOptions) => sharp.Sharp
  sharpWrite: (img: sharp.Sharp) => Promise<{ checksum: string, info: sharp.OutputInfo }> // returns a checksum
}

class FileSystemHandler implements FileHandler {
  #getTmpLocation () {
    return `/files/tmp/${nanoid()}`
  }

  #getFileLocation (checksum: string) {
    return `/files/storage/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${checksum.slice(4)}`
  }

  async #moveToPerm (tmp: string, checksum: string) {
    const checksumpath = this.#getFileLocation(checksum)
    await mkdir(dirname(checksumpath), { recursive: true })
    await rename(tmp, checksumpath)
  }

  async init () {
    await mkdir('/files/tmp', { recursive: true })
  }

  get (checksum: string) {
    const filepath = this.#getFileLocation(checksum)
    const stream = createReadStream(filepath)
    return stream
  }

  async put (stream: Readable) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha1')
    stream.on('data', data => hash.update(data))
    await pipeline(stream, createWriteStream(tmp))
    const checksum = hash.digest('hex')
    await this.#moveToPerm(tmp, checksum)
    return checksum
  }

  sharp (checksum: string, opts?: sharp.SharpOptions) {
    const filepath = this.#getFileLocation(checksum)
    return sharp(filepath, opts)
  }

  async sharpWrite (img: sharp.Sharp) {
    const tmp = this.#getTmpLocation()
    const hash = createHash('sha1', { encoding: 'hex' })
    await pipeline(img.clone(), hash)
    const checksum = hash.read()
    const info = await img.toFile(tmp)
    await this.#moveToPerm(tmp, checksum)
    return { checksum, info }
  }
}

export const fileHandler = new FileSystemHandler()
