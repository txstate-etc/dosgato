import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class PageTree {
  @Field()
  name: string

  constructor (row: any) {
    this.name = row.name
  }
}

@InputType()
export class PageTreeFilter {
  @Field(type => [Int])
  ids?: number[]
}

@ObjectType()
export class PageTreePermissions {
}
