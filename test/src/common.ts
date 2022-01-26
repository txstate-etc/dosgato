import axios from 'axios'
import jwt from 'jsonwebtoken'

const client = axios.create({
  baseURL: 'http://dosgato-api'
})

export async function query (query: string, variables?: any) {
  return await queryAs('su01', query, variables)
}

const tokenCache: Record<string, string> = {}
export async function queryAs (login: string, query: string, variables?: any) {
  tokenCache[login] ??= jwt.sign({ login: login }, process.env.JWT_SECRET ?? '')
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
  } catch (e) {
    if (axios.isAxiosError(e)) {
      if (!e.response) throw e
      throw new Error(JSON.stringify(e.response.data, undefined, 2))
    }
  }
}
