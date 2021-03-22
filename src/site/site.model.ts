import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Site {
  @Field(type => Int)
  id: number

  @Field()
  name: string

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
  }
}

@InputType()
export class SiteFilter {
  @Field(type => [Int])
  ids?: number[]
}

@ObjectType()
export class SitePermissions {}
