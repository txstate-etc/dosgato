import db from 'mysql2-async/db'

export async function fixtures () {
  console.log('running fixtures()')
  await Promise.all([
    db.execute('DELETE FROM downloads'),
    db.execute('DELETE FROM globalrules'),
    db.execute('DELETE FROM mutationlog'),
    db.execute('DELETE FROM datarules'),
    db.execute('DELETE FROM data'),
    db.execute('DELETE FROM datafolders'),
    db.execute('DELETE FROM pagetrees_templates'),
    db.execute('DELETE FROM assetrules'),
    db.execute('DELETE FROM pagerules'),
    db.execute('DELETE FROM sites_templates'),
    db.execute('DELETE FROM templates'),
    db.execute('DELETE FROM resizes'),
    db.execute('DELETE FROM users_roles'),
    db.execute('DELETE FROM groups_roles'),
    db.execute('DELETE FROM binaries'),
    db.execute('DELETE FROM pages'),
    db.execute('DELETE FROM users_groups'),
    db.execute('DELETE FROM siterules'),
    db.execute('DELETE FROM roles'),
    db.execute('DELETE FROM groups_groups'),
    db.execute('DELETE FROM groups'),
    db.execute('DELETE FROM assets'),
    db.execute('DELETE FROM sites_managers'),
    db.execute('DELETE FROM pagetrees'),
    db.execute('DELETE FROM sites'),
    db.execute('DELETE FROM assetfolders'),
    db.execute('DELETE FROM organizations'),
    db.execute('DELETE FROM users')
  ])
  const [su01, su02, su03, ed01, ed02, ed03, ed04, ed05] = await Promise.all([
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su01", "Michael Scott", "su01@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su02", "Elizabeth Bennet", "su02@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("su03", "Marge Simpson", "su03@example.com", "2021-09-01 12:43:00", "2021-09-01 16:28:00", null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed01", "Draco Malfoy", "ed01@example.com", "2021-07-15 11:15:00", "2021-07-15 13:07:00", null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed02", "Forrest Gump", "ed02@example.com", "2021-02-01 08:23:00", "2021-02-01 11:33:00", "2021-08-22 15:02:00")'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed03", "Luke Skywalker", "ed03@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed04", "Katniss Everdeen", "ed04@example.com", null, null, null)'),
    db.insert('INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES ("ed05", "Jean Valjean", "ed05@example.com", null, null, null)')
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
  const [superuserRole, editorRole, site1editorRole, site2editorRole, site3editorRole, group6Role, group7Role] = await Promise.all([
    db.insert('INSERT INTO roles (name) VALUES ("superuser")'),
    db.insert('INSERT INTO roles (name) VALUES ("editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site1-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site2-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("site3-editor")'),
    db.insert('INSERT INTO roles (name) VALUES ("group6role")'),
    db.insert('INSERT INTO roles (name) VALUES ("group7role")')
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
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group3, site2editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group1, site3editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group3, editorRole]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group6, group6Role]),
    db.insert('INSERT INTO groups_roles (groupId, roleId) VALUES (?,?)', [group7, group7Role])
  ])
  console.log('finished fixtures()')
}
