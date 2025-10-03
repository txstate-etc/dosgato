import { ValidatedResponse, type ValidatedResponseArgs } from '@txstate-mws/graphql-server'
import { optionalString } from 'txstate-utils'
import { Field, ID, InputType, ObjectType } from 'type-graphql'

@ObjectType({
  description: `An organization is an entity that owns some sites. It is here mainly
for administrative purposes, so that system administrators can keep track of the responsible
parties for any site. Each site also has an owner (an individual person), but people move
around and we need a way to both identify that has happened and put the situation back together.`
})
export class Organization {
  @Field(type => ID, { description: 'This may match the unique id from an external system if it was set during creation.' })
  id: string

  @Field()
  name: string

  @Field(type => ID, { nullable: true })
  externalId: string

  parentId?: string

  constructor (row: any) {
    this.id = String(row.id)
    this.externalId = row.externalId
    this.name = row.name
    this.parentId = optionalString(row.parentId)
  }
}

@InputType()
export class OrganizationFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true })
  externalIds?: number[]

  @Field({ nullable: true })
  search?: string
}

@ObjectType()
export class OrganizationResponse extends ValidatedResponse {
  @Field({ nullable: true })
  organization?: Organization

  constructor (config: ValidatedResponseArgs & { organization?: Organization }) {
    super(config)
    this.organization = config.organization
  }
}
