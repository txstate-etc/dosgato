import { expect } from 'chai'
import { query } from '../common'

describe('groups', () => {
  it('should retrieve all groups', async () => {
    const resp = await query('{ groups { id name } }')
    expect(resp.data.groups.length).to.equal(5)
  })
})
