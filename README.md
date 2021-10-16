# dosgato
## Introduction
This is a place to record ideas and code for an experimental new CMS for use at Texas State.

The core concepts focus on our handling of data and versions, in an effort to preserve editing history, maximize API compatibility, and reduce system downtime.

## Definitions
### Content Object
A single page or independent chunk of data. These are objects that will be created and edited by CMS editors during the course of creating their content.

### Content Version
Each content object will have a content version that increments each time a user makes a data change. We will maintain a limited version history for the object so that we can restore older versions of the content. An API parameter will allow clients to request a specific historical version of a content object.

### Schema Version
Each content object will have a schema, and a schema version that increments each time we need to alter structure. Each instance of the object will be tagged with the schema version the client was using when the editor saved the object. When returning a content object from the API, we will be able to alter the schema version up or down to match the client performing the request. This allows zero downtime upgrades without risk of corruption due to old clients in the wild.

### Migration
A migration is a block of code that converts a content object from one schema version to another. Typically migrations will be written so that they can both upgrade to and downgrade from a particular schema version. This is called a reversible migration.

If a reversible migration is impossible to write, for example when a field is being deleted, we will have a non-reversible migration. All system updates including a non-reversible migration will require downtime, and clients older than that version will cease to function (see Minimum Schema Version below).

Deletion of a non-required field might not crash, so we could theoretically avoid downtime, but in those cases we should write a migration downgrade where we set it to a default value.

In general we should avoid non-reversible migrations as much as possible, to avoid making older clients incompatible.

### Minimum Schema Version
The earliest schema version after which all migrations are reversible. Each API request will contain the API/Schema version that the client expects, so that it always receives data structured in a way that it can handle. If the requested API version is less than the minimum schema version, the request will be rejected. That client will be required to upgrade (or refresh the page, in the case of an in-browser client).

## Upgrade Process
In order to preserve uptime, we can now follow a specific upgrade flow to avoid downtime:
* Each update should consist of de-listing from the load balancer, then restarting with the latest docker image.
* Update API services, one by one, until all are updated.
* Update Client/UI services, one by one, until all are updated.

This diagram illustrates the process.

![Upgrade Process Flow Diagram](readme/upgradeflow2.png?raw=true)

As you can see, when the API services are partially upgraded, the upgraded services simply need to downgrade schema versions on the way out to maintain compatibility. When all API services are prepared to serve the next schema version, clients may begin their upgrades.

## Miscellaneous
* No edits on old versions, must restore a version first to bring it to the top
* Ensure that browser updates all client-side UI resources at the same time
  * Forced refresh is unnecessary

* Reading a page
  * retrieve page data
  * rewind to requested content version, if applicable
  * run migrations to update to requested schema version
  * return modified page data

* Saving a page
  * accept page from client, tagged with content version and schema version
  * if there is already a content version with a higher number, abort with concurrency error
  * save a new content version exactly as user provided it and tag with the incoming schema version

* Restoring a page
  * retrieve page
  * rewind to requested content version
  * save a new content version with page data exactly as it was, tagged with the old schema version

* Deleting a page
  * record the date in meta
  * soft delete for 6 months

## References
* https://www.npmjs.com/package/rfc6902

## Notes
* The rendering server may pass a user token along to the API, or may pass a service token for anonymous access.
  * The API should ensure that the service token only receives published/launched page data.
  * Direct asset downloads will also pass through the rendering server.
  * The API should never allow entirely unauthenticated access.
* Need to think about first-class support for protected pages. Probably a shared secret with the cache boxes.
