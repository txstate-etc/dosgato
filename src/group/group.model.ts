import { Field, ObjectType } from 'type-graphql'

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

@ObjectType()
export class GroupPermissions {}
