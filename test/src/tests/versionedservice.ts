// import { Context } from '@txstate-mws/graphql-server'
// import { expect } from 'chai'
// import { compare } from 'fast-json-patch'
// import db from 'mysql2-async/db'
// import { DateTime } from 'luxon'
// import { VersionedService, NotFoundError, UpdateConflictError } from '../../../src/versionedservice'

// const homePage: any = {
//   title: 'Texas State University',
//   hideTitle: false,
//   sections: [
//     {
//       title: 'First Section',
//       layouts: [
//         {
//           title: 'One Column Layout',
//           content: [
//             {
//               type: 'button',
//               title: 'Click Here',
//               color: 'color1',
//               url: 'https://www.txstate.edu'
//             },
//             {
//               type: 'icontext',
//               icon: 'fa-themeisle',
//               color: 'color3',
//               link: 'https://www.google.com'
//             }
//           ]
//         }
//       ]
//     }
//   ]
// }

// before(async function () {
//   this.timeout(0)
//   try {
//     await db.wait()
//     await VersionedService.init()
//   } catch (err: any) {
//     console.log(err)
//   }
// })

// describe('versionedservice', () => {
//   const ctx = new Context()
//   let versionedService: VersionedService
//   beforeEach(() => {
//     versionedService = ctx.svc(VersionedService)
//   })

//   it('should store a JSON object', async () => {
//     const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }], 'username')
//     expect(id).to.have.length(10)
//   })

//   it('should store a JSON object with no user', async () => {
//     const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
//     expect(id).to.have.length(10)
//   })

//   it('should return a NotFoundError for an object that does not exist', async () => {
//     try {
//       await versionedService.get('invalid')
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//   })

//   it('should retrieve an object from storage', async () => {
//     const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
//     const obj = await versionedService.get(id)
//     if (obj) {
//       expect(obj).to.have.property('data')
//       expect(obj.data).to.have.property('title')
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should retrieve the indexes associated with a particular version of an object', async () => {
//     const indexes = [{ name: 'index1', values: ['one', 'two'] }, { name: 'index2', values: ['three'] }]
//     const id = await versionedService.create('testdata', { size: 'large', color: 'red' }, indexes)
//     const obj = await versionedService.get(id)
//     if (obj) {
//       const objIndexes = await versionedService.getIndexes(id, obj.version)
//       const diff = compare(indexes, objIndexes)
//       expect(diff.length).to.equal(0)
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should update an object in storage', async () => {
//     const id = await versionedService.create('txstatehome', homePage, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }])
//     const obj = await versionedService.get(id)
//     if (obj) {
//       const indexes = await versionedService.getIndexes(id, obj.version)
//       await versionedService.update(id, { ...homePage, title: 'Updated Home Page' }, indexes)
//       const updatedObj = await versionedService.get(id)
//       if (updatedObj) {
//         expect(updatedObj.data).to.have.property('title')
//         expect(updatedObj.data.title).to.equal('Updated Home Page')
//         expect(updatedObj.version).to.equal(2)
//       } else {
//         expect.fail('Object should have been found')
//       }
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should retrieve an object with a specific version from storage', async () => {
//     const indexes = [{ name: 'index3', values: ['test'] }]
//     const data = { name: 'Person A', age: 16, canVote: false }
//     const id = await versionedService.create('testobject', data, indexes)
//     const obj = await versionedService.get(id)
//     if (obj) {
//       data.age = 17
//       await versionedService.update(id, data, indexes)
//       data.age = 18
//       data.canVote = true
//       await versionedService.update(id, data, indexes)
//       const optional = { version: 2 }
//       const obj2 = await versionedService.get(id, optional)
//       if (obj2) {
//         expect(obj2.data.age).to.equal(17)
//         expect(obj2.data.canVote).to.equal(false)
//       } else {
//         expect.fail('Object should have been found')
//       }
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should should tag a specific version of an object', async () => {
//     const indexes = [{ name: 'index4', values: ['apple', 'orange'] }]
//     const data = { title: 'Hello World', color: 'red', size: 'extra medium' }
//     const id = await versionedService.create('testdata', data, indexes)
//     await versionedService.tag(id, 'published', 1, 'username')
//     const result = await versionedService.getTag(id, 'published')
//     expect(result).to.have.property('tag')
//     expect(result?.tag).to.equal('published')
//     expect(result?.version).to.equal(1)
//   })

