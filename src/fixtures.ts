/* eslint-disable @typescript-eslint/no-unused-vars */
import db from 'mysql2-async/db'
import { VersionedService, Index } from './versionedservice'
import { Context } from '@txstate-mws/graphql-server'
import stringify from 'fast-json-stable-stringify'
import { nanoid } from 'nanoid'

export async function fixtures () {
  console.log('running fixtures()')
  await db.transaction(async db => {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0')
    await Promise.all([
      db.execute('TRUNCATE TABLE downloads'),
      db.execute('TRUNCATE TABLE globalrules'),
      db.execute('TRUNCATE TABLE mutationlog'),
      db.execute('TRUNCATE TABLE datarules'),
      db.execute('TRUNCATE TABLE data'),
      db.execute('TRUNCATE TABLE pagetrees_templates'),
      db.execute('TRUNCATE TABLE assetrules'),
      db.execute('TRUNCATE TABLE pagerules'),
      db.execute('TRUNCATE TABLE sites_templates'),
      db.execute('TRUNCATE TABLE resizes'),
      db.execute('TRUNCATE TABLE users_roles'),
      db.execute('TRUNCATE TABLE groups_roles'),
      db.execute('TRUNCATE TABLE users_groups'),
      db.execute('TRUNCATE TABLE siterules'),
      db.execute('TRUNCATE TABLE groups_groups'),
      db.execute('TRUNCATE TABLE assets'),
      db.execute('TRUNCATE TABLE sites_managers'),
      db.execute('TRUNCATE TABLE templaterules'),
      db.execute('TRUNCATE TABLE datafolders'),
      db.execute('TRUNCATE TABLE binaries'),
      db.execute('TRUNCATE TABLE pages'),
      db.execute('TRUNCATE TABLE roles'),
      db.execute('TRUNCATE TABLE groups'),
      db.execute('TRUNCATE TABLE templates'),
      db.execute('TRUNCATE TABLE pagetrees'),
      db.execute('TRUNCATE TABLE assetfolders'),
      db.execute('TRUNCATE TABLE organizations'),
      db.execute('TRUNCATE TABLE indexes'),
      db.execute('TRUNCATE TABLE tags'),
      db.execute('TRUNCATE TABLE versions'),
      db.execute('TRUNCATE TABLE sites'),
      db.execute('TRUNCATE TABLE users'),
      db.execute('TRUNCATE TABLE indexvalues'),
      db.execute('TRUNCATE TABLE storage')
    ])
    await db.execute('SET FOREIGN_KEY_CHECKS = 1')
  })

  const [su01, su02, su03, ed01, ed02, ed03, ed04, ed05, ed06, ed07, inactive1] = await Promise.all([
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su01", "Michael Scott", "su01@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su02", "Elizabeth Bennet", "su02@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su03", "Marge Simpson", "su03@example.com", "2021-09-01 12:43:00", "2021-09-01 16:28:00", null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed01", "Draco Malfoy", "ed01@example.com", "2021-07-15 11:15:00", "2021-07-15 13:07:00", null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed02", "Forrest Gump", "ed02@example.com", "2021-02-01 08:23:00", "2021-02-01 11:33:00", null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed03", "Luke Skywalker", "ed03@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed04", "Katniss Everdeen", "ed04@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed05", "Jean Valjean", "ed05@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed06", "Daniel Tiger", "ed06@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed07", "Jack Skellington", "ed07@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES("ed08", "Inactive User", "ed08@example.com", null, null, "2021-08-22 15:02:00")')
  ])
  const [group1, group2, group3, group4, group5, group6, group7] = await Promise.all([
    db.insert('INSERT INTO groups (name) VALUES ("group1")'),
    db.insert('INSERT INTO groups (name) VALUES ("group2")'),
    db.insert('INSERT INTO groups (name) VALUES ("group3")'),
    db.insert('INSERT INTO groups (name) VALUES ("group4")'),
    db.insert('INSERT INTO groups (name) VALUES ("group5")'),
    db.insert('INSERT INTO groups (name) VALUES ("group6")'),
    db.insert('INSERT INTO groups (name) VALUES ("group7")')
  ])
  const [superuserRole, editorRole, site1editorRole, site2editorRole, site3editorRole, group6Role, group7Role,
    site1siterulestest1, site1siterulestest2, site2siterulestest1, siteLauncherRole, templaterulestest1, templaterulestest2] = await Promise.all([
    db.insert('INSERT INTO roles (name) VALUES ("superuser")'),
    db.insert('INSERT INTO roles (name) VALUES ("editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site2-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site3-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("group6role")'),
    db.insert('INSERT INTO roles (name) VALUES ("group7role")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-siterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-siterulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("site2-siterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("siteLauncher")'),
    db.insert('INSERT INTO roles (name) VALUES ("templaterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("templaterulestest2")')
  ])

  const [artCollegeOrg, mathDeptOrg, officeOrg] = await Promise.all([
    db.insert('INSERT INTO organizations (name) VALUES ("College of Arts and Crafts")'),
    db.insert('INSERT INTO organizations (name) VALUES ("Department of Mathematics")'),
    db.insert('INSERT INTO organizations (name) VALUES ("The Office")')
  ])

  const [site1, site2, site3] = await Promise.all([
    db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site1', artCollegeOrg, ed02]),
    db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site2', mathDeptOrg, su01]),
    db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site3', officeOrg, su03])
  ])

  const [pagetree1, pagetree2, pagetree3sandbox, pagetree3] = await Promise.all([
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['pagetree1', site1, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['pagetree2', site2, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId) VALUES (?,?)', ['pagetree3sandbox', site3]),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES(?,?,?)', ['pagetree3', site3, 'primary'])
  ])

  const [pagetemplate1, pagetemplate2, pagetemplate3, pagetemplate4, componenttemplate1, componenttemplate2, componenttemplate3, datatemplate1, datatemplate2, articleTemplate] = await Promise.all([
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyp1", "pagetemplate1", "page", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyp2", "pagetemplate2", "page", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyp3", "pagetemplate3", "page", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyp4", "pagetemplate4", "page", 1)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyc1", "componenttemplate1", "component", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyc2", "componenttemplate2", "component", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyc3", "componenttemplate3", "component", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyd1", "datatemplate1", "data", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("keyd2", "datatemplate2", "data", 0)'),
    db.insert('INSERT INTO templates (`key`, `name`, `type`, `deleted`) VALUES ("articledatakey", "articledata", "data", 0)')
  ])

  await Promise.all([
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?, ?, 1)', [superuserRole, pagetemplate1])
  ])

  await Promise.all([
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree1, site1]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree2, site2]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree3, site3])
  ])

  await Promise.all([
    db.insert('INSERT INTO users_groups (userId, groupId, manager) VALUES (?,?,?)', [su01, group1, 1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su01, group2]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su01, group3]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su02, group2]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed01, group1]),
    db.insert('INSERT INTO users_groups (userId, groupId, manager) VALUES (?,?,?)', [ed02, group3, 1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed02, group4]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su03, group4]),
    db.insert('INSERT INTO users_groups (userId, groupId, manager) VALUES (?,?,?)', [su03, group1, 1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed03, group6]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed04, group7]),
    db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [group1, group2]),
    db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [group1, group3]),
    db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [group2, group4]),
    db.insert('INSERT INTO groups_groups (parentId, childId) VALUES (?,?)', [group6, group7]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [su01, superuserRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [su02, superuserRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [su03, superuserRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [su03, editorRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed01, editorRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed02, site1editorRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed05, group6Role]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed05, siteLauncherRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, site1siterulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, site1siterulestest2]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, site2siterulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed07, templaterulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed07, templaterulestest2]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group3, site2editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group1, site3editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group3, editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group6, group6Role]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group7, group7Role]),
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site1, ed04]),
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site1, ed05]),
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site2, su02]),
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site3, ed01]),
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site3, ed03]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree1, pagetemplate1]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree2, pagetemplate2]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree3sandbox, pagetemplate2]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree3, pagetemplate3]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site2, pagetemplate1]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site1, pagetemplate2]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site3, pagetemplate3]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site1, pagetemplate3])
  ])

  await Promise.all([
    db.insert('INSERT INTO globalrules (roleId, manageUsers) VALUES (?,?)', [superuserRole, 1]),
    db.insert('INSERT INTO globalrules (roleId, manageUsers) VALUES (?,?)', [group6Role, 1]),
    db.insert('INSERT INTO siterules (roleId, launch) VALUES (?,?)', [siteLauncherRole, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, manageOwners, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?,?,?,?)', [superuserRole, site1, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, manageOwners, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?,?,?,?)', [superuserRole, site2, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, manageOwners, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?,?,?,?)', [superuserRole, site3, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, manageOwners, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?,?,?,?)', [site1editorRole, site1, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, manageOwners) VALUES (?,?,?,?,?)', [site1siterulestest1, site1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?)', [site1siterulestest2, site1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, managePagetrees, promotePagetree, `delete`, undelete) VALUES (?,?,?,?,?,?,?)', [site2siterulestest1, site2, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?)', [site1editorRole, site1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `path`, `viewlatest`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `path`, `viewlatest`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [site1editorRole, site1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `viewlatest`, `create`, `update`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [superuserRole, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate1, 1]),
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate2, 1]),
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate3, 0]),
    db.insert('INSERT INTO templaterules (`roleId`, `use`) VALUES (?,?)', [templaterulestest2, 1])
  ])

  async function createPage (name: string, linkId: string, pagetreeId: number, parentId: number | null, displayOrder: number, pageData: any, indexes: Index[]) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)

    const pageId = await db.transaction(async db => {
      const parentsPath = parentId && await db.getval<string>('SELECT p.path FROM pages p WHERE p.id=?', [parentId])
      const path = `${parentsPath ?? ''}${parentsPath === '/' ? '' : '/'}${parentId ?? ''}`
      const dataId = await versionedService.create('testdata_page', pageData, indexes, 'su01')
      return await db.insert('INSERT INTO pages (name, pagetreeId, path, displayOrder, dataId, linkId) VALUES (?,?,?,?,?,?)', [name, pagetreeId, path, displayOrder, dataId, linkId])
    })
    return pageId
  }

  /* Site 1, Pagetree 1 Pages */
  const rootLinkId = nanoid(10)
  const aboutLinkId = nanoid(10)
  const programsLinkId = nanoid(10)
  const contactLinkId = nanoid(10)
  const locationLinkId = nanoid(10)
  const peopleLinkId = nanoid(10)
  const ugradLinkId = nanoid(10)
  const gradLinkId = nanoid(10)
  const facultyLinkId = nanoid(10)
  const staffLinkId = nanoid(10)
  const eventsLinkId = nanoid(10)

  // root page
  let indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: aboutLinkId }),
        stringify({ siteId: site1, path: '/site1/about' }),
        stringify({ linkId: programsLinkId }),
        stringify({ siteId: site1, path: '/site1/programs' }),
        stringify({ linkId: contactLinkId }),
        stringify({ siteId: site1, path: '/site1/contact' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc1', 'keyc2']
    }
  ]
  const site1pagetree1Root = await createPage('site1', rootLinkId, pagetree1, null, 1, { title: 'Basketry Home' }, indexes)

  // about page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: 'location' }),
        stringify({ siteId: site1, path: '/site1/about/location' }),
        stringify({ linkId: 'people' }),
        stringify({ siteId: site1, path: '/site1/about/people' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc3']
    }
  ]
  const site1pagetree1About = await createPage('about', aboutLinkId, pagetree1, site1pagetree1Root, 1, { title: 'About' }, indexes)

  // location page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: contactLinkId }),
        stringify({ siteId: site1, path: '/site1/contact' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc1']
    }
  ]
  await createPage('location', locationLinkId, pagetree1, site1pagetree1About, 1, { title: 'Location' }, indexes)

  // people page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: facultyLinkId }),
        stringify({ siteId: site1, path: '/site1/about/people/faculty' }),
        stringify({ linkId: staffLinkId }),
        stringify({ siteId: site1, path: '/site1/about/people/staff' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc1', 'keyc2']
    }
  ]
  const site1pagetree1People = await createPage('people', peopleLinkId, pagetree1, site1pagetree1About, 2, { title: 'People' }, indexes)

  // faculty page
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('faculty', facultyLinkId, pagetree1, site1pagetree1People, 1, { title: 'Faculty' }, indexes)

  // staff page
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('staff', staffLinkId, pagetree1, site1pagetree1People, 2, { title: 'Staff' }, indexes)

  // programs page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: ugradLinkId }),
        stringify({ siteId: site1, path: '/site1/programs/undergrad' }),
        stringify({ linkId: gradLinkId }),
        stringify({ siteId: site1, path: '/site1/programs/grad' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc2']
    }
  ]
  const site1pagetree1Programs = await createPage('programs', programsLinkId, pagetree1, site1pagetree1Root, 2, { title: 'Programs' }, indexes)

  // undergrad page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: gradLinkId }),
        stringify({ siteId: site1, path: '/site1/programs/grad' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('undergrad', ugradLinkId, pagetree1, site1pagetree1Programs, 1, { title: 'Undergraduate Programs' }, indexes)

  // grad page
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: ugradLinkId }),
        stringify({ siteId: site1, path: '/site1/programs/undergrad' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('grad', gradLinkId, pagetree1, site1pagetree1Programs, 2, { title: 'Graduate Programs' }, indexes)

  // contact page
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc2', 'keyc3']
    }
  ]
  await createPage('contact', contactLinkId, pagetree1, site1pagetree1Root, 3, { title: 'Contact Us' }, indexes)

  // events page
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc1']
    }
  ]
  const site1pagetree1Events = await createPage('events', eventsLinkId, pagetree1, site1pagetree1About, 3, { title: 'Special Events' }, indexes)
  await db.update('UPDATE pages SET deletedAt = NOW(), deletedBy = ? WHERE id = ?', [su01, site1pagetree1Events])
  console.log('finished fixtures()')

  /* Site 2, Pagetree 2 Pages */
  const site2RootLinkId = nanoid(10)
  // root
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp2', 'keyc3']
    }
  ]
  await createPage('site2', site2RootLinkId, pagetree2, null, 1, { title: 'Site 2 Home' }, indexes)

  /* Site 3, Pagetree 3 Pages */
  const site3RootLinkId = nanoid(10)
  const site3AboutLinkId = nanoid(10)
  const site3SiteMapLinkId = nanoid(10)
  // root
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: site3AboutLinkId }),
        stringify({ siteId: site3, path: '/site3/about' }),
        stringify({ linkId: site3SiteMapLinkId }),
        stringify({ siteId: site3, path: '/site3/sitemap' }),
        stringify({ linkId: rootLinkId }),
        stringify({ siteId: site1, path: '/site1' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp3', 'keyc1', 'keyc2']
    }
  ]
  const site3pagetree3Root = await createPage('site3', site3RootLinkId, pagetree3, null, 1, { title: 'Site 3 Home' }, indexes)
  // about
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp3', 'keyc2', 'keyc3']
    }
  ]
  await createPage('about', site3AboutLinkId, pagetree3, site3pagetree3Root, 1, { title: 'About Us' }, indexes)
  // site map
  indexes = [
    {
      name: 'templateKey',
      values: ['keyp3']
    }
  ]
  await createPage('sitemap', site3SiteMapLinkId, pagetree3, site3pagetree3Root, 2, { title: 'Site Map' }, indexes)

  /* Site 3, Sandbox Pages */
  const site3SandboxRootLinkId = nanoid(10)
  const site3AboutPageLinkId = nanoid(10)
  indexes = [
    {
      name: 'link_page',
      values: [
        stringify({ linkId: site3AboutLinkId }),
        stringify({ siteId: site3, path: '/site3/about' }),
        stringify({ linkId: site3SiteMapLinkId }),
        stringify({ siteId: site3, path: '/site3/sitemap' }),
        stringify({ linkId: rootLinkId }),
        stringify({ siteId: site1, path: '/site1' })
      ]
    },
    {
      name: 'templateKey',
      values: ['keyp2', 'keyc1', 'keyc2']
    }
  ]
  const site3SandboxRoot = await createPage('site3', site3SandboxRootLinkId, pagetree3sandbox, null, 1, { title: 'Site 3 Home' }, indexes)

  indexes = [
    {
      name: 'templateKey',
      values: ['keyp2']
    }
  ]
  await createPage('about', site3AboutPageLinkId, pagetree3sandbox, site3SandboxRoot, 1, { title: 'About Site 3' }, indexes)

  /* Data */
  const [datafolder1, datafolder2, datafolder3] = await Promise.all([
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId) VALUES (?,?,?,?)', ['site2datafolder', nanoid(10), site2, datatemplate1]),
    db.insert('INSERT INTO datafolders (name, guid, templateId) VALUES (?,?,?)', ['globaldatafolder', nanoid(10), articleTemplate]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId, deletedAt, deletedBy) VALUES (?,?,?,?,NOW(),?)', ['deletedfolder', nanoid(10), site2, datatemplate1, su03])
  ])

  async function createData (content: any, indexes: Index[], creator: string) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    const id = await db.transaction(async db => {
      const dataId = await versionedService.create('testdata_data', content, indexes, creator)
      return await db.insert('INSERT INTO data (dataId) VALUES (?)', [dataId])
    })
    return id
  }

  async function tagData (id: string, tag: string, version?: number, user?: string) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    await versionedService.tag(id, tag, version, user)
  }

  async function updateData (id: string, content: any, indexes: Index[], user?: string, comment?: string) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    await versionedService.update(id, content, indexes, { user, comment })
  }

  // TODO: Add more indexes?
  const data1Id = await createData({ title: 'Red Text', color: 'red', align: 'center' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data1Id])
  const dataIdData1 = await db.getval<string>('SELECT dataId FROM data WHERE id = ?', [data1Id])
  await updateData(dataIdData1!, { title: 'Red Text', color: 'red', align: 'left' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su03', 'updating alignment')
  await updateData(dataIdData1!, { title: 'Red Text', color: 'red', align: 'right' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su01', 'updating alignment again')

  const data2Id = await createData({ title: 'Blue Text', color: 'blue', align: 'left' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data2Id])

  const data3Id = await createData({ title: 'Orange Text', color: 'orange', align: 'right' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ?, deletedAt = NOW(), deletedBy = ? WHERE id = ?', [site2, datafolder1, su01, data3Id])

  const data4Id = await createData({ title: 'Green Text', color: 'green', align: 'center' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data4Id])

  // some global data that does not belong to a site
  const article1Id = await createData({ title: '5 Steps to a Cleaner Car', author: 'Jane Doe' }, [{ name: 'templateKey', values: ['articledatakey'] }], 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article1Id])
  const dataIdArticle1 = await db.getval<string>('SELECT dataId FROM data WHERE id = ?', [article1Id])
  await tagData(dataIdArticle1!, 'published', 1, 'su02')

  const article2Id = await createData({ title: 'Trees of Central Texas', author: 'John Smith' }, [{ name: 'templateKey', values: ['articledatakey'] }], 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article2Id])

  const article3Id = await createData({ title: 'The Secret Lives of Ladybugs', author: 'Jack Frost' }, [{ name: 'templateKey', values: ['articledatakey'] }], 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article3Id])

  // data not in a folder
  await Promise.all([
    createData({ name: 'Cottonwood Hall', floors: 3 }, [{ name: 'templateKey', values: ['keyd2'] }], 'su01'),
    createData({ name: 'Student Center', floors: 4 }, [{ name: 'templateKey', values: ['keyd2'] }], 'su01'),
    createData({ name: 'Aquatics Center', floors: 2 }, [{ name: 'templateKey', values: ['keyd2'] }], 'su01')
  ])

  // deleted data
  const deletedDataId = await createData({ title: 'Purple Text', color: 'purple', align: 'left' }, [{ name: 'templateKey', values: ['keyd1'] }], 'su02')
  await db.update('UPDATE data SET folderId = ?, deletedAt = NOW(), deletedBy = ? WHERE id = ?', [datafolder3, su02, deletedDataId])
}
