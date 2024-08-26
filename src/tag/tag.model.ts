import type { DataData } from '@dosgato/templating'
import { ObjectType, Field, registerEnumType, ID } from 'type-graphql'
import { Data } from '../internal.js'

@ObjectType()
export class UserTagGroup {
  @Field(type => ID)
  id: string

  @Field()
  name: string

  @Field()
  internal: boolean

  @Field({ description: 'Allows an editor to disable this group with the possibility of bringing it back later without losing all the associations to its tags.' })
  enabled: boolean

  @Field()
  title: string

  @Field({ description: 'The group title is something meaningless like "Misc" or "Ungrouped". If this is true, we never want to prefix the tag name with the group title.' })
  excludeTitle: boolean

  @Field(type => [TagApplicable], { description: 'Tag may be applied to these DosGato object types.' })
  applicable: TagApplicable[]

  @Field(type => [UserTag])
  tags: UserTag[]

  constructor (group: UserTagGroupData, entry: Data) {
    this.id = entry.id
    this.enabled = group.enabled
    this.name = entry.name
    this.title = group.title
    this.excludeTitle = !!group.excludeTitle
    this.applicable = group.applicable
    this.internal = !!group.internal
    this.tags = group.tags.map(t => new UserTag(t, this))
  }
}

@ObjectType()
export class UserTag {
  @Field(type => ID, { description: 'A unique id for the tag that survives renames.' })
  id: string

  @Field()
  group: UserTagGroup

  @Field()
  name: string

  @Field({ description: 'Allows the editor to disable a tag with the possibility of bringing it back later without losing all its associations.' })
  disabled: boolean

  constructor (tag: UserTagData, group: UserTagGroup) {
    this.id = tag.id
    this.group = group
    this.name = tag.name
    this.disabled = !!tag.disabled
  }
}

export enum TagApplicable {
  PAGE = 'page',
  ASSET = 'asset',
  DATA = 'data'
}

registerEnumType(TagApplicable, {
  name: 'TagApplicable',
  description: 'User Tag Groups may be identified as applicable to pages, assets, or data entries or any combination thereof.',
  valuesConfig: {
    PAGE: { description: 'Tags are eligible to be applied to any page.' },
    ASSET: { description: 'Tags are eligible to be applied to any asset.' },
    DATA: { description: 'Tags are eligible to be applied to any data entry.' }
  }
})

export interface UserTagData {
  id: string
  name: string
  disabled?: boolean
}

export interface UserTagGroupData extends DataData {
  applicable: TagApplicable[]
  disabled?: boolean
  internal?: boolean
  title: string
  excludeTitle?: boolean
  tags: UserTagData[]
}
