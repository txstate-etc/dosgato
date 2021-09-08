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
    db.execute('DELETE FROM groups'),
    db.execute('DELETE FROM assets'),
    db.execute('DELETE FROM sites_managers'),
    db.execute('DELETE FROM pagetrees'),
    db.execute('DELETE FROM sites'),
    db.execute('DELETE FROM assetfolders'),
    db.execute('DELETE FROM organizations'),
    db.execute('DELETE FROM users')
  ])
  await Promise.all([
    db.execute(`INSERT INTO users (login, name, email, lastlogin, lastlogout, disabledAt) VALUES
      ("su01", "Michael Scott", "su01@example.com", null, null, null),
      ("su02", "Elizabeth Bennet", "su02@example.com", null, null, null),
      ("su03", "Marge Simpson", "su03@example.com", "2021-09-01 12:43:00", "2021-09-01 16:28:00", null),
      ("ed01", "Draco Malfoy", "ed01@example.com", "2021-07-15 11:15:00", "2021-07-15 13:07:00", null),
      ("ed02", "Forrest Gump", "ed02@example.com", "2021-02-01 08:23:00", "2021-02-01 11:33:00", "2021-08-22 15:02:00" )
    `)
  ])
}
