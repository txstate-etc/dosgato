import db from 'mysql2-async/db'

export async function logMutation (queryTime: number, operationName: string, query: string, auth: any, variables: any) {
  if (query.includes('mutation')) {
    // TODO: we have the login and userId is the internal ID for the user. How can we get that internal ID here,
    // or does it need to be in the auth object?
    // await db.insert('INSERT INTO mutationlog (userId, mutation, query, variables) VALUES (?,?,?,?)',
    //   [auth.login, query, operationName, JSON.stringify(variables)])
  }
}
