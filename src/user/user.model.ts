import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType } from 'type-graphql'

@ObjectType()
export class User {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  @Field()
  email: string

  internalId: number
  enabled: boolean
  lastlogin: DateTime
  lastlogout: DateTime

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.login
    this.name = row.name
    this.email = row.email
    this.enabled = row.enabled
    this.lastlogin = DateTime.fromJSDate(row.lastlogin)
    this.lastlogout = DateTime.fromJSDate(row.lastlogout)
  }
}

@InputType()
export class UserFilter {
  internalIds?: number[]

  @Field({ nullable: true, description: 'Filter down to only include the authenticated user. Combinations with other filters may not make a lot of sense.' })
  self?: boolean

  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> enabled users, false -> disabled users, null -> all users' })
  enabled?: boolean
}

@ObjectType()
export class UserPermissions {}

@ObjectType()
export class UserAccess {}
