import axios from 'axios'
import jwt from 'jsonwebtoken'
import FormData from 'form-data'
import fs from 'fs'

const client = axios.create({
  baseURL: 'http://dosgato-api'
})

export async function query (query: string, variables?: any) {
  return await queryAs('su01', query, variables)
}

const tokenCache: Record<string, string> = {}
export async function queryAs (login: string, query: string, variables?: any) {
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
    if (resp.data.errors?.length) throw new Error(resp.data.errors[0].message)
    return resp.data.data
  } catch (e: any) {
    if (!e.response) throw e
    throw new Error(JSON.stringify(e.response.data, undefined, 2))
  }
}

export async function createRole (name: string, username?: string) {
  const { createRole: { success, role, messages } } = await queryAs((username ?? 'su01'), 'mutation CreateRole ($name: String!) { createRole (name: $name) { success messages { message } role { id name } } }', { name })
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
    console.log(err)
    throw new Error('Could not post form data')
  }
}
