import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Page {
  @Field()
  name: string

  constructor (row: any) {
    this.name = row.name
  }
}

@InputType()
export class PageFilter {
  @Field(type => [Int], { nullable: true })
  siteTreeIds?: number[]

  @Field(type => [Int], { nullable: true })
  parentPageIds?: number[]
}
