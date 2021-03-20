import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Site {
  @Field()
  name: string

  constructor (row: any) {
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