//   it('should retrieve an object with a specific tag from storage', async () => {
//     const indexes = [{ name: 'index5', values: ['cat', 'dog'] }]
//     const data = { name: 'Earth', hasWater: true, numMoons: 1 }
//     const id = await versionedService.create('planet', data, indexes)
//     await versionedService.tag(id, 'approved', 1, 'username')
//     const obj = await versionedService.get(id, { tag: 'approved' })
//     expect(obj?.data).to.have.property('name')
//     expect(obj?.data.name).to.equal('Earth')
//   })

//   it('should not allow versions to be manually tagged as latest', async () => {
//     const indexes = [{ name: 'index6', values: ['component'] }]
//     const data = { name: 'Chocolate chip', ingredients: ['flour, butter', 'chocolate chips', 'sugar', 'eggs', 'vanilla'] }
//     const id = await versionedService.create('cookie', data, indexes)
//     try {
//       await versionedService.tag(id, 'latest', 1, 'username')
//     } catch (err: any) {
//       // check for specific error message?
//       expect(err.message.length).to.be.greaterThan(0)
//     }
//   })

//   it('should return undefined if a requested tag does not exist for the requested object', async () => {
//     const indexes = [{ name: 'index7', values: ['test'] }]
//     const data = { name: 'Snickerdoodle', ingredients: ['flour', 'sugar', 'butter', 'eggs', 'cream of tartar', 'cinnamon'] }
//     const id = await versionedService.create('cookie', data, indexes)
//     const obj = await versionedService.get(id, { tag: 'invalidtag' })
//     expect(obj).to.equal(undefined)
//   })

//   it('should return a NotFoundError when trying to update an object that does not exist', async () => {
//     try {
//       await versionedService.update('doesnotexist', { name: 'blueberry', isFruit: true, color: 'purple' }, [{ name: 'index8', values: ['anything'] }])
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//   })

//   it('should restore a previous version of an object', async () => {
//     const indexes = [{ name: 'index8', values: ['does', 'not', 'matter', 'here'] }]
//     const data = { name: 'peanut butter', ingredients: ['flour', 'sugar', 'butter', 'peanut butter', 'eggs'] }
//     const id = await versionedService.create('cookie', data, indexes)
//     await versionedService.update(id, { ...data, name: 'peanut butter cookie', nutfree: false }, indexes, { user: 'username', comment: 'updating cookie name' })
//     await versionedService.restore(id, { version: 1 }, { comment: 'back to version 1' })
//     const restoredObj = await versionedService.get(id)
//     if (restoredObj) {
//       expect(restoredObj.version).to.equal(3)
//       expect(restoredObj.data.name).to.equal('peanut butter')
//       expect(restoredObj.comment).to.contain('restored from earlier version')
//       expect(restoredObj).to.not.have.property('nutfree')
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should return a NotFoundError when trying to restore an object that does not exist', async () => {
//     try {
//       await versionedService.restore('doesnotexist', { version: 5 }, { comment: 'This will not work', user: 'username' })
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//   })

//   it('should restore a previous version of an object and update the indexes', async () => {
//     const data = { name: 'Mars', nickname: 'The Red Planet', numMoons: 2 }
//     const indexes = [{ name: 'planet', values: ['red', 'iron', 'war'] }]
//     const id = await versionedService.create('planet', data, indexes)
//     await versionedService.update(id, { ...data, numMoons: 1 }, indexes, { user: 'username', comment: 'update number of moons' })
//     const newIndexes = [{ name: 'planet', values: ['red'] }]
//     await versionedService.restore(id, { version: 1 }, { indexes: newIndexes, comment: 'undo moon error' })
//     const restoredObj = await versionedService.get(id)
//     if (restoredObj) {
//       expect(restoredObj.version).to.equal(3)
//       expect(restoredObj.data.numMoons).to.equal(2)
//       const indexesRestore = await versionedService.getIndexes(id, restoredObj.version)
//       const diff = compare(newIndexes, indexesRestore)
//       expect(diff.length).to.equal(0)
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should restore a previous version of an object and include a user and comment', async () => {
//     const data = { type: 'M&Ms', count: 12 }
//     const indexes = [{ name: 'candy', values: ['red', 'green', 'yellow'] }]
//     const id = await versionedService.create('candy', data, indexes)
//     await versionedService.update(id, { ...data, count: 14 }, indexes, { user: 'username', comment: 'found two on the floor' })
//     await versionedService.restore(id, { version: 1 }, { user: 'username2', comment: 'Nevermind, those were skittles' })
//     const restoredObj = await versionedService.get(id)
//     if (restoredObj) {
//       expect(restoredObj.version).to.equal(3)
//       expect(restoredObj.data.count).to.equal(12)
//       expect(restoredObj.modifiedBy).to.equal('username2')
//       expect(restoredObj.comment).to.contain('skittles')
//     } else {
//       expect.fail('Object should have been found')
//     }
//   })

