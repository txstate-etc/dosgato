module.exports = {
  _id: 2,
  meta: {
    published: 2,
    parent: 1
  },
  data: {
    template: 'txst-standard',
    title: 'My Latest Test Page',
    areas: {
      banner: [{ /* component data */ }],
      body: [{
        template: 'txst-twocolumn',
        areas: {
          left: [{ /* component data */ }],
          right: [{ /* component data */ }]
        }
      }]
    }
  },
  versions: [
    {
      id: 3,
      migration: 25,
      date: '2018-12-19T12:24:04Z',
      type: 'user',
      user: 'nw13',
      undo: [
        /* JSON Patch Operations RFC6902 */
        { op: 'replace', path: '/title', value: 'My Published Test Page' },
        { op: 'add', path: '/keywords', value: ['keywords', 'that', 'got', 'removed'] }
      ]
    },
    {
      id: 2,
      migration: 25,
      date: '2018-12-19T12:22:31Z',
      type: 'migration',
      undo: [
        /* JSON Patch Operations RFC6902 */
        { op: 'move', from: '/title', path: '/oldtitle' }
      ]
    },
    {
      id: 1,
      migration: 19,
      date: '2018-12-18T17:48:23Z',
      type: 'init'
    }
  ]
}
