import { ObjectType, Field, ID, InputType, registerEnumType } from 'type-graphql'
import { DeletedFilter, Site, Template } from '../internal.js'

@ObjectType({ description: 'Each site has an array of dataroots, one per registered templateKey. It contains the data and datafolders of that template type in the site. There is also a set of dataroots for global data.' })
export class DataRoot {
  @Field(type => ID)
  id: string

  @Field(type => Site, { nullable: true })
  site?: Site

  @Field(type => Template)
  template: Template

  constructor (site: Site | undefined, template: Template) {
    this.id = `${site?.id ?? 'global'}-${template.id}`
    this.site = site
    this.template = template
  }
}

@InputType()
export class DataRootFilter {
  @Field(type => [ID], { nullable: true })
  ids?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return dataroots designated for data of one of the given templates.' })
  templateKeys?: string[]

  templateIds?: string[]

  @Field(type => [ID], { nullable: true, description: 'Return dataroots that are associated with one of the given sites.' })
  siteIds?: string[]

  @Field(type => DeletedFilter, { nullable: true, description: 'Return dataroots based on whether their site has been deleted. SHOW = show all dataroots regardless of being orphaned, HIDE = show non-orphaned dataroots, ONLY = return orphaned dataroots.' })
  orphaned?: DeletedFilter

  @Field(type => Boolean, { nullable: true, description: 'true -> return only dataroots that are not associated with a site; false -> return only dataroots that are associated with a site; null -> return global and non-global dataroots' })
  global?: boolean

  @Field(type => Boolean, { nullable: true, description: 'Return dataroots the current user should see in the data management UI.' })
  viewForEdit?: boolean
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