//   it('should delete an object and its entire version history', async () => {
//     const data = { id: 'abc123', name: 'pumpkin', color: 'orange' }
//     const indexes = [{ name: 'food', values: ['fruit', 'orange', 'halloween'] }]
//     const id = await versionedService.create('food', data, indexes)
//     await versionedService.update(id, { ...data, count: 5 }, indexes)
//     await versionedService.delete(id)
//     try {
//       await versionedService.get(id, { version: 2 })
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//     try {
//       await versionedService.get(id, { version: 1 })
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//   })

//   it('should return a NotFoundError when trying to tag an object that does not exist', async () => {
//     try {
//       await versionedService.tag('doesnotexist', 'published')
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(NotFoundError)
//     }
//   })

//   it('should only allow a tag to be used on one version of an object at a time', async () => {
//     const data = { id: 3, title: 'About Department', hideInNav: false }
//     const indexes = [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'button', 'icontext'] }]
//     const id = await versionedService.create('page', data, indexes)
//     await versionedService.update(id, { ...data, hideInNav: true }, indexes)
//     await versionedService.tag(id, 'published', 1)
//     await versionedService.tag(id, 'published', 2)
//     const tag = await versionedService.getTag(id, 'published')
//     expect(tag?.version).to.equal(2)
//   })

//   it('should overwrite all indexes for a specific version of an object', async () => {
//     const data = { id: 4, title: 'Resources', hideInNav: false, isSearchPage: false }
//     const indexes = [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'styledlist'] }, { name: 'other', values: ['one', 'two', 'three', 'four'] }]
//     const id = await versionedService.create('page', data, indexes)
//     await versionedService.setIndexes(id, 1, [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'richtext'] }])
//     const updatedIndexes = await versionedService.getIndexes(id, 1)
//     expect(updatedIndexes.length).to.equal(1)
//     expect(updatedIndexes[0].values).to.include('richtext')
//   })

//   it('should overwrite a single index without affecting the others', async () => {
//     const data = { id: 5, title: 'Contact Us', hideInNav: false }
//     const indexes = [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout', 'styledlist'] }, { name: 'other', values: ['one', 'two', 'three', 'four'] }]
//     const id = await versionedService.create('page', data, indexes)
//     await versionedService.setIndex(id, 1, { name: 'components', values: ['twocolumnsection', 'twocolumnlayout', 'richtext', 'collage', 'imagecard'] })
//     const updatedIndexes = await versionedService.getIndexes(id, 1)
//     expect(updatedIndexes.length).to.equal(2)
//     for (const idx of updatedIndexes) {
//       if (idx.name === 'components') {
//         expect(idx.values.length).to.equal(5)
//         expect(idx.values).to.contain('twocolumnlayout')
//       } else {
//         expect(idx.values.length).to.equal(4)
//       }
//     }
//   })

//   it('should throw an error when trying to update an old version of an object', async () => {
//     const data = { name: 'Anne', favoriteSeason: 'fall', favoriteCookie: 'oreo' }
//     const indexes = [{ name: 'favorites', values: ['one', 'two'] }]
//     const id = await versionedService.create('favorites', data, indexes)
//     await versionedService.update(id, { ...data, favoriteCookie: 'sugar cookie' }, indexes)
//     try {
//       await versionedService.update(id, { ...data, favoriteCookie: 'chocolate chip' }, indexes, { version: 1 })
//     } catch (err: any) {
//       expect(err).to.be.instanceOf(UpdateConflictError)
//     }
//   })

//   it('should remove a tag from an object', async () => {
//     const data = { id: 6, stories: 2, bedrooms: 4, bathrooms: 2.5 }
//     const indexes = [{ name: 'houses', values: ['construction', 'for sale'] }]
//     const id = await versionedService.create('houses', data, indexes)
//     await versionedService.tag(id, 'published', 1)
//     await versionedService.removeTag(id, 'published')
//     const tagged = await versionedService.getTag(id, 'published')
//     expect(tagged).to.equal(undefined)
//   })

