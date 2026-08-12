import axios from 'axios'
import { expect } from 'chai'
import jwt from 'jsonwebtoken'
import { HttpAgent } from 'agentkeepalive'
import { query } from '../common.js'

const client = axios.create({
  baseURL: 'http://dosgato-api',
  httpAgent: new HttpAgent(),
  timeout: 10000,
  validateStatus: () => true
})

const su01Token = jwt.sign({ iss: 'jwt-secret', sub: 'su01' }, process.env.JWT_SECRET ?? '')

describe('unauthenticated asset retrieval', () => {
  let bobcat: { id: string, filename: string }
  let deletedBobcat: { id: string, filename: string }
  before(async () => {
    // an earlier test renames the bobcat asset, so look it up by path, which is case-insensitive
    const { assets } = await query('{ assets(filter: { paths: ["/site1/bobcat"] }) { id name filename } }')
    bobcat = assets[0]
    const { assets: deletedAssets } = await query('{ assets(filter: { names: ["anotherbobcat"], deleteStates: [DELETED] }) { id name filename } }')
    deletedBobcat = deletedAssets[0]
    expect(bobcat).to.not.be.undefined
    expect(deletedBobcat).to.not.be.undefined
  })
  it('should serve a published asset by path without authentication', async () => {
    const resp = await client.get('/assets/site1/bobcat.jpg')
    expect(resp.status).to.equal(200)
    expect(resp.headers['content-type']).to.equal('image/jpeg')
    expect(resp.data.length).to.be.greaterThan(0)
  })
  it('should serve a published asset by id without authentication', async () => {
    const resp = await client.get(`/assets/${bobcat.id}/${bobcat.filename}`)
    expect(resp.status).to.equal(200)
    expect(resp.headers['content-type']).to.equal('image/jpeg')
  })
  it('should serve a width-limited variant without authentication', async () => {
    const resp = await client.get(`/assets/${bobcat.id}/w/400/${bobcat.filename}`)
    expect(resp.status).to.equal(200)
    expect(resp.headers['content-type']).to.match(/^image\//)
  })
  it('should reach the resize route without authentication', async () => {
    // a bogus resize id should make it to the handler and 404 instead of being rejected with a 401
    const resp = await client.get(`/assets/${bobcat.id}/resize/notarealresize/${bobcat.filename}`)
    expect(resp.status).to.equal(404)
  })
  it('should reach the legacy routes without authentication', async () => {
    const resp = await client.get('/assets/legacy/notarealid')
    expect(resp.status).to.equal(404)
    const resp2 = await client.get('/assets/legacy/notarealid/image.jpg')
    expect(resp2.status).to.equal(404)
  })
  it('should hide deleted assets from anonymous visitors', async () => {
    const resp = await client.get(`/assets/${deletedBobcat.id}/${deletedBobcat.filename}`)
    expect(resp.status).to.equal(404)
  })
  it('should still honor tokens on asset routes so editors can retrieve deleted assets', async () => {
    const resp = await client.get(`/assets/${deletedBobcat.id}/${deletedBobcat.filename}`, { headers: { authorization: `Bearer ${su01Token}` } })
    expect(resp.status).to.equal(200)
    expect(resp.headers['content-type']).to.equal('image/jpeg')
  })
  it('should require authentication for zip downloads', async () => {
    const resp = await client.get('/assets/zip/1/site1.zip')
    expect(resp.status).to.equal(401)
    // with a token the request should make it past authentication to the handler
    const resp2 = await client.get('/assets/zip/notarealfolder/site1.zip', { headers: { authorization: `Bearer ${su01Token}` } })
    expect(resp2.status).to.equal(404)
  })
})
