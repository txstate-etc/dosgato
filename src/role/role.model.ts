import { Field, InputType, Int, ObjectType } from 'type-graphql'

@ObjectType()
export class Role {
  @Field(type => Int)
  id: number

  @Field()
  name: string

  @Field({ description: 'When true, any user with this role will be considered a superadmin.' })
  admin: boolean

  constructor (row: any) {
    this.id = row.id
    this.name = row.name
    this.admin = row.admin
  }
}

@InputType()
export class RoleFilter {
  @Field(type => [Int])
  ids?: number[]
}

@ObjectType()
export class RolePermissions {}
