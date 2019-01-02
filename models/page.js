const mongoose = require('mongoose')
const Schema = mongoose.Schema
const VersionSchema = require('./version')
const LinkSchema = require('./link')
const ComponentSchema = require('./component')

const PageDataSchema = new ComponentSchema({
  name: { type: String, required: true },
  title: String
})

const PageSchema = new Schema({
  meta: {
    published: Number,
    parent: { type: Schema.Types.ObjectId, ref: 'Page' },
    links: {
      current: [LinkSchema], // store links used anywhere in the page, for searching and reference counting
      published: [LinkSchema], // same as current except for the published version
      past: [LinkSchema] // includes links that appear in past versions but NOT in current or published
    },
    templates: {
      current: [String], // store component template ids used anywhere in the page, for searching
      published: [String], // same as current except for the published version
      past: [String] // includes templates that appear in past versions but NOT in current or published
    },
    trigram: {
      current: [String], // trigram index for any searchable content on the page
      published: [String], // same as current except for the published version
      past: [String] // includes trigrams that appear in past versions but NOT in current or published
    }
  },
  data: { type: PageDataSchema, required: true },
  versions: [VersionSchema]
})

module.exports = mongoose.model('Page', PageSchema)
