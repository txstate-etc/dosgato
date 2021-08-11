import { DateTime } from 'luxon'
import { ObjectType, Field, Int } from 'type-graphql'
import { Version } from '../versionedservice'

@ObjectType('Version')
export class ObjectVersion {
  @Field(type => Int)
  version: number

  @Field()
  date: DateTime

  @Field()
  comment: string

  @Field(type => [String])
  tags: string[]

  userId: number

  constructor (row: Version) {
    this.version = row.version
    this.date = DateTime.fromJSDate(row.date)
    this.comment = row.comment
    this.tags = row.tags
    this.userId = parseInt(row.user)
  }
}
