import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType({
  description: 'A pagetree represents the page hierarchy in a site. A site may ' +
    'have multiple pagetrees, but only one active pagetree. Inactive pagetrees ' +
    'would be archives or sandboxes.'
})
export class PageTree {
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
export class PageTreeFilter {
  @Field(type => [Int])
  ids?: number[]
}

@ObjectType()
export class PageTreePermissions {
}
