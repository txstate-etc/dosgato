import crypto from 'crypto'
import { FastifyRequest } from 'fastify'
import { fileTypeStream } from 'file-type'
import fs, { promises as fsp } from 'fs'
import { lookup } from 'mime-types'
import { nanoid } from 'nanoid'
import { dirname } from 'path'
import stream from 'stream'
import * as util from 'util'
import { makeSafe } from '../internal.js'
const pipelinep = util.promisify(stream.pipeline)

export async function handleUpload (req: FastifyRequest) {
  const data: any = {}
  const files = []
  for await (const part of req.parts()) {
    if (part.file) {
      const tempName = nanoid(10)
      const fileTypePassthru = await fileTypeStream(part.file)
      const hash = crypto.createHash('sha1')
      const hashingPassthru = new stream.PassThrough()
      hashingPassthru.on('data', (chunk) => hash.update(chunk))
      await pipelinep(fileTypePassthru.pipe(hashingPassthru), fs.createWriteStream(`/files/tmp/${tempName}`))
      const checksum = hash.digest('hex')
      const { mime } = fileTypePassthru.fileType ?? { ext: '', mime: part.mimetype }
      let name = part.filename
      const extFromFileName = name.match(/\.(\w+)$/)?.[1]
      if (extFromFileName && lookup(extFromFileName)) name = name.replace(new RegExp('\\.' + extFromFileName + '$'), '')
      await fsp.rename(`/files/tmp/${tempName}`, `/files/tmp/${checksum}`)
      files.push({ name: makeSafe(name), shasum: checksum, mime, size: part.file.bytesRead })
    } else {
      data[part.fieldname] = (part as any).value
    }
  }
  return { files, data }
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
