import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { DateTime } from 'luxon'
import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { isNotBlank } from 'txstate-utils'

@ObjectType()
export class User {
  @Field(type => ID)
  id: string

  @Field({ nullable: true, description: 'System users and several celebrities will have no first name.' })
  firstname?: string

  @Field({ description: 'Required. If Cher needs access, put "Cher" here and leave first name empty. Similarly, system users only have a last name.' })
  lastname: string

  @Field(type => String)
  get name () {
    return [this.firstname, this.lastname].filter(isNotBlank).join(' ')
  }

  @Field(type => String)
  get sortableName () {
    return [this.lastname, this.firstname].filter(isNotBlank).join(', ')
  }

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
    this.firstname = row.firstname
    this.lastname = row.lastname
    this.email = row.email
    this.disabledAt = row.disabledAt ? DateTime.fromJSDate(row.disabledAt) : undefined
    this.disabled = this.disabledAt != null
    this.trained = !!row.trained
    this.system = !!row.system
    this.lastlogin = row.lastlogin ? DateTime.fromJSDate(row.lastlogin) : undefined
    this.lastlogout = row.lastlogout ? DateTime.fromJSDate(row.lastlogout) : undefined
  }
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
  firstname!: string

  @Field({ nullable: true })
  lastname!: string

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
