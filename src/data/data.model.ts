import { DateTime } from 'luxon'
import { isNotNull } from 'txstate-utils'
import { Field, InputType, Int, ObjectType } from 'type-graphql'
import { UrlSafeString } from '../scalars/urlsafestring'

@ObjectType()
export class Data {
  @Field(type => Int)
  id: number

  @Field({ description: 'The type of data this represents, such as homepage-news or global-link. Must be a lower-case URL-safe string.' })
  type: UrlSafeString

  @Field({ description: 'Data has been soft-deleted but is still recoverable.' })
  deleted: boolean

  @Field({ nullable: true, description: 'Date this data was soft-deleted, null when not applicable.' })
  deletedAt?: DateTime

  deletedBy: number|null
  dataId: string

  constructor (row: any) {
    this.id = row.id
    this.type = row.type
    this.dataId = row.data_id
    this.deleted = isNotNull(row.deleted)
    this.deletedAt = DateTime.fromJSDate(row.deleted)
    this.deletedBy = row.deleted_by
  }
}

@InputType()
export class DataFilter {
  @Field(type => [Int], { nullable: true })
  ids?: number[]

  @Field(type => [UrlSafeString], { nullable: true })
  types?: string[]

  @Field(type => Boolean, { nullable: false, description: 'true -> return only deleted datas, false -> return only nondeleted datas, undefined -> return all datas' })
  deleted?: boolean
}

@ObjectType()
export class DataPermissions {}
