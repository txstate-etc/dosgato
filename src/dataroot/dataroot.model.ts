import { ObjectType, Field, ID, InputType, registerEnumType } from 'type-graphql'
import { Site, Template } from 'internal'

@ObjectType({ description: 'Each site has an array of dataroots, one per registered templateKey. It contains the data and datafolders of that template type in the site. There is also a set of dataroots for global data.' })
export class DataRoot {
  @Field(type => Site, { nullable: true })
  site?: Site

  @Field(type => Template)
  template: Template

  constructor (site: Site|undefined, template: Template) {
    this.site = site
    this.template = template
  }
}

@InputType()
export class DataRootFilter {
  @Field(type => [ID], { nullable: true, description: 'Return dataroots designated for data of one of the given templates.' })
  templateKeys?: string[]

  templateIds?: number[]

  @Field(type => [ID], { nullable: true, description: 'Return dataroots that are associated with one of the given sites.' })
  siteIds?: string[]

  @Field(type => Boolean, { nullable: true, description: 'true -> return only dataroots that are not associated with a site.' })
  global?: boolean
}

@ObjectType()
export class DataRootPermissions {}

export enum DataRootPermission {
  CREATE = 'create',
}
registerEnumType(DataRootPermission, {
  name: 'DataRootPermission',
  description: 'All the action types that can be individually permissioned on a data entry.'
})