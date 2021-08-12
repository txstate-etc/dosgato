import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType } from 'type-graphql'

@ObjectType()
export class User {
  @Field(type => ID)
  id: string

  @Field()
  login: string

  @Field()
  name: string

  @Field()
  email: string

  enabled: boolean
  lastlogin: DateTime
  lastlogout: DateTime

  constructor (row: any) {
    this.id = String(row.id)
    this.login = row.login
    this.name = row.name
    this.email = row.email
    this.enabled = row.enabled
    this.lastlogin = DateTime.fromJSDate(row.lastlogin)
    this.lastlogout = DateTime.fromJSDate(row.lastlogout)
  }
}

@InputType()
export class UserFilter {
  @Field({ nullable: true })
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
