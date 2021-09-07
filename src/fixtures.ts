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
  // Insert Statements Go Here
}
