import axios from 'axios'
import jwt from 'jsonwebtoken'

const token = jwt.sign({ login: 'su01' }, process.env.JWT_SECRET ?? '')

const client = axios.create({
  baseURL: 'http://dosgato-api',
  headers: {
    Authorization: `Bearer ${token}`
  }
})

export async function query (query: string, variables?: any) {
  try {
    const resp = await client.post('graphql', {
      query,
      ...(variables ? { variables } : {})
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
