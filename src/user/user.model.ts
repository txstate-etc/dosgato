import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { ValidatedResponse, ValidatedResponseArgs } from '@txstate-mws/graphql-server'

@ObjectType()
export class User {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  @Field()
  email: string

  @Field()
  disabled: boolean

  @Field({ nullable: true, description: 'When the user was disabled. The UI may want to do something to hide these users.' })
  disabledAt?: DateTime

  @Field()
  trained: boolean

  @Field()
  system: boolean

  @Field({ nullable: true })
  lastlogin?: DateTime

  internalId: number
  lastlogout?: DateTime

  constructor (row: any) {
    this.internalId = row.id
    this.id = row.login
    this.name = row.name
    this.email = row.email
    this.disabledAt = row.disabledAt ? DateTime.fromJSDate(row.disabledAt) : undefined
    this.disabled = this.disabledAt != null
    this.trained = row.trained
    this.system = row.system
    this.lastlogin = row.lastlogin ? DateTime.fromJSDate(row.lastlogin) : undefined
    this.lastlogout = row.lastlogout ? DateTime.fromJSDate(row.lastlogout) : undefined
  }
}

export interface RedactedUser {
  id: string
  internalId: number
  name: string
}

@InputType()
export class UserFilter {
  internalIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Accepts a special value \'self\' to represent the currently authenticated user.' })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> enabled users, false -> disabled users, null -> all users' })
  enabled?: boolean

  @Field({ nullable: true, description: 'true -> trained users, false -> untrained users, null -> all users' })
  trained?: boolean

  @Field({ nullable: true, description: 'true -> system users, false -> non-system users, null -> all users' })
  system?: boolean

  @Field({ nullable: true, description: 'When specified, get rid of any users that became disabled before the given date. Typically used to hide long-disabled users.' })
  hideDisabledBefore?: DateTime
}

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  name!: string

  @Field({ nullable: true })
  email!: string

  @Field({ nullable: true })
  trained!: boolean
}

@ObjectType()
export class UserResponse extends ValidatedResponse {
  @Field({ nullable: true })
  user?: User

  constructor (config?: ValidatedResponseArgs & { user?: User }) {
    super(config ?? {})
    this.user = config?.user
  }
}

@ObjectType()
export class UsersResponse extends ValidatedResponse {
  @Field(type => [User])
  users: User[]

  constructor (config?: ValidatedResponseArgs & { users?: User[] }) {
    super(config ?? {})
    this.users = config?.users ?? []
  }
}

@ObjectType()
export class UserPermissions {}