//   it('should remove a tag from the system', async () => {
//     const data = { name: 'some object', count: 4 }
//     const data2 = { name: 'another object', count: 7 }
//     const data3 = { name: 'last object', count: 2 }
//     const indexes = [{ name: 'testindex', values: ['does', 'not', 'matter', 'here'] }]
//     const [id, id2, id3] = await Promise.all([
//       versionedService.create('test', data, indexes),
//       versionedService.create('test', data2, indexes),
//       versionedService.create('test', data3, indexes)
//     ])
//     await Promise.all([
//       versionedService.tag(id, 'reviewed'),
//       versionedService.tag(id2, 'reviewed'),
//       versionedService.tag(id3, 'reviewed')
//     ])
//     await versionedService.globalRemoveTag('reviewed')
//     const tagged = await Promise.all([
//       versionedService.getTag(id, 'reviewed'),
//       versionedService.getTag(id2, 'reviewed'),
//       versionedService.getTag(id3, 'reviewed')
//     ])
//     for (const obj of tagged) {
//       expect(obj).to.equal(undefined)
//     }
//   })

//   it('should list versions of an object', async () => {
//     const data = { id: 7, candy: 'M&Ms', count: 25 }
//     const indexes = [{ name: 'test', values: ['chocolate', 'green', 'red', 'yellow', 'orange'] }]
//     const id = await versionedService.create('candy', data, indexes, 'listversionsuser')
//     await versionedService.update(id, { ...data, count: 20 }, indexes, { user: 'listversionsuser', comment: 'ate 5' })
//     await versionedService.update(id, { ...data, count: 18 }, indexes, { user: 'listversionsuser', comment: 'ate 2 more' })
//     await versionedService.update(id, { ...data, count: 11 }, indexes, { user: 'listversionsuser', comment: 'ate 7 more' })
//     await versionedService.update(id, { ...data, count: 0 }, indexes, { user: 'listversionsuser', comment: 'ate the rest' })
//     const versions = await versionedService.listVersions(id)
//     expect(versions.length).to.equal(4)
//     for (const v of versions) {
//       expect(v.user).to.equal('listversionsuser') // make sure versions of this particular object are being returned
//     }
//   })

//   it('should delete old versions', async () => {
//     const data = { id: 8, title: 'Site Map', hideInNav: false }
//     const indexes = [{ name: 'components', values: ['onecolumnsection', 'onecolumnlayout'] }]
//     const id = await versionedService.create('page', data, indexes)
//     await versionedService.update(id, { ...data, hideInNav: true, currency: 'inherit' }, indexes)
//     await versionedService.update(id, { ...data, title: 'Old Site Map' }, indexes)
//     // set the date of the oldest version to be 1 week ago
//     await db.execute('UPDATE versions SET `date`=`date`-INTERVAL 7 DAY WHERE id=? AND version=?', [id, 1])
//     await VersionedService.deleteOldVersions(DateTime.now().plus({ days: -1 }).toJSDate())
//     const versions = await versionedService.listVersions(id)
//     expect(versions.length).to.equal(1)
//     const obj = await versionedService.get(id, { version: 1 })
//     expect(obj).to.equal(undefined) // version 1 was deleted because it was old
//     const oldIndexes = await versionedService.getIndexes(id, 1)
//     expect(oldIndexes.length).to.equal(0)
//   })

//   it('should not delete old versions that have tags', async () => {
//     const data = { id: 9, title: 'About Us', hideTitle: false, sections: [] }
//     const indexes = [{ name: 'components', values: ['about'] }]
//     const id = await versionedService.create('page', data, indexes)
//     await versionedService.update(id, { ...data, sections: [{ title: 'First Section', layouts: [] }] }, [{ name: 'components', values: ['about', 'onecolumnsection'] }])
//     await versionedService.tag(id, 'published', 2)
//     await versionedService.update(id, { ...data, hideTitle: true, hideInNav: true }, [{ name: 'components', values: ['about', 'onecolumnsection'] }]) // version 3
//     await versionedService.update(id, { ...data, hideInNav: false }, [{ name: 'components', values: ['about', 'onecolumnsection'] }]) // version 4
//     await versionedService.update(id, { ...data, sections: [{ title: 'First Section', layouts: [{ title: 'First Layout', content: [] }] }] }, [{ name: 'components', values: ['about', 'onecolumnsection', 'onecolumnlayout'] }]) // version 5
//     // version 2 has a tag. change dates on versions 1-3 to be older
//     await Promise.all([
//       db.execute('UPDATE versions SET `date`=`date`-INTERVAL 10 DAY WHERE id=? AND version=?', [id, 1]),
//       db.execute('UPDATE versions SET `date`=`date`-INTERVAL 7 DAY WHERE id=? AND version=?', [id, 2]),
//       db.execute('UPDATE versions SET `date`=`date`-INTERVAL 5 DAY WHERE id=? AND version=?', [id, 3])
//     ])
//     await VersionedService.deleteOldVersions(DateTime.now().plus({ days: -1 }).toJSDate())
//     const versions = await versionedService.listVersions(id)
//     expect(versions.length).to.equal(3)
//     const deletedObj = await versionedService.get(id, { version: 1 })
//     expect(deletedObj).to.equal(undefined) // version 1 was deleted
//     const taggedObj = await versionedService.get(id, { tag: 'published' })
//     expect(taggedObj?.version).to.equal(2) // version 2 was older than the olderThan date, but it has a tag so it was should not be deleted
//   })

