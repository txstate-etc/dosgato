import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'

@ObjectType({
  description: 'A pagetree represents the page hierarchy in a site. A site may ' +
    'have multiple pagetrees, but only one active pagetree. Inactive pagetrees ' +
    'would be archives or sandboxes.'
})
export class PageTree {
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
export class PageTreeFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field({ nullable: true, description: 'true -> primary pagetree for its site, false -> additional pagetree for its site, null -> all pagetrees' })
  primary?: boolean
}

@ObjectType()
export class PageTreePermissions {
}

export enum PageTreePermission {
  RENAME = 'rename',
  PROMOTE = 'promote',
  DELETE = 'delete',
  UNDELETE = 'undelete'
}
registerEnumType(PageTreePermission, {
  name: 'PageTreePermission',
  description: 'All the action types that can be individually permissioned on a pagetree.'
})
