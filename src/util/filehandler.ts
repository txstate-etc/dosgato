import { FastifyRequest, FastifyReply } from 'fastify'
import crypto from 'crypto'
import * as util from 'util'
import stream from 'stream'
import { nanoid } from 'nanoid'
import fs, { promises as fsp } from 'fs'
import { dirname } from 'path'
const pipelinep = util.promisify(stream.pipeline)

export async function handleUpload (req: FastifyRequest, res: FastifyReply) {
  const files = []
  const parts = req.files()
  for await (const part of parts) {
    const hash = crypto.createHash('sha1').setEncoding('hex')
    const tempName = nanoid(10)
    await pipelinep(part.file, fs.createWriteStream(`/files/tmp/${tempName}`))
    await pipelinep(fs.createReadStream(`/files/tmp/${tempName}`), hash)
    const checksum = hash.read()
    await fsp.rename(`/files/tmp/${tempName}`, `/files/tmp/${checksum}`)
    files.push({ filename: part.filename, shasum: checksum, mime: part.mimetype, size: part.file.bytesRead })
  }
  return files
}

interface FileHandler {
  moveToPermLocation: (checksum: string) => Promise<void> // TODO: what should it return?
  getFileLocation: (checksum: string) => string
  getFile: (checksum: string) => Promise<void> // TODO: what should it return? The binary? and metadata?
}

export const FileSystemHandler: FileHandler = {
  async moveToPermLocation (checksum: string) {
    const checksumpath = this.getFileLocation(checksum)
    await fsp.mkdir(dirname(checksumpath), { recursive: true })
    await fsp.rename(`/files/tmp/${checksum}`, checksumpath)
  },
  getFileLocation (checksum: string) {
    return `/files/storage/${checksum.slice(0, 2)}/${checksum.slice(2, 4)}/${checksum.slice(4)}`
  },
  async getFile (checksum: string) {
    const checksumpath = this.getFileLocation(checksum)
    // TODO: Should this just send back the path? Do we need another RESTful endpoint for downloading the file?
  }
}

export const ObjectStorageHandler: FileHandler = {
  async moveToPermLocation (checksum: string) {
    // put the file in a bucket
  },
  getFileLocation (checksum: string) {
    // determine where to put the file, based on the checksum. Is there just one bucket? Multiple buckets?
    return ''
  },
  async getFile (checksum: string) {
    // Use the checksum to find the file and return it
  }
}
