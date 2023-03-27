import { Field, ID, ObjectType, InputType } from 'type-graphql'
import { DateTime } from 'luxon'
import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'

@ObjectType()
export class SiteComment {
  @Field(type => ID)
  id: string

  @Field()
  comment: string

  @Field()
  createdAt: DateTime

  siteId: string
  createdBy: number

  constructor (row: any) {
    this.id = String(row.id)
    this.siteId = String(row.siteId)
    this.comment = row.comment
    this.createdBy = row.createdBy
    this.createdAt = DateTime.fromJSDate(row.createdAt)
  }
}

@InputType()
export class SiteCommentFilter {
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return comments for sites with these ids' })
  siteIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return comments created by any of the given users.' })
  users?: string[]
}

@ObjectType()
export class SiteCommentResponse extends ValidatedResponse {
  @Field({ nullable: true })
  siteComment?: SiteComment

  constructor (config: ValidatedResponseArgs & { siteComment?: SiteComment }) {
    super(config)
    this.siteComment = config.siteComment
  }
}
