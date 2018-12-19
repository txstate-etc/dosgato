# dosgato

## Notes
### Page Versioning
* Versions are never deleted, only built upon
* Migrations are code that manipulate data, versions of type 'migration', stored with the page, are mere records of the activity
* When showing restoration targets, ignore migration versions
* No edits on old versions, must restore a version first to bring it to the top
* API requires header with migration number, all requests will fail if it is not the latest migration number
  * This way an old version of the client cannot accidentally write bad data or receive data it doesn't understand (crash)
  * For convenience we would force a refresh

* Reading a page
  * retrieve page
  * rewind to requested version
  * run migrations
  * return page

* Saving a page
  * retrieve page
  * run migrations
  * record a version, if applicable
  * apply user changes
  * record a version, if applicable
  * save page
  * detect concurrency problem, abort save, report to user

* Restoring a page
  * retrieve page
  * acquire rewound copy at requested version
  * apply rewound data as if it were a user change
  * record a version, if applicable
  * run migrations
  * record a version, if applicable

* Deleting a page
  * record the date in meta
  * soft delete for 6 months
