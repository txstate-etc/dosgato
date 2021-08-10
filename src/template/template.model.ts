import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'
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
  @Field(type => Int)
  id: number

  @Field()
  name: UrlSafeString

  @Field()
  type: TemplateType

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.type = row.type
  }
}

@InputType()
export class TemplateFilter {
  @Field(type => [Int])
  ids?: number[]

  @Field(type => [UrlSafeString])
  names?: UrlSafeString[]

  @Field(type => [TemplateType])
  types?: TemplateType[]
}

@ObjectType()
export class TemplatePermissions {}
