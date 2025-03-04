import { type DataData } from '@dosgato/templating'
import { Context } from '@txstate-mws/graphql-server'
import { existsSync } from 'fs'
import { DateTime } from 'luxon'
import { extension } from 'mime-types'
import db from 'mysql2-async/db'
import { nanoid } from 'nanoid'
import { stringify } from 'txstate-utils'
import { VersionedService, type Index, setAssetSearchCodes, setPageSearchCodes } from '../src/internal.js'

export async function fixtures () {
  console.info('running fixtures()')
  const [su01, su02, su03, ed01, ed02, ed03, ed04, ed05, ed06, ed07, ed08, ed09, ed10, ed11, ed12, ed13, ed14, ed15, ed16, ed17, ed18] = await Promise.all([
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("su01", "Michael", "Scott", "su01@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("su02", "Elizabeth", "Bennet", "su02@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("su03", "Marge", "Simpson", "su03@example.com", "2021-09-01 12:43:00", "2021-09-01 16:28:00", null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed01", "Draco", "Malfoy", "ed01@example.com", "2021-07-15 11:15:00", "2021-07-15 13:07:00", null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed02", "Forrest", "Gump", "ed02@example.com", "2021-02-01 08:23:00", "2021-02-01 11:33:00", null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed03", "Luke", "Skywalker", "ed03@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed04", "Katniss", "Everdeen", "ed04@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed05", "Jean", "Valjean", "ed05@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed06", "Daniel", "Tiger", "ed06@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES ("ed07", "Jack", "Skellington", "ed07@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, firstname, lastname, email, lastlogin, lastlogout, disabledAt) VALUES("ed08", "Inactive", "User", "ed08@example.com", null, null, "2021-08-22 15:02:00")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed09", "Oscar", "Grouch", "ed09@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed10", "Testuser", "Mutations", "ed10@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed11", "Test", "Assetrules", "ed11@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed12", "Test", "PageRules1", "ed12@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed13", "Test", "PageRules2", "ed13@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed14", "Test", "DataRules1", "ed14@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed15", "Test", "DataRules2", "ed15@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed16", "Test", "SiteRoles", "ed16@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed17", "Test", "PageRoles1", "ed17@example.com")'),
    db.insert('INSERT INTO users (login, firstname, lastname, email) VALUES ("ed18", "Test", "PageRoles2", "ed18@example.com")'),
    db.insert('INSERT INTO users (login, lastname, email, system) VALUES ("service1", "ServiceAccount1", "sa1@example.com", true)')
  ])

  const basicId = await db.getval('SELECT MIN(id) FROM trainings')
  const binds: any[] = []
  await db.insert(`INSERT INTO users_trainings (userId, trainingId) VALUES ${db.in(binds, [su01, su02, su03, ed01, ed02, ed03, ed05, ed06, ed07, ed08, ed09, ed10, ed11, ed12, ed13, ed14, ed15, ed16, ed17, ed18].map(lgn => [lgn, basicId]))}`, binds)

  const [group1, group2, group3, group4, group5, group6, group7] = await Promise.all([
    db.insert('INSERT INTO groups (name) VALUES ("group1")'),
    db.insert('INSERT INTO groups (name) VALUES ("group2")'),
    db.insert('INSERT INTO groups (name) VALUES ("group3")'),
    db.insert('INSERT INTO groups (name) VALUES ("group4")'),
    db.insert('INSERT INTO groups (name) VALUES ("group5")'),
    db.insert('INSERT INTO groups (name) VALUES ("group6")'),
    db.insert('INSERT INTO groups (name) VALUES ("group7")')
  ])

  const [artCollegeOrg, mathDeptOrg, officeOrg] = await Promise.all([
    db.insert('INSERT INTO organizations (name, externalId) VALUES ("College of Arts and Crafts", ?)', [nanoid(10)]),
    db.insert('INSERT INTO organizations (name, externalId) VALUES ("Department of Mathematics", ?)', [nanoid(10)]),
    db.insert('INSERT INTO organizations (name, externalId) VALUES ("The Office", ?)', [nanoid(10)])
  ])

  const [site1, site2, site3, site4, site5, site6, site7, site8, deletedsite] = ([
    await db.insert('INSERT INTO sites (name, organizationId, ownerId, launchHost, launchPath, launchEnabled) VALUES (?,?,?,?,?,?)', ['site1', artCollegeOrg, ed02, 'www.college.edu', '/site1/', true]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site2', mathDeptOrg, su01]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId, launchHost, launchPath, launchEnabled) VALUES (?,?,?,?,?,?)', ['site3', officeOrg, su03, 'www.example.com', '/site3/', true]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site4', artCollegeOrg, ed10]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site5', artCollegeOrg, su01]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site6', officeOrg, su02]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site7', officeOrg, su01]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId) VALUES (?,?,?)', ['site8', officeOrg, su02]),
    await db.insert('INSERT INTO sites (name, organizationId, ownerId, deletedAt, deletedBy) VALUES (?,?,?, NOW(), ?)', ['deletedsite', artCollegeOrg, ed10, su01])
  ])

  const [superuserRole, editorRole, site1editorRole, site2editorRole, site3editorRole, group6Role, group7Role,
    site1siterulestest1, site1siterulestest2, site2siterulestest1, site5siterulestest1, site5siterulestest2,
    site5siterulestest3, siteLauncherRole, templaterulestest1, templaterulestest2, assetrulestest1, assetrulestest2,
    assetrulestest3, assetrulestest4, assetrulestest5, pagerulestest1, pagerulestest2, pagerulestest3, pagerulestest4,
    datarulestest1, datarulestest2, datarulestest3, datarulestest4, siterolestest1, siterolestest2,
    datarolestest1, datarolestest2, pagerolestest1, pagerolestest2] = await Promise.all([
    db.getval('SELECT id FROM roles WHERE name="superuser"') as Promise<number>,
    db.insert('INSERT INTO roles (name) VALUES ("editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site2-editor")'),
    db.insert('INSERT INTO roles (name, siteId) VALUES ("site3-editor", ?)', [site3]),
    db.insert('INSERT INTO roles (name) VALUES ("group6role")'),
    db.insert('INSERT INTO roles (name) VALUES ("group7role")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-siterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-siterulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("site2-siterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("site5-siterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("site5-siterulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("site5-siterulestest3")'),
    db.insert('INSERT INTO roles (name) VALUES ("siteLauncher")'),
    db.insert('INSERT INTO roles (name) VALUES ("templaterulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("templaterulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("assetrulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("assetrulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("assetrulestest3")'),
    db.insert('INSERT INTO roles (name) VALUES ("assetrulestest4")'),
    db.insert('INSERT INTO roles (name) VALUES ("assetrulestest5")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerulestest3")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerulestest4")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarulestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarulestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarulestest3")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarulestest4")'),
    db.insert('INSERT INTO roles (name) VALUES ("siterolestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("siterolestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarolestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("datarolestest2")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerolestest1")'),
    db.insert('INSERT INTO roles (name) VALUES ("pagerolestest2")')
  ])

  const [pagetree1, pagetree2, pagetree3sandbox, pagetree3, pagetree4, pagetree4archive, pagetree4deleted, pagetree5, pagetree6, pagetree7, pagetree8, deletedSitePrimary] = await Promise.all([
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site1', site1, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site2', site2, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site3-sandbox', site3, 'sandbox']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES(?,?,?)', ['site3', site3, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site4', site4, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type, createdAt, archivedAt) VALUES(?, ?, ?, NOW(), NOW())', ['site4-archive', site4, 'archive']),
    db.insert('INSERT INTO pagetrees (name, siteId, type, createdAt, archivedAt, deletedAt, deletedBy) VALUES(?, ?, ?, NOW(), NOW(), NOW(), ?)', ['site4-archive-1', site4, 'archive', su01]),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site5', site5, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site6', site6, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site7', site7, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['site8', site8, 'primary']),
    db.insert('INSERT INTO pagetrees (name, siteId, type) VALUES (?,?,?)', ['deletedsite', deletedsite, 'primary'])
  ])

  const [pagetemplate1, pagetemplate2, pagetemplate3, datatemplate1, datatemplate2, articleTemplate, linkTemplate] = await Promise.all([
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['keyp1']),
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['keyp2']),
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['keyp3']),
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['keyd1']),
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['keyd2']),
    await db.getval<number>('SELECT id FROM templates WHERE `key` = ?', ['articledatakey']),
    await db.getval<number>('SELECT ID FROM templates WHERE `key` = ?', ['keyc1'])
  ])

  const [site1AssetRoot, site2AssetRoot, site3AssetRoot, site4AssetRoot, site5AssetRoot, site6AssetRoot, site7AssetRoot, site8AssetRoot, deletedsiteAssetRoot] = await Promise.all([
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site1, pagetree1, nanoid(10), '/', 'site1']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site2, pagetree2, nanoid(10), '/', 'site2']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site3, pagetree3, nanoid(10), '/', 'site3']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site4, pagetree4, nanoid(10), '/', 'site4']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site5, pagetree5, nanoid(10), '/', 'site5']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site6, pagetree6, nanoid(10), '/', 'site6']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site7, pagetree7, nanoid(10), '/', 'site7']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), '/', 'site8']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [deletedsite, deletedSitePrimary, nanoid(10), '/', 'deletedsite']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site4, pagetree4archive, nanoid(10), '/', 'site4-archive']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site4, pagetree4deleted, nanoid(10), '/', 'site4-archive-1']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site3, pagetree3sandbox, nanoid(10), '/', 'site3-sandbox'])
  ])
  const site1Images = await db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES (?, ?, ?, ?, ?)', [site1, pagetree1, nanoid(10), `/${site1AssetRoot}`, 'images'])
  const [assetFolderA, assetFolderB, assetFolderC, assetFolderD, assetFolderE] = await Promise.all([
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}`, 'folder-a']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}`, 'folder-b']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}`, 'folder-c']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name, deletedAt, deletedBy, deleteState) VALUES(?, ?, ?, ?, ?, NOW(), ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}`, 'folder-d', su03, 2]),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}`, 'folder-e'])
  ])
  const [assetFolderF, assetFolderG, assetFolderH, assetFolderI, assetFolderJ] = await Promise.all([
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderA}`, 'folder-f']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderA}`, 'folder-g']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderC}`, 'folder-h']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderE}`, 'folder-i']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderE}`, 'folder-j'])
  ])
  const [assetFolderK, assetFolderL] = await Promise.all([
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderA}/${assetFolderG}`, 'folder-k']),
    db.insert('INSERT INTO assetfolders (siteId, pagetreeId, linkId, path, name) VALUES(?, ?, ?, ?, ?)', [site8, pagetree8, nanoid(10), `/${site8AssetRoot}/${assetFolderA}/${assetFolderG}`, 'folder-l'])
  ])

  await Promise.all([
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree1, site1]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree2, site2]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree3, site3]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree4, site4]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree5, site5]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree6, site6]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree7, site7]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [pagetree8, site8]),
    db.update('UPDATE sites SET primaryPagetreeId = ? WHERE id = ?', [deletedSitePrimary, deletedsite])
  ])

  await Promise.all([
    db.insert('INSERT INTO comments (siteId, comment, createdBy) VALUES (?,?,?)', [site3, 'Added owner su03', su01]),
    db.insert('INSERT INTO comments (siteId, comment, createdBy) VALUES (?,?,?)', [site3, 'Added managers ed01 and ed03', su01])
  ])

  await Promise.all([
    db.update('UPDATE roles SET siteId = ? WHERE id = ?', [site3, site3editorRole])
  ])

  await Promise.all([
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su01, group1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su01, group2]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su01, group3]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su02, group2]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed01, group1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed02, group3]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed02, group4]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su03, group4]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [su03, group1]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed03, group6]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed04, group7]),
    db.insert('INSERT INTO users_groups (userId, groupId) VALUES (?,?)', [ed10, group5]),
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
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed09, site3editorRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed10, superuserRole]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, assetrulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, assetrulestest2]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed11, assetrulestest3]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed11, assetrulestest4]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed06, assetrulestest5]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed12, pagerulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed12, pagerulestest2]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed13, pagerulestest3]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed14, datarulestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed14, datarulestest2]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed15, datarulestest3]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed15, datarulestest4]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed16, siterolestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed09, siterolestest2]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed17, pagerolestest1]),
    db.insert('INSERT INTO users_roles (userId, roleId) VALUES (?,?)', [ed18, pagerolestest2]),
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
    db.insert('INSERT INTO sites_managers (siteId, userId) VALUES (?,?)', [site2, ed10]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree1, pagetemplate1!]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree2, pagetemplate3!]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree3sandbox, pagetemplate2!]),
    db.insert('INSERT INTO pagetrees_templates (pagetreeId, templateId) VALUES (?,?)', [pagetree3, pagetemplate1!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site2, pagetemplate1!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site2, pagetemplate2!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site1, pagetemplate2!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site3, pagetemplate3!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site1, pagetemplate3!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site6, pagetemplate3!]),
    db.insert('INSERT INTO sites_templates (siteId, templateId) VALUES (?,?)', [site3, linkTemplate!])
  ])

  await Promise.all([
    db.insert('INSERT INTO globalrules (roleId, manageAccess) VALUES (?,?)', [group6Role, 1]),
    db.insert('INSERT INTO globalrules (roleId, manageAccess) VALUES (?,?)', [assetrulestest4, 1]),
    db.insert('INSERT INTO globalrules (roleId, manageAccess) VALUES (?,?)', [pagerulestest3, 1]),
    db.insert('INSERT INTO globalrules (roleId, manageAccess) VALUES (?,?)', [datarulestest3, 1])
  ])
  await Promise.all([
    db.insert('INSERT INTO siterules (roleId, launch) VALUES (?,?)', [siteLauncherRole, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, governance, manageState, `delete`) VALUES (?,?,?,?,?,?,?)', [site1editorRole, site1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, governance) VALUES (?,?,?,?,?)', [site1siterulestest1, site1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, manageState, `delete`) VALUES (?,?,?,?)', [site1siterulestest2, site1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, manageState, `delete`) VALUES (?,?,?,?,?)', [site2siterulestest1, site2, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, manageState) VALUES (?,?,?)', [site5siterulestest1, site5, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, manageState) VALUES (?,?,?)', [site5siterulestest2, site5, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, `rename`) VALUES (?,?,?)', [site5siterulestest3, site5, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, `rename`, governance, manageState, `delete`) VALUES (?,?,?,?,?,?,?)', [siterolestest1, site6, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO siterules (roleId, siteId, launch, governance) VALUES (?,?,?,?)', [siterolestest2, site6, 1, 1])
  ])

  await Promise.all([
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?)', [site1editorRole, site1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`, `move`) VALUES (?,?,?,?,?)', [assetrulestest1, site1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`, `move`, `undelete`) VALUES (?,?,?,?,?,?)', [assetrulestest1, site2, 1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `delete`, `undelete`) VALUES (?,?,?,?)', [assetrulestest3, site1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`) VALUES (?,?,?,?)', [assetrulestest4, site1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `delete`, `undelete`) VALUES (?,?,?,?)', [assetrulestest5, site2, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `move`) VALUES (?,?)', [assetrulestest5, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `path`, `mode`, `create`, `update`, `move`) VALUES (?,?,?,?,?,?,?)', [assetrulestest5, site1, '/images', 'self', 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?)', [siterolestest1, site6, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO assetrules (`roleId`, `siteId`, `update`) VALUES (?,?,?)', [siterolestest2, site6, 1])
  ])
  await Promise.all([
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `path`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?,?)', [site1editorRole, site1, '/', 1, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`,`pagetreeType`, `path`, `create`, `update`, `move`, `publish`, `unpublish`) VALUES (?,?,?,?,?,?,?,?,?)', [pagerulestest1, site5, 'primary', '/', 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `pagetreeType`, `path`, `create`, `update`, `move`, `publish`, `unpublish`) VALUES (?,?,?,?,?,?,?,?)', [pagerulestest2, 'primary', '/', 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `create`) VALUES (?,?)', [pagerulestest3, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?)', [siterolestest1, site6, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `create`, `update`, `move`) VALUES (?,?,?,?,?)', [siterolestest2, site6, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?)', [pagerolestest1, site7, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?)', [pagerolestest2, site7, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO pagerules (`roleId`, `siteId`, `path`, `create`, `update`, `move`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?)', [site3editorRole, site3, '/', 1, 1, 1, 1, 1])
  ])
  await Promise.all([
    db.insert('INSERT INTO datarules (`roleId`, `create`, `update`, `move`) VALUES (?,?,?,?)', [datarulestest1, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `siteId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?)', [datarulestest2, site4, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `create`) VALUES (?,?)', [datarulestest3, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `templateId`, `create`, `update`, `move`) VALUES (?,?,?,?,?)', [datarulestest4, datatemplate1!, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `siteId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?)', [siterolestest1, site6, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `siteId`, `create`, `update`, `move`) VALUES (?,?,?,?,?)', [siterolestest2, site6, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `siteId`, `create`, `update`, `move`, `publish`, `unpublish`, `delete`, `undelete`) VALUES (?,?,?,?,?,?,?,?,?)', [datarolestest1, site2, 1, 1, 1, 1, 1, 1, 1]),
    db.insert('INSERT INTO datarules (`roleId`, `siteId`, `create`, `update`, `move`) VALUES (?,?,?,?,?)', [datarolestest2, site2, 1, 1, 1])
  ])
  await Promise.all([
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate1!, 1]),
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate2!, 1]),
    db.insert('INSERT INTO templaterules (`roleId`, `templateId`, `use`) VALUES (?,?,?)', [templaterulestest1, pagetemplate3!, 0]),
    db.insert('INSERT INTO templaterules (`roleId`, `use`) VALUES (?,?)', [templaterulestest2, 1])
  ])

  async function createPage (name: string, linkId: string, pagetreeId: number, parentId: number | null, displayOrder: number, pageData: any, indexes: Index[], createdDate?: DateTime) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)

    const pageId = await db.transaction(async db => {
      const parentsPath = parentId && await db.getval<string>('SELECT p.path FROM pages p WHERE p.id=?', [parentId])
      const siteId = await db.getval<number>('SELECT siteId FROM pagetrees WHERE id=?', [pagetreeId])
      const path = `${parentsPath ?? ''}${parentsPath === '/' ? '' : '/'}${parentId ?? ''}`
      const dataId = await versionedService.create('page', pageData, indexes, 'su01', db)
      if (createdDate) await versionedService.setStamps(dataId, { createdAt: createdDate.toJSDate(), modifiedAt: createdDate.toJSDate() }, db)
      const newInternalId = await db.insert('INSERT INTO pages (name, pagetreeId, path, displayOrder, dataId, linkId, templateKey, siteId, title) VALUES (?,?,?,?,?,?,?,?,?)', [name, pagetreeId, path, displayOrder, dataId, linkId, pageData.templateKey, siteId, pageData.title])
      await setPageSearchCodes({ internalId: newInternalId, name, title: pageData.title }, db)
      return newInternalId
    })
    return pageId
  }

  function getSavedAtVersion () {
    return DateTime.utc().toFormat('yLLddHHmmss')
  }

  async function updatePage (id: string, content: any, indexes: Index[], user = 'su01', comment?: string, date?: DateTime) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    await versionedService.update(Number(id), content, indexes, { user, comment, date: date?.toJSDate() })
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
  const recipesLinkId = nanoid(10)

  // root page
  let indexes = [
    {
      name: 'link_page_linkId',
      values: [aboutLinkId, programsLinkId, contactLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/about', '/site1/programs', '/site1/contact']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc1', 'keyc2']
    }
  ]
  const site1pagetree1Root = await createPage('site1', rootLinkId, pagetree1, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Basketry Home', areas: { links: [], main: [] } }, indexes)

  // about page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [locationLinkId, peopleLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/about/location', '/site1/about/people']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    }
  ]

  const aboutContent1 = { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'About', areas: { links: [], main: [] } }
  const aboutContent2 = { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'About 2', areas: { links: [], main: [] } }
  const dt = DateTime.local()
  const site1pagetree1About = await createPage('about', aboutLinkId, pagetree1, site1pagetree1Root, 1, aboutContent1, indexes, dt.minus({ hours: 100 }))
  const dataIdAboutPage = await db.getval<string>('SELECT dataId FROM pages WHERE id = ?', [site1pagetree1About])
  let even = true
  for (let i = 0; i < 100; i++) {
    const ts = dt.plus({ hours: i - 100 })
    await updatePage(dataIdAboutPage!, even ? aboutContent2 : aboutContent1, indexes, undefined, undefined, ts)
    even = !even
  }

  // location page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [contactLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/contact']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc1']
    }
  ]
  await createPage('location', locationLinkId, pagetree1, site1pagetree1About, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Location', areas: { links: [], main: [] } }, indexes)

  // people page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [facultyLinkId, staffLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/about/people/faculty', '/site1/about/people/staff']
    },
    {
      name: 'templateKey',
      values: ['keyp1', 'keyc1', 'keyc2']
    }
  ]
  const site1pagetree1People = await createPage('people', peopleLinkId, pagetree1, site1pagetree1About, 2, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'People', areas: { links: [], main: [] } }, indexes)

  // faculty page
  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    }
  ]
  const facultyPageId = await createPage('faculty', facultyLinkId, pagetree1, site1pagetree1People, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Faculty', areas: { links: [], main: [] } }, indexes)
  const dataIdfacultyPage = await db.getval<string>('SELECT dataId FROM pages WHERE id = ?', [facultyPageId])
  await updatePage(dataIdfacultyPage!, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Faculty', hideNav: true, areas: { links: [], main: [] } }, indexes, 'ed02')
  await updatePage(dataIdfacultyPage!, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Faculty', hideNav: false, areas: { links: [], main: [] } }, indexes, 'ed02')

  // staff page
  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('staff', staffLinkId, pagetree1, site1pagetree1People, 2, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Staff', areas: { links: [], main: [] } }, indexes)

  // programs page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [ugradLinkId, gradLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/programs/undergrad', '/site1/programs/grad']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc2']
    }
  ]
  const site1pagetree1Programs = await createPage('programs', programsLinkId, pagetree1, site1pagetree1Root, 2, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Programs', areas: { links: [], main: [] } }, indexes)

  // undergrad page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [gradLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/programs/grad']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('undergrad', ugradLinkId, pagetree1, site1pagetree1Programs, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Undergraduate Programs', areas: { links: [], main: [] } }, indexes)

  // grad page
  indexes = [
    {
      name: 'link_page_linkId',
      values: [ugradLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site1/programs/undergrad']
    },
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    }
  ]
  await createPage('grad', gradLinkId, pagetree1, site1pagetree1Programs, 2, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Graduate Programs', areas: { links: [], main: [] } }, indexes)

  // contact page
  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc2', 'keyc3']
    }
  ]
  await createPage('contact', contactLinkId, pagetree1, site1pagetree1Root, 3, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Contact Us', areas: { links: [], main: [] } }, indexes)

  // events page
  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc1']
    }
  ]
  const site1pagetree1Events = await createPage('events', eventsLinkId, pagetree1, site1pagetree1About, 3, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Special Events', areas: { links: [], main: [] } }, indexes)
  await db.update('UPDATE pages SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [su01, 2, site1pagetree1Events])

  // recipes page
  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc1']
    }
  ]
  const site1pagetree1Recipes = await createPage('recipes', recipesLinkId, pagetree1, site1pagetree1About, 4, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Favorite Recipes', areas: { links: [], main: [] } }, indexes)
  await db.update('UPDATE pages SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [su01, 1, site1pagetree1Recipes])

  /* Site 2, Pagetree 2 Pages */
  const site2RootLinkId = nanoid(10)
  // root
  indexes = [
    {
      name: 'template',
      values: ['keyp2', 'keyc3']
    }
  ]
  const site2rootpageid = await createPage('site2', site2RootLinkId, pagetree2, null, 1, { templateKey: 'keyp2', savedAtVersion: getSavedAtVersion(), title: 'Site 2 Home', areas: { main: [] } }, indexes)
  const dataIdSite2Root = await db.getval<number>('SELECT dataId FROM pages WHERE id = ?', [site2rootpageid])
  await tagData(dataIdSite2Root!, 'published', 1, 'su01')

  /* Site 3, Pagetree 3 Pages */
  const site3RootLinkId = nanoid(10)
  const site3AboutLinkId = nanoid(10)
  const site3SiteMapLinkId = nanoid(10)
  // root
  indexes = [
    {
      name: 'link_page_linkId',
      values: [site3AboutLinkId, site3SiteMapLinkId, rootLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site3/about', '/site3/sitemap', '/site1']
    },
    {
      name: 'template',
      values: ['keyp3', 'keyc1', 'keyc2']
    }
  ]
  const site3pagetree3Root = await createPage('site3', site3RootLinkId, pagetree3, null, 1, { templateKey: 'keyp3', savedAtVersion: getSavedAtVersion(), title: 'Site 3 Home', areas: { main: [] } }, indexes)
  // about
  indexes = [
    {
      name: 'template',
      values: ['keyp3', 'keyc2', 'keyc3']
    }
  ]
  await createPage('about', site3AboutLinkId, pagetree3, site3pagetree3Root, 1, { templateKey: 'keyp3', savedAtVersion: getSavedAtVersion(), title: 'About Us', areas: { main: [] } }, indexes)
  // site map
  indexes = [
    {
      name: 'template',
      values: ['keyp3']
    }
  ]
  await createPage('sitemap', site3SiteMapLinkId, pagetree3, site3pagetree3Root, 2, { templateKey: 'keyp3', savedAtVersion: getSavedAtVersion(), title: 'Site Map', areas: { main: [] } }, indexes)
  await createPage('about-my-parrot', nanoid(10), pagetree3, site3pagetree3Root, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'About My Parrot', areas: { links: [], main: [] } }, [{ name: 'templateKey', values: ['keyp1'] }])

  /* Site 3, Sandbox Pages */
  const site3SandboxRootLinkId = nanoid(10)
  const site3AboutPageLinkId = nanoid(10)
  indexes = [
    {
      name: 'link_page_linkId',
      values: [site3AboutLinkId, site3SiteMapLinkId, rootLinkId]
    },
    {
      name: 'link_page_path',
      values: ['/site3/about', '/site3/sitemap', '/site1']
    },
    {
      name: 'template',
      values: ['keyp2', 'keyc1', 'keyc2']
    }
  ]
  const site3SandboxRoot = await createPage('site3-sandbox', site3SandboxRootLinkId, pagetree3sandbox, null, 1, { templateKey: 'keyp2', savedAtVersion: getSavedAtVersion(), title: 'Site 3 Home', areas: { main: [] } }, indexes)

  indexes = [
    {
      name: 'template',
      values: ['keyp2']
    }
  ]
  await createPage('about', site3AboutPageLinkId, pagetree3sandbox, site3SandboxRoot, 1, { templateKey: 'keyp2', savedAtVersion: getSavedAtVersion(), title: 'About Site 3', areas: { main: [] } }, indexes)

  /* Site 4 */
  await createPage('site4', nanoid(10), pagetree4, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Site 4 Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])
  await createPage('site4-archive', nanoid(10), pagetree4archive, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Site 4 Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])
  await createPage('site4-archive-1', nanoid(10), pagetree4deleted, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Site 4 Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])

  /* Site 5 */
  await createPage('site5', nanoid(10), pagetree5, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Site 5 Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])

  /* Site 6 */
  await createPage('site6', nanoid(10), pagetree6, null, 1, { templateKey: 'keyp2', savedAtVersion: getSavedAtVersion(), title: 'Site 6 Home', areas: { main: [] } }, [{ name: 'template', values: ['keyp2'] }])

  /* Site 7 */
  await createPage('site7', nanoid(10), pagetree7, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Site 7 Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])

  /* Site 8 */
  const page8id = await createPage('site8', nanoid(10), pagetree8, null, 1, { templateKey: 'keyp1', savedAtVersion: getSavedAtVersion(), title: 'Asset Test Site Home', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp1'] }])
  await createPage('validation-error-page', nanoid(10), pagetree8, page8id, 1, { templateKey: 'keyp2', savedAtVersion: getSavedAtVersion(), title: 'Validation Error Page', areas: { main: [{ templateKey: 'keyc1', text: 'Link with no target' }] } }, [{ name: 'template', values: ['keyp2'] }])

  /* Deleted Site */
  await createPage('deletedsite', nanoid(10), deletedSitePrimary, null, 1, { templateKey: 'keyp3', savedAtVersion: getSavedAtVersion(), title: 'Page in Deleted Site', areas: { links: [], main: [] } }, [{ name: 'template', values: ['keyp3'] }])

  /* Data */
  const [datafolder1, datafolder2, datafolder3, datafolder4, datafolder5, datafolder6, globalcolordata, deletedsitedatafolder] = await Promise.all([
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId) VALUES (?,?,?,?)', ['site2datafolder', nanoid(10), site2, datatemplate1!]),
    db.insert('INSERT INTO datafolders (name, guid, templateId) VALUES (?,?,?)', ['globaldatafolder', nanoid(10), articleTemplate!]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId, deleteState, deletedAt, deletedBy) VALUES (?,?,?,?,2,NOW(),?)', ['deletedfolder', nanoid(10), site2, datatemplate1!, su03]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId) VALUES (?,?,?,?)', ['site5datafolder1', nanoid(10), site5, datatemplate1!]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId) VALUES (?,?,?,?)', ['site5datafolder2', nanoid(10), site5, datatemplate1!]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId, deleteState, deletedAt, deletedBy) VALUES (?,?,?,?,2,NOW(),?)', ['site5datafolder3', nanoid(10), site5, datatemplate1!, su01]),
    db.insert('INSERT INTO datafolders (name, guid, templateId) VALUES (?,?,?)', ['globalcolordata', nanoid(10), datatemplate1!]),
    db.insert('INSERT INTO datafolders (name, guid, siteId, templateId) VALUES (?,?,?,?)', ['deletedsitedata', nanoid(10), deletedsite, datatemplate1!])
  ])

  async function createData (name: string, displayOrder: number, content: Omit<DataData, 'savedAtVersion'>, creator: string) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    const entryContent = { ...content, savedAtVersion: getSavedAtVersion() }
    const indexes = [{ name: 'templateKey', values: [content.templateKey] }]
    const id = await db.transaction(async db => {
      const dataId = await versionedService.create('data', entryContent, indexes, creator, db)
      const templateId = await db.getval<number>('SELECT id FROM templates WHERE `key`=?', [content.templateKey])
      if (!templateId) throw new Error('templateKey does not exist.')
      return await db.insert('INSERT INTO data (dataId, templateId, name, displayOrder) VALUES (?, ?, ?, ?)', [dataId, templateId, name, displayOrder])
    }, { retries: 1 })
    return id
  }

  async function tagData (id: number, tag: string, version?: number, user?: string) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    await versionedService.tag(id, tag, version, user)
  }

  async function updateData (id: number, content: Omit<DataData, 'savedAtVersion'>, user?: string, comment?: string) {
    const ctx = new Context()
    const entryContent = { ...content, savedAtVersion: getSavedAtVersion() }
    const indexes = [{ name: 'templateKey', values: [content.templateKey] }]
    await ctx.svc(VersionedService).update(id, entryContent, indexes, { user, comment })
  }

  // TODO: Add more indexes?
  const data1Id = await createData('red-content', 1, { templateKey: 'keyd1', title: 'Red Text', color: 'red', align: 'center' }, 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data1Id])
  const dataIdData1 = await db.getval<number>('SELECT dataId FROM data WHERE id = ?', [data1Id])
  await updateData(dataIdData1!, { templateKey: 'keyd1', title: 'Red Text', color: 'red', align: 'left' }, 'su03', 'updating alignment')
  await updateData(dataIdData1!, { templateKey: 'keyd1', title: 'Red Text', color: 'red', align: 'right' }, 'su01', 'updating alignment again')

  const data2Id = await createData('blue-content', 2, { templateKey: 'keyd1', title: 'Blue Text', color: 'blue', align: 'left' }, 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data2Id])

  const data3Id = await createData('orange-content', 3, { templateKey: 'keyd1', title: 'Orange Text', color: 'orange', align: 'right' }, 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ?, deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [site2, datafolder1, su01, 2, data3Id])

  const data4Id = await createData('green-content', 4, { templateKey: 'keyd1', title: 'Green Text', color: 'green', align: 'center' }, 'su01')
  await db.update('UPDATE data SET siteId = ?, folderId = ? WHERE id = ?', [site2, datafolder1, data4Id])

  await createData('yellow-content', 1, { templateKey: 'keyd1', title: 'Yellow Text', color: 'yellow', align: 'center' }, 'su01')
  await createData('yellow-orange-content', 2, { templateKey: 'keyd1', title: 'Yellow Orange Text', color: 'yellow-orange', align: 'center' }, 'su01')
  await createData('fuchsia-content', 3, { templateKey: 'keyd1', title: 'Fuchsia Text', color: 'fuchsia', align: 'center' }, 'su01')

  const data5Id = await createData('ebony-content', 3, { templateKey: 'keyd1', title: 'Ebony Text', color: 'ebony', align: 'center' }, 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [globalcolordata, data5Id])
  const data6Id = await createData('sandstone-content', 3, { templateKey: 'keyd1', title: 'Sandstone Text', color: 'sandstone', align: 'center' }, 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [globalcolordata, data6Id])

  const data7Id = await createData('maroon-content', 3, { templateKey: 'keyd1', title: 'Maroon Text', color: 'maroon', align: 'center' }, 'su01')
  await db.update('UPDATE data SET siteId = ? WHERE id = ?', [site2, data7Id])
  const data8Id = await createData('gold-content', 3, { templateKey: 'keyd1', title: 'Gold Text', color: 'gold', align: 'center' }, 'su01')
  await db.update('UPDATE data SET siteId = ? WHERE id = ?', [site2, data8Id])

  // some global data that does not belong to a site
  const article1Id = await createData('car-cleaning', 1, { templateKey: 'articledatakey', title: '5 Steps to a Cleaner Car', author: 'Jane Doe' }, 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article1Id])
  const dataIdArticle1 = await db.getval<number>('SELECT dataId FROM data WHERE id = ?', [article1Id])
  await tagData(dataIdArticle1!, 'published', 1, 'su02')

  const article2Id = await createData('trees', 2, { templateKey: 'articledatakey', title: 'Trees of Central Texas', author: 'John Smith' }, 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article2Id])

  const article3Id = await createData('ladybugs', 3, { templateKey: 'articledatakey', title: 'The Secret Lives of Ladybugs', author: 'Jack Frost' }, 'su01')
  await db.update('UPDATE data SET folderId = ? WHERE id = ?', [datafolder2, article3Id])

  // data not in a folder
  await Promise.all([
    createData('cottonwood-hall', 1, { templateKey: 'keyd2', name: 'Cottonwood Hall', floors: 3 }, 'su01'),
    createData('student-center', 2, { templateKey: 'keyd2', name: 'Student Center', floors: 4 }, 'su01'),
    createData('aquatics-center', 3, { templateKey: 'keyd2', name: 'Aquatics Center', floors: 2 }, 'su01')
  ])

  // deleted data
  const deletedDataId = await createData('purple-content', 5, { templateKey: 'keyd1', title: 'Purple Text', color: 'purple', align: 'left' }, 'su02')
  await db.update('UPDATE data SET folderId = ?, deletedAt = NOW(), deletedBy = ?, deleteState = ?, displayOrder = ? WHERE id = ?', [datafolder3, su02, 2, 1, deletedDataId])

  const partiallyDeletedDataId = await createData('mauve-content', 4, { templateKey: 'keyd1', title: 'Mauve Text', color: 'mauve', align: 'center' }, 'su01')
  await db.update('UPDATE data SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [su01, 1, partiallyDeletedDataId])

  const deletedSiteDataId = await createData('contentindeletedsite', 1, { templateKey: 'keyd1', title: 'The Data Title', color: 'dust', align: 'center' }, 'su02')
  await db.update('UPDATE data SET siteId = ? WHERE id = ?', [deletedsite, deletedSiteDataId])

  const deletedSiteDataInFolderId = await createData('contentindeletedsitefolder', 1, { templateKey: 'keyd1', title: 'More Data', color: 'ivory', align: 'right' }, 'su02')
  await db.update('UPDATE data SET folderId = ?, siteId = ? WHERE id = ?', [deletedsitedatafolder, deletedsite, deletedSiteDataInFolderId])

  async function createAsset (name: string, folder: number, checksum: string, mime: string, size: number, indexes: Index[], creator: string, width?: number, height?: number) {
    const ctx = new Context()
    const versionedService = new VersionedService(ctx)
    const b64urlchecksum = Buffer.from(checksum, 'hex').toString('base64url')
    const id = await db.transaction(async db => {
      const dataId = await versionedService.create('asset', { shasum: b64urlchecksum, uploadedFilename: name + '.' + (extension(mime) || '') }, indexes, creator, db)
      await db.insert('INSERT IGNORE INTO binaries (shasum, mime, meta, bytes) VALUES (?,?,?,?)', [b64urlchecksum, mime, stringify(width && height ? { width, height } : {}), size])
      const newInternalId = await db.insert('INSERT INTO assets (name, folderId, linkId, dataId, shasum) VALUES (?,?,?,?,?)', [name, folder, nanoid(10), dataId, b64urlchecksum])
      await setAssetSearchCodes({ internalId: newInternalId, name }, db)
      return newInternalId
    })
    return id
  }

  if (existsSync('/files/storage')) {
    await createAsset('blankpdf', site1AssetRoot, '3ca054a20869a20013aa62b5e2bcb5c2a2ac3fe7be4bc195a872ae0b11fb9359', 'application/pdf', 1264, [{ name: 'type', values: ['application/pdf'] }], 'su01')
    await createAsset('bobcat', site1AssetRoot, '43b1cdd66a05b515b113f80bcafc4cf01dac2b90ab8c1df8f362edb6381b58c1', 'image/jpeg', 3793056, [{ name: 'type', values: ['image/jpeg'] }], 'su01', 6016, 4016)
    await createAsset('blankpdf', site8AssetRoot, '3ca054a20869a20013aa62b5e2bcb5c2a2ac3fe7be4bc195a872ae0b11fb9359', 'application/pdf', 1264, [{ name: 'type', values: ['application/pdf'] }], 'su01')
    await createAsset('anotherbobcat', site1Images, '43b1cdd66a05b515b113f80bcafc4cf01dac2b90ab8c1df8f362edb6381b58c1', 'image/jpeg', 3793056, [{ name: 'type', values: ['image/jpeg'] }], 'su01', 6016, 4016)
  }
  const deletedAssetId = await db.getval<number>('SELECT id FROM assets WHERE name = ?', ['anotherbobcat'])
  await db.update('UPDATE assets SET deletedAt = NOW(), deletedBy = ?, deleteState = ? WHERE id = ?', [su01, 2, deletedAssetId!])

  const bobcatImageData = await db.getrow('SELECT assets.linkId, assets.shasum,  assetfolders.siteId FROM assets INNER JOIN assetfolders ON assets.folderId = assetfolders.id WHERE assets.name = \'bobcat\'')

  indexes = [
    {
      name: 'template',
      values: ['keyp1', 'keyc3']
    },
    {
      name: 'link_asset_id',
      values: [bobcatImageData.linkId]
    },
    {
      name: 'link_asset_path',
      values: ['/site1/bobcat']
    },
    {
      name: 'link_asset_checksum',
      values: [bobcatImageData.shasum]
    }
  ]

  const pageDataWithAsset = {
    templateKey: 'keyp1',
    savedAtVersion: getSavedAtVersion(),
    title: 'Page With Assets',
    areas: {
      links: [],
      main: [
        {
          title: 'Text and Image Block',
          image: {
            checksum: bobcatImageData.shasum,
            id: bobcatImageData.linkId,
            path: '/site1/bobcat',
            siteId: bobcatImageData.siteId,
            source: 'assets',
            type: 'asset'
          },
          text: 'Picture of a bobcat statue',
          templateKey: 'textimage',
          areas: {}
      }]
    }
  }

  await createPage('pagewithasset', nanoid(10), pagetree1, site1pagetree1Root, 4, pageDataWithAsset, indexes)

  console.info('finished fixtures()')
}
