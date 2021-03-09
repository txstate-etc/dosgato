import { expect } from 'chai'
import { compare } from 'fast-json-patch'
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
  let versionedService: VersionedService

  beforeEach(() => {
    versionedService = new VersionedService()
  })

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
      expect(obj.data).to.have.property('title')
    } else {
      expect.fail('Object should have been found')
    }
  })

  it('should retrieve the indexes associated with a particular version of an object', async () => {
    const indexes = [{ name: 'index1', values: ['one', 'two'] }, { name: 'index2', values: ['three'] }]
    const id = await versionedService.create('testdata', { size: 'large', color: 'red' }, indexes)
    const obj = await versionedService.get(id)
    if (obj) {
      const objIndexes = await versionedService.getIndexes(id, obj.version)
      const diff = compare(indexes, objIndexes)
      expect(diff.length).to.equal(0)
    } else {
      expect.fail('Object should have been found')
    }
  })

  it('should update an object in storage', async () => {
    const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
    const obj = await versionedService.get(id)
    if (obj) {
      const indexes = await versionedService.getIndexes(id, obj.version)
      await versionedService.update(id, { ...homePage, title: 'Updated Home Page' }, indexes)
      const updatedObj = await versionedService.get(id)
      if (updatedObj) {
        expect(updatedObj.data).to.have.property('title')
        expect(updatedObj.data.title).to.equal('Updated Home Page')
        expect(updatedObj.version).to.equal(2)
      } else {
        expect.fail('Object should have been found')
      }
    } else {
      expect.fail('Object should have been found')
    }
  })

  it('should retrieve an object with a specific version from storage', async () => {
    const indexes = [{ name: 'index3', values: ['test'] }]
    const data = { name: 'Person A', age: 16, canVote: false }
    const id = await versionedService.create('testobject', data, indexes)
    const obj = await versionedService.get(id)
    if (obj) {
      data.age = 17
      await versionedService.update(id, data, indexes)
      data.age = 18
      data.canVote = true
      await versionedService.update(id, data, indexes)
      const optional = { version: 2 }
      const obj2 = await versionedService.get(id, optional)
      if (obj2) {
        expect(obj2.data.age).to.equal(17)
        expect(obj2.data.canVote).to.equal(false)
      } else {
        expect.fail('Object should have been found')
      }
    } else {
      expect.fail('Object should have been found')
    }
  })

  it('should should tag a specific version of an object', async () => {
    const indexes = [{ name: 'index4', values: ['apple', 'orange'] }]
    const data = { title: 'Hello World', color: 'red', size: 'extra medium' }
    const id = await versionedService.create('testdata', data, indexes)
    await versionedService.tag(id, 'published', 1, 'username')
    const result = await versionedService.getTag(id, 'published')
    expect(result).to.have.property('tag')
    expect(result?.tag).to.equal('published')
    expect(result?.version).to.equal(1)
  })

  it('should retrieve an object with a specific tag from storage', async () => {
    const indexes = [{ name: 'index5', values: ['cat', 'dog'] }]
    const data = { name: 'Earth', hasWater: true, numMoons: 1 }
    const id = await versionedService.create('planet', data, indexes)
    await versionedService.tag(id, 'approved', 1, 'username')
    const obj = await versionedService.get(id, { tag: 'approved' })
    expect(obj?.data).to.have.property('name')
    expect(obj?.data.name).to.equal('Earth')
  })

  it('should not allow versions to be manually tagged as latest', async () => {
    const indexes = [{ name: 'index6', values: ['component'] }]
    const data = { name: 'Chocolate chip', ingredients: ['flour, butter', 'chocolate chips', 'sugar', 'eggs', 'vanilla'] }
    const id = await versionedService.create('cookie', data, indexes)
    try {
      await versionedService.tag(id, 'latest', 1, 'username')
    } catch (err) {
      // check for specific error message?
      expect(err.message.length).to.be.greaterThan(0)
    }
  })

  it('should return undefined if a requested tag does not exist for the requested object', async () => {
    const indexes = [{ name: 'index7', values: ['test'] }]
    const data = { name: 'Snickerdoodle', ingredients: ['flour', 'sugar', 'butter', 'eggs', 'cream of tartar', 'cinnamon'] }
    const id = await versionedService.create('cookie', data, indexes)
    const obj = await versionedService.get(id, { tag: 'invalidtag' })
    expect(obj).to.equal(undefined)
  })

  it('should return a NotFoundError when trying to update an object that does not exist', async () => {
    try {
      await versionedService.update('doesnotexist', { name: 'blueberry', isFruit: true, color: 'purple' }, [{ name: 'index8', values: ['anything'] }])
    } catch (err) {
      expect(err).to.be.instanceOf(NotFoundError)
    }
  })

  it('should restore a previous version of an object', async () => {
    const indexes = [{ name: 'index8', values: ['does', 'not', 'matter', 'here'] }]
    const data = { name: 'peanut butter', ingredients: ['flour', 'sugar', 'butter', 'peanut butter', 'eggs'] }
    const id = await versionedService.create('cookie', data, indexes)
    await versionedService.update(id, { ...data, name: 'peanut butter cookie', nutfree: false }, indexes, { user: 'username', comment: 'updating cookie name' })
    await versionedService.restore(id, { version: 1 }, { comment: 'back to version 1' })
    const restoredObj = await versionedService.get(id)
    if (restoredObj) {
      expect(restoredObj.version).to.equal(3)
      expect(restoredObj.data.name).to.equal('peanut butter')
      expect(restoredObj.comment).to.contain('restored from earlier version')
      expect(restoredObj).to.not.have.property('nutfree')
    } else {
      expect.fail('Object should have been found')
    }
  })

  it('should return a NotFoundError when trying to restore an object that does not exist', async () => {
    try {
      await versionedService.restore('doesnotexist', { version: 5 }, { comment: 'This will not work', user: 'username' })
    } catch (err) {
      expect(err).to.be.instanceOf(NotFoundError)
    }
  })

  it('should restore a previous version of an object and update the indexes', async () => {
    const data = { name: 'Mars', nickname: 'The Red Planet', numMoons: 2 }
    const indexes = [{ name: 'planet', values: ['red', 'iron', 'war'] }]
    const id = await versionedService.create('planet', data, indexes)
    await versionedService.update(id, { ...data, numMoons: 1 }, indexes, { user: 'username', comment: 'update number of moons' })
    const newIndexes = [{ name: 'planet', values: ['red'] }]
    await versionedService.restore(id, { version: 1 }, { indexes: newIndexes, comment: 'undo moon error' })
    const restoredObj = await versionedService.get(id)
    if (restoredObj) {
      expect(restoredObj.version).to.equal(3)
      expect(restoredObj.data.numMoons).to.equal(2)
      const indexesRestore = await versionedService.getIndexes(id, restoredObj.version)
      const diff = compare(newIndexes, indexesRestore)
      expect(diff.length).to.equal(0)
    } else {
      expect.fail('Object should have been found')
    }
  })

  it.skip('should restore a previous version of an object and include a user', async () => { })

  it.skip('should restore a previous version of an object and include a comment', async () => { })

  it.skip('should delete an object and its entire version history', async () => { })

  it.skip('should delete an object and its entire version history', async () => { })

  it.skip('should return a NotFoundError when trying to tag an object that does not exist', async () => { })

  it.skip('should only allow a tag to be used on one version of an object at a time', async () => { })
})
