import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Group {
  @Field()
  id: number

  @Field()
  name: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
  }
}

@InputType()
export class GroupFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [Int], { nullable: true, description: 'Return groups managed by any of the specified manager ids.' })
  managerIds?: number[]
}

@ObjectType()
export class GroupPermissions {}
