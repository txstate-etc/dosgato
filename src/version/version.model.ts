import { DateTime } from 'luxon'
import { ObjectType, Field, Int } from 'type-graphql'
import { Version } from '../internal.js'

@ObjectType('Version', {
  description: `This is metadata pertaining to a historical version of something versionable
  like a page or data entry.`
})
export class ObjectVersion {
  @Field(type => Int)
  version: number

  @Field()
  date: DateTime

  @Field()
  comment: string

  @Field(type => [String])
  tags: string[]

  id: string
  userId: string

  constructor (row: Version) {
    this.id = row.id
    this.version = row.version
    this.date = DateTime.fromJSDate(row.date)
    this.comment = row.comment
    this.tags = row.tags
    this.userId = row.user
  }
}
