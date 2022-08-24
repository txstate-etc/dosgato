import { Field, ID, InputType, ObjectType, registerEnumType } from 'type-graphql'
import { templateRegistry, JsonData, UrlSafeString } from '../internal.js'

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

@ObjectType({
  description: `Each page, component, and data entry has a template that defines its
  schema and other configuration. Most of that configuration lives in source code instead
  of the database and is not available in this API. What IS controlled in the database
  and included in this API is the authorization of each template per site (or pagetree),
  so that certain page, component, and data templates can be added to sites as the site's
  editors receive training or demonstrate a need.`
})
export class Template {
  id: number

  @Field(type => ID, { description: 'This is a globally unique identifier that matches specific pieces of supporting source code. Upon startup, any new template keys detected in the source code will be automatically added to the database. When a piece of content is tagged with a template, it should be by key, NOT id, as id could differ from instance to instance and we want content to be easily migratable.' })
  key: string

  @Field({ description: 'A human readable name describing this template.' })
  name: string

  @Field(type => TemplateType)
  type: TemplateType

  @Field({ description: 'This template may be used on any site. It does not require site-by-site permission.' })
  universal: boolean

  @Field({ description: 'Any template not found in the currently running source code will be marked as deleted upon startup.' })
  deleted: boolean

  @Field(type => [TemplateArea], { description: 'If this template is a page or component template, areas are the slots it provides for child placement. Each area will have a list of acceptable child component templates. These will be validated when creating a new component on a page.' })
  areas: TemplateArea[]

  @Field(type => JsonData, { nullable: true, description: 'Hard-coded properties that may be set on page templates to influence the rendering of components on the page. For instance, a set of color choices that are customized for each template design. Components on the page may refer to the color information stored in the template during dialogs and while rendering. Changing to a different page template could then result in different color choices for components like buttons. Will be null for non-page templates.' })
  templateProperties?: any

  constructor (row: any) {
    this.id = row.id
    this.key = row.key
    this.type = row.type
    this.deleted = !!row.deleted
    this.universal = !!row.universal
    const tmpl = templateRegistry.get(this.key)
    this.name = tmpl.name
    this.areas = Object.entries(tmpl.hydratedAreas).map(([key, area]) => new TemplateArea(key, area.availableComponents))
    if (tmpl.type === 'page') this.templateProperties = tmpl.templateProperties
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

  @Field({ nullable: true })
  universal?: boolean
}

@ObjectType()
export class TemplatePermissions {}

@ObjectType()
export class TemplateArea {
  @Field()
  name: string

  _availableComponentSet: Set<string>
  availableComponents: string[]

  constructor (name: string, availableComponents: string[]) {
    this.name = name
    this.availableComponents = availableComponents
    this._availableComponentSet = new Set(availableComponents)
  }

  addAvailableComponent (availableComponent: string) {
    this._availableComponentSet.add(availableComponent)
    this.availableComponents = Array.from(this._availableComponentSet)
  }
}
