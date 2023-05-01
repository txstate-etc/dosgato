import { DateTime } from 'luxon'
import { ObjectType, Field, Int, InputType } from 'type-graphql'
import { Version } from '../internal.js'
import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'

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

  @Field()
  marked: boolean

  @Field({ nullable: true })
  markedAt?: DateTime

  id: string
  userId: string

  constructor (row: Version) {
    this.id = row.id
    this.version = row.version
    this.date = DateTime.fromJSDate(row.date)
    this.comment = row.comment
    this.tags = row.tags
    this.userId = row.user
    this.marked = !!row.markedAt
    this.markedAt = row.markedAt ? DateTime.fromJSDate(row.markedAt) : undefined
  }
}

@InputType()
export class VersionFilter {
  @Field(type => [String], { nullable: true })
  tags?: string[]
}

@ObjectType()
export class VersionResponse extends ValidatedResponse {
  @Field({ nullable: true })
  version?: ObjectVersion

  constructor (config?: ValidatedResponseArgs & { version?: ObjectVersion }) {
    super(config ?? {})
    this.version = config?.version
  }
}
