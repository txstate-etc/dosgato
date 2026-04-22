import { Field, InputType, Int, ObjectType, registerEnumType } from 'type-graphql'

@InputType()
export class Pagination {
  @Field(type => Int, { nullable: true, description: 'Page number for pagination.' })
  page?: number

  @Field(type => Int, { nullable: true, description: 'Number of results per page.' })
  perPage?: number
}

enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC'
}

registerEnumType(SortDirection, {
  name: 'SortDirection',
  description: 'Direction to sort results.'
})

@ObjectType()
@InputType('SortEntryInput')
export class SortEntry {
  @Field({ description: 'Field to sort by.' })
  field!: string

  @Field(type => SortDirection, { description: 'Sort direction, either ASC or DESC.' })
  direction!: SortDirection
}

@ObjectType()
export class PaginationResponse {
  @Field(type => Int, { description: 'Total number of results available.' })
  finalPage: number

  @Field(type => Int, { description: 'Current page number.' })
  page: number

  @Field(type => Int, { description: 'Number of results per page.' })
  perPage: number

  @Field(type => [SortEntry], { nullable: true, description: 'If sorting was applied, the sort order used.' })
  sortOrder?: SortEntry[]

  constructor (info?: { finalPage?: number, page?: number, perPage?: number, sortOrder?: SortEntry[] }) {
    this.page = info?.page ?? 1
    this.perPage = info?.perPage ?? (info?.page != null ? 100 : 1000000)
    this.finalPage = info?.finalPage ?? this.page
    this.sortOrder = info?.sortOrder
  }
}

@ObjectType()
export class PageInformation {}
