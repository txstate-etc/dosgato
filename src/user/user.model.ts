import { DateTime } from 'luxon'
import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class User {
  @Field(type => Int)
  id: number

  @Field()
  login: string

  @Field()
  name: string

  @Field()
  email: string

  valid: boolean
  lastlogin: DateTime
  lastlogout: DateTime

  constructor (row: any) {
    this.id = row.id
    this.login = row.login
    this.name = row.name
    this.email = row.email
    this.valid = row.valid
    this.lastlogin = DateTime.fromJSDate(row.lastlogin)
    this.lastlogout = DateTime.fromJSDate(row.lastlogout)
  }
}

@InputType()
export class UserFilter {
  @Field({ nullable: true })
  self?: boolean

  @Field(type => [Int], { nullable: true })
  ids?: number[]
}

@ObjectType()
export class UserPermissions {}

@ObjectType()
export class UserAccess {}
