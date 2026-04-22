import { Context } from '@txstate-mws/graphql-server'
import { Resolver, Query, Arg, Ctx, FieldResolver, Root, Mutation, ID } from 'type-graphql'
import {
  ScheduledPublish, ScheduledPublishFilter, ScheduledPublishResponse,
  ScheduledPublishPermissions, ScheduledPublishService,
  CreateScheduledPublishInput, UpdateScheduledPublishInput,
  Page, PageServiceInternal, User, UserService
} from '../internal.js'

@Resolver(of => ScheduledPublish)
export class ScheduledPublishResolver {
  @Query(returns => [ScheduledPublish], { description: 'Retrieve scheduled publish entries. Defaults to showing only active schedules.' })
  async scheduledPublishes (@Ctx() ctx: Context, @Arg('filter', { nullable: true }) filter?: ScheduledPublishFilter) {
    return await ctx.svc(ScheduledPublishService).find(filter)
  }

  @Mutation(returns => ScheduledPublishResponse, { description: 'Schedule a future publish or unpublish action for a page.' })
  async createScheduledPublish (
    @Ctx() ctx: Context,
    @Arg('args') args: CreateScheduledPublishInput,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(ScheduledPublishService).create(args, validateOnly)
  }

  @Mutation(returns => ScheduledPublishResponse, { description: 'Update a scheduled publish entry.' })
  async updateScheduledPublish (
    @Ctx() ctx: Context,
    @Arg('scheduledPublishId', type => ID) scheduledPublishId: string,
    @Arg('args') args: UpdateScheduledPublishInput,
    @Arg('validateOnly', { nullable: true, description: 'When true, the mutation will not save but will return the validation response as normal.' }) validateOnly?: boolean
  ) {
    return await ctx.svc(ScheduledPublishService).update(scheduledPublishId, args, validateOnly)
  }

  @Mutation(returns => ScheduledPublishResponse, { description: 'Cancel a scheduled publish entry.' })
  async cancelScheduledPublish (
    @Ctx() ctx: Context,
    @Arg('scheduledPublishId', type => ID) scheduledPublishId: string
  ) {
    return await ctx.svc(ScheduledPublishService).cancel(scheduledPublishId)
  }

  @FieldResolver(returns => Page, { nullable: true, description: 'The page this schedule applies to.' })
  async page (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(PageServiceInternal).findByInternalId(schedule.pageInternalId)
  }

  @FieldResolver(returns => User, { nullable: true, description: 'The user who created this schedule entry.' })
  async createdByUser (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(UserService).findById(schedule.createdBy)
  }

  @FieldResolver(returns => User, { nullable: true, description: 'The user who last updated this schedule entry. This is the user whose permissions will be used when executing.' })
  async updatedByUser (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(UserService).findById(schedule.updatedBy)
  }

  @FieldResolver(returns => Boolean, { description: 'Returns true if the updatedBy user no longer has permission. Always false for non-pending schedules.' })
  async actionNotPermitted (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(ScheduledPublishService).actionNotPermitted(schedule)
  }

  @FieldResolver(returns => ScheduledPublishPermissions, {
    description: 'Reveal the simplified results after all authorization rules are taken into account for the current user.'
  })
  permissions (@Root() schedule: ScheduledPublish) {
    return schedule
  }
}

@Resolver(of => ScheduledPublishPermissions)
export class ScheduledPublishPermissionsResolver {
  @FieldResolver(returns => Boolean, { description: 'User may edit this schedule entry.' })
  async edit (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(ScheduledPublishService).mayEdit(schedule)
  }

  @FieldResolver(returns => Boolean, { description: 'User may cancel this schedule entry.' })
  async cancel (@Ctx() ctx: Context, @Root() schedule: ScheduledPublish) {
    return await ctx.svc(ScheduledPublishService).mayCancel(schedule)
  }
}
