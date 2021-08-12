import { Field, ID, InputType, ObjectType } from 'type-graphql'

@ObjectType()
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

  @Field(type => [ID], { nullable: true, description: 'Return groups managed by any of the specified manager ids.' })
  managerIds?: string[]
}

@ObjectType()
export class GroupPermissions {}
