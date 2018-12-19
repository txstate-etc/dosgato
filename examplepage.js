module.exports = {
  _id: 2,
  meta: {
    published: 11,
    parent: 1
  },
  data: {
    migration: 2,
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
      id: 12,
      date: '2018-12-19T12:24:04Z',
      type: 'user',
      user: 'nw13',
      undo: [
        /* JSON Patch Operations RFC6902 */
        { op: 'replace', path: '/title', value: 'My Original Test Page' },
        { op: 'add', path: '/keywords', value: ['keywords', 'that', 'got', 'removed'] }
      ]
    },
    {
      id: 11,
      date: '2018-12-19T12:22:31Z',
      type: 'migration',
      undo: [
        /* JSON Patch Operations RFC6902 */
        { op: 'replace', path: 'migration', value: 1 },
        { op: 'move', from: '/title', path: '/oldtitle' }
      ]
    }
  ]
}
