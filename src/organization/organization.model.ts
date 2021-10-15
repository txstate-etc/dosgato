import { Field, ID, ObjectType } from 'type-graphql'

@ObjectType({
  description: `An organization is an entity that owns some sites. It is here mainly
for administrative purposes, so that system administrators can keep track of the responsible
parties for any site. Each site also has an owner (an individual person), but people move
around and we need a way to both identify that has happened and put the situation back together.`
})
export class Organization {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  constructor (row: any) {
    this.id = String(row.id)
    this.name = row.name
  }
}
