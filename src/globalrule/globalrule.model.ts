import { Field, ObjectType } from 'type-graphql'

@ObjectType()
export class GlobalRule {
  @Field({ description: 'When true, any user with this role will be able to create/read/update/delete all roles, add roles to users and groups, and add users to groups.' })
  manageUsers: boolean

  constructor (row: any) {
    this.manageUsers = row.manageUsers
  }
}

@ObjectType()
export class GlobalRulePermissions {}
