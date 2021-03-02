import { expect } from 'chai'
import { VersionedService, NotFoundError } from '../src/versionedservice'

const homePage: any = {
  title: 'Texas State University',
  hideTitle: false,
  sections: [
    {
      title: 'First Section',
      layouts: [
        {
          title: 'One Column Layout',
          content: [
            {
              type: 'button',
              title: 'Click Here',
              color: 'color1',
              url: 'https://www.txstate.edu'
            },
            {
              type: 'icontext',
              icon: 'fa-themeisle',
              color: 'color3',
              link: 'https://www.google.com'
            }
          ]
        }
      ]
    }
  ]
}

before(async () => {
  try {
    await VersionedService.init()
  } catch (err) {
    console.log(err)
  }
})

describe('versionedservice', () => {
  const versionedService = new VersionedService()

  it('should store a JSON object', async () => {
    const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }], 'username')
    expect(id).to.have.length(10)
  })

  it('should store a JSON object with no user', async () => {
    const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
    expect(id).to.have.length(10)
  })

  it('should return a NotFoundError for an object that does not exist', async () => {
    try {
      await versionedService.get('invalid')
    } catch (err) {
      expect(err).to.be.instanceOf(NotFoundError)
    }
  })

  it('should retrieve an object from storage', async () => {
    const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
    const obj = await versionedService.get(id)
    if (obj) {
      expect(obj).to.have.property('data')
      expect(JSON.parse(obj.data)).to.have.property('icon')
    } else {
      expect.fail('Object should have been found')
    }
  })

  it.skip('should retrieve an object with a specific version from storage', async () => { })

  it.skip('should should tag a specific version of an object', async () => { })

  it.skip('should retrieve an object with a specific tag from storage', async () => { })

  it.skip('should return undefined if a requested tag does not exist for the requested object', async () => { })

  it.skip('should update an object in storage', async () => { })

  it.skip('should return a NotFoundError when trying to update an object that does not exist', async () => { })

  it.skip('should restore a previous version of an object', async () => { })

  it.skip('should return a NotFoundError when trying to restore an object that does not exist', async () => { })

  it.skip('should restore a previous version of an object and update the indexes', async () => { })

  it.skip('should restore a previous version of an object and include a user', async () => { })

  it.skip('should restore a previous version of an object and include a comment', async () => { })

  it.skip('should delete an object and its entire version history', async () => { })

  it.skip('should delete an object and its entire version history', async () => { })

  it.skip('should should tag a specific version of an object', async () => { })

  it.skip('should return a NotFoundError when trying to tag an object that does not exist', async () => { })

  it.skip('should not allow versions to be manually tagged as latest', async () => { })

  it.skip('should only allow a tag to be used on one version of an object at a time', async () => { })


})
