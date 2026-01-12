import axios from 'axios'
import jwt from 'jsonwebtoken'
import FormData from 'form-data'
import fs from 'fs'
import AgentKeepAlive from 'agentkeepalive'
import { expect } from 'chai'

const client = axios.create({
  baseURL: 'http://dosgato-api',
  httpAgent: new AgentKeepAlive(),
  timeout: 10000
})

export async function query <T = any> (query: string, variables?: any) {
  return await queryAs<T>('su01', query, variables)
}

const tokenCache: Record<string, string> = {}
export async function queryAs <T = any> (login: string, query: string, variables?: any) {
  tokenCache[login] ??= jwt.sign({ sub: login }, process.env.JWT_SECRET ?? '')
  try {
    const resp = await client.post('graphql', {
      query,
      ...(variables ? { variables } : {})
    }, {
      headers: {
        authorization: `Bearer ${tokenCache[login]}`
      }
    })
    expect(resp.data.errors?.length ?? 0).to.equal(0, resp.data.errors?.[0].message)
    return resp.data.data as T
  } catch (e: any) {
    if (!e.response) throw e
    throw new Error(JSON.stringify(e.response.data, undefined, 2))
  }
}

export async function createRole (input: { name: string, description?: string, siteId?: string }, username?: string) {
  const { createRole: { success, role, messages } } = await queryAs((username ?? 'su01'), 'mutation CreateRole ($input: RoleInput!) { createRole (input: $input) { success messages { message } role { id name description site { id } } } }', { input })
  return { success, role, messages }
}

export async function postMultipart (endpoint: string, payload: any, filepath: string, login: string) {
  tokenCache[login] ??= jwt.sign({ sub: login }, process.env.JWT_SECRET ?? '')
  try {
    const formdata = new FormData()
    formdata.append('data', JSON.stringify(payload))
    formdata.append('uploads', fs.createReadStream(filepath))
    const config = {
      headers: {
        ...formdata.getHeaders(),
        authorization: `Bearer ${tokenCache[login]}`
      }
    }
    return (await client.post(endpoint, formdata, config)).data
  } catch (err: any) {
    console.error(err)
    throw new Error('Could not post form data')
  }
}
