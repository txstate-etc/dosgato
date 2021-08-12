import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

export enum TemplateType {
  PAGE = 'page',
  COMPONENT = 'component',
  DATA = 'data'
}
registerEnumType(TemplateType, {
  name: 'TemplateType',
  description: 'Determine whether a template is a page, component, or data template.',
  valuesConfig: {
    PAGE: { description: 'Template is appropriate for pages.' },
    COMPONENT: { description: 'Template is appropriate for components.' },
    DATA: { description: 'Template defines a type of data.' }
  }
})

@ObjectType()
export class Template {
  id: number

  @Field(type => ID, { description: 'This is a globally unique identifier that matches specific pieces of supporting source code. Upon startup, any new template keys detected in the source code will be automatically added to the database. When a piece of content is tagged with a template, it should be by key, NOT id, as id could differ from instance to instance and we want content to be easily migratable.' })
  key: string

  @Field({ description: 'A human readable name describing this template.' })
  name: string

  @Field(type => TemplateType)
  type: TemplateType

  @Field({ description: 'Any template not found in the currently running source code will be marked as deleted upon startup.' })
  deleted: boolean

  constructor (row: any) {
    this.id = row.id
    this.key = row.key
    this.name = row.name
    this.type = row.type
    this.deleted = row.deleted
  }
}

@InputType()
export class TemplateFilter {
  ids?: number[]

  @Field(type => [ID], { nullable: true })
  keys?: string[]

  @Field(type => [UrlSafeString], { nullable: true })
  names?: UrlSafeString[]

  @Field(type => [TemplateType], { nullable: true })
  types?: TemplateType[]
}

@ObjectType()
export class TemplatePermissions {}
