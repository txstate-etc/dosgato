import axios from 'axios'

const client = axios.create({
  baseURL: 'http://dosgato-api'
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
