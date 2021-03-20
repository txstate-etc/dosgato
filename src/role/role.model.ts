import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Role {
  @Field()
  name: string

  constructor (row: any) {
    this.name = row.name
  }
}

@InputType()
export class RoleFilter {
  @Field(type => [Int])
  ids?: number[]
}