//   it('should find objects IN', async () => {
//     const data = { id: 1, type: 'find in' }
//     const indexes = [{ name: 'testfind', values: ['find in', 1] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', in: ['find in', 'notinindexvalues', 'alsoneverused'] }], 'latest')
//     expect(results).to.contain(id)
//   })

//   it('should find objects NOT IN', async () => {
//     const data = { id: 2, type: 'find not in' }
//     const indexes = [{ name: 'testfind', values: ['find not in', 2] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', notIn: ['apple', 'orange', 'banana'] }], 'latest')
//     expect(results).to.contain(id)
//   })

//   it('should find objects GREATER THAN', async () => {
//     const data = { id: 3, type: 'find greater than' }
//     const indexes = [{ name: 'testfind', values: ['moon', 3] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', greaterThan: 'apple', orEqual: false }], 'latest')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', greaterThan: 'moon', orEqual: false }], 'latest')
//     expect(results2).to.not.contain(id)
//     const resultsEqual = await versionedService.find([{ indexName: 'testfind', greaterThan: 'moon', orEqual: true }], 'latest')
//     expect(resultsEqual).to.contain(id)
//   })

//   it('should find objects LESS THAN', async () => {
//     const data = { id: 4, type: 'find less than' }
//     const indexes = [{ name: 'testfind', values: ['pizza'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', lessThan: 'zebra', orEqual: false }], 'latest')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', lessThan: 'pizza', orEqual: false }], 'latest')
//     expect(results2).to.not.contain(id)
//     const resultsEqual = await versionedService.find([{ indexName: 'testfind', lessThan: 'pizza', orEqual: true }], 'latest')
//     expect(resultsEqual).to.contain(id)
//   })

//   it('should find objects EQUAL', async () => {
//     const data = { id: 5, type: 'find equal to' }
//     const indexes = [{ name: 'testfind', values: ['equal'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', equal: 'equal' }], 'latest')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', equal: 'tree' }], 'latest')
//     expect(results2).to.not.contain(id)
//   })

//   it('should find objects NOT EQUAL', async () => {
//     const data = { id: 6, type: 'find not equal to' }
//     const indexes = [{ name: 'testfind', values: ['notequal'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', notEqual: 'cupcakes' }], 'latest')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', notEqual: 'notequal' }], 'latest')
//     expect(results2).to.not.contain(id)
//   })

//   it('should find objects STARTS WITH', async () => {
//     const data = { id: 7, type: 'find starts with' }
//     const indexes = [{ name: 'testfind', values: ['playground'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', startsWith: 'play' }], 'latest')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', startsWith: 'duck' }], 'latest')
//     expect(results2).to.not.contain(id)
//   })

//   it('should find objects with type specified', async () => {
//     const data = { id: 8, day: 'Wednesday', month: 'March' }
//     const indexes = [{ name: 'testfind', values: ['winter', 'spring'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     const results = await versionedService.find([{ indexName: 'testfind', equal: 'winter' }], 'latest', 'findobj')
//     expect(results).to.contain(id)
//     const results2 = await versionedService.find([{ indexName: 'testfind', equal: 'winter' }], 'latest', 'notfindobj')
//     expect(results2).to.not.contain(id)
//   })

//   it('should find objects with a tag other than latest specified', async () => {
//     const data = { id: 9, holiday: 'Halloween', month: 'October', season: 'Fall' }
//     const indexes = [{ name: 'testfind', values: ['pumpkin', 'costumes', 'candy'] }]
//     const id = await versionedService.create('findobj', data, indexes)
//     await versionedService.tag(id, 'mycustomtag', 1, 'me')
//     const results = await versionedService.find([{ indexName: 'testfind', equal: 'pumpkin' }], 'mycustomtag')
//     expect(results).to.contain(id)
//   })
// })
