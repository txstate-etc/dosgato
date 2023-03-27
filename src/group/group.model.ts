import { Field, ID, InputType, ObjectType } from 'type-graphql'
import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'

@ObjectType({ description: 'Groups of users so that groups can be assigned roles instead of individual users. Groups may also be synced to an external system like Active Directory.' })
export class Group {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
  }
}

@InputType()
export class GroupFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> Return only groups that are not subgroups' })
  root?: boolean
}

@ObjectType()
export class GroupResponse extends ValidatedResponse {
  @Field({ nullable: true })
  group?: Group

  constructor (config: ValidatedResponseArgs & { group?: Group }) {
    super(config)
    this.group = config.group
  }
}

@ObjectType()
export class GroupPermissions {}
