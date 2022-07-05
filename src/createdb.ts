/* eslint-disable no-multi-str */
import { Queryable } from 'mysql2-async'

export async function init (db: Queryable) {
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `users` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `login` VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL, \
      `name` VARCHAR(255) NOT NULL, \
      `email` VARCHAR(255) NOT NULL, \
      `lastlogin` DATETIME, \
      `lastlogout` DATETIME, \
      `disabledAt` DATETIME, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `login_UNIQUE` (`login`)) \
      ENGINE = InnoDB \
      DEFAULT CHARACTER SET = utf8mb4 \
      DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
      CREATE TABLE IF NOT EXISTS `organizations` ( \
        `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, \
        `name` VARCHAR(255) NOT NULL, \
        PRIMARY KEY (`id`), \
        UNIQUE INDEX `name_UNIQUE` (`name`)) \
      ENGINE = InnoDB \
      DEFAULT CHARACTER SET = utf8mb4 \
      DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
      CREATE TABLE IF NOT EXISTS `assetfolders` ( \
        `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
        `siteId` SMALLINT UNSIGNED NOT NULL COMMENT 'for lookup convenience, not canonical', \
        `path` TEXT NOT NULL, \
        `name` VARCHAR(255) NOT NULL, \
        `guid` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
        `deletedAt` DATETIME, \
        `deletedBy` MEDIUMINT UNSIGNED, \
        PRIMARY KEY (`id`), \
        INDEX `path_idx` (`path`(255)), \
        CONSTRAINT `FK_assetfolders_users` \
          FOREIGN KEY (`deletedBy`) \
          REFERENCES `users` (`id`)) \
      ENGINE = InnoDB \
      DEFAULT CHARACTER SET = utf8mb4 \
      DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
      CREATE TABLE IF NOT EXISTS `sites` ( \
        `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, \
        `name` VARCHAR(255) NOT NULL, \
        `primaryPagetreeId` MEDIUMINT UNSIGNED, \
        `rootAssetFolderId` MEDIUMINT UNSIGNED, \
        `launchHost` VARCHAR(255), \
        `launchPath` VARCHAR(255) DEFAULT '/', \
        `organizationId` SMALLINT UNSIGNED, \
        `ownerId` MEDIUMINT UNSIGNED, \
        `deletedAt` DATETIME, \
        `deletedBy` MEDIUMINT UNSIGNED, \
        PRIMARY KEY (`id`), \
        UNIQUE INDEX `name_UNIQUE` (`name`), \
        UNIQUE INDEX `primary_pagetree_id_UNIQUE` (`primaryPagetreeId`), \
        UNIQUE INDEX `asset_root_id_UNIQUE` (`rootAssetFolderId`), \
        INDEX `launchUrl` (`launchHost`, `launchPath`), \
        CONSTRAINT `FK_sites_users` \
          FOREIGN KEY (`ownerId`) \
          REFERENCES `users` (`id`), \
        CONSTRAINT `FK_sites_organizations` \
          FOREIGN KEY (`organizationId`) \
          REFERENCES `organizations` (`id`), \
        CONSTRAINT `FK_sites_assetfolders` \
          FOREIGN KEY (`rootAssetFolderId`) \
          REFERENCES `assetfolders` (`id`)) \
      ENGINE = InnoDB \
      DEFAULT CHARACTER SET = utf8mb4 \
      DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `pagetrees` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      `type` ENUM('primary', 'sandbox', 'archive') NOT NULL DEFAULT 'sandbox', \
      `name` VARCHAR(255) NOT NULL, \
      `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      `promotedAt` DATETIME, \
      `archivedAt` DATETIME, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `nameinsite` (`siteId`, `name`), \
      INDEX `site_idx` (`siteId`, `type`), \
      CONSTRAINT `FK_pagetrees_users` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `FK_pagetrees_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `sites_managers` ( \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`siteId`,`userId`), \
      CONSTRAINT `FK_sites_managers_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_sites_managers_users` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `binaries` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `shasum` CHAR(40) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `mime` VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `meta` JSON NOT NULL, \
      `bytes` BIGINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `shasum_UNIQUE` (`shasum`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `assets` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `folderId` MEDIUMINT UNSIGNED NOT NULL, \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL, \
      `shasum` CHAR(40) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      INDEX `name_idx` (`name`), \
      CONSTRAINT `FK_assets_assetfolders` \
        FOREIGN KEY (`folderId`) \
        REFERENCES `assetfolders` (`id`), \
      CONSTRAINT `FK_assets_users` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `FK_assets_binaries` \
        FOREIGN KEY (`shasum`) \
        REFERENCES `binaries` (`shasum`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `name_UNIQUE` (`name`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups_groups` ( \
      `parentId` MEDIUMINT UNSIGNED NOT NULL, \
      `childId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`parentId`, `childId`), \
      CONSTRAINT `FK_groups_groups_parent` \
        FOREIGN KEY (`parentId`) \
        REFERENCES `groups` (`id`), \
      CONSTRAINT `FK_groups_groups_child` \
        FOREIGN KEY (`childId`) \
        REFERENCES `groups` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups_managers` ( \
      `groupId` MEDIUMINT UNSIGNED NOT NULL, \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`groupId`,`userId`), \
      CONSTRAINT `FK_groups_managers_groups` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`), \
      CONSTRAINT `FK_groups_managers_users` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups_sites` ( \
      `groupId` MEDIUMINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`groupId`,`siteId`), \
      CONSTRAINT `FK_groups_sites_groups` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`), \
      CONSTRAINT `FK_groups_sites_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `roles` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `name_UNIQUE` (`name`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `siterules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `launch` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `rename` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `manageOwners` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `managePagetrees` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `promotePagetree` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `FK_siterules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `FK_siterules_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `users_groups` ( \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      `groupId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`userId`, `groupId`), \
      CONSTRAINT `FK_user_groups_users` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `FK_users_groups_groups` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `pages` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `path` TEXT NOT NULL, \
      `displayOrder` SMALLINT UNSIGNED NOT NULL, \
      `pagetreeId` MEDIUMINT UNSIGNED NOT NULL, \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `linkId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `data_UNIQUE` (`dataId`), \
      UNIQUE INDEX `linkId_in_pagetree` (`pagetreeId`, `linkId`), \
      INDEX `linkId_idx` (`linkId`), \
      INDEX `path_idx` (`path`(255), `displayOrder`), \
      INDEX `name_idx` (`name`(255)), \
      CONSTRAINT `FK_pages_pagetrees` \
        FOREIGN KEY (`pagetreeId`) \
        REFERENCES `pagetrees` (`id`), \
      CONSTRAINT `FK_pages_storage` \
        FOREIGN KEY (`dataId`) \
        REFERENCES `storage` (`id`), \
      CONSTRAINT `FK_pages_users` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups_roles` ( \
      `groupId` MEDIUMINT UNSIGNED NOT NULL, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`roleId`, `groupId`), \
      CONSTRAINT `FK_groups_roles_groups` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`), \
      CONSTRAINT `FK_groups_roles_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `users_roles` ( \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`userId`, `roleId`), \
      CONSTRAINT `FK_users_roles_users` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `FK_user_roles_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `resizes` ( \
      `binaryId` INT UNSIGNED NOT NULL, \
      `originalBinaryId` INT UNSIGNED NOT NULL, \
      `width` SMALLINT UNSIGNED NOT NULL, \
      `height` SMALLINT UNSIGNED NOT NULL, \
      `quality` TINYINT UNSIGNED NOT NULL, \
      `othersettings` JSON NOT NULL, \
      PRIMARY KEY (`binaryId`), \
      INDEX `resize_idx` (`originalBinaryId`, `width`, `height`, `quality`), \
      CONSTRAINT `FK_resizes_binaries_id` \
        FOREIGN KEY (`binaryId`) \
        REFERENCES `binaries` (`id`), \
      CONSTRAINT `FK_resizes_binaries_original` \
        FOREIGN KEY (`originalBinaryId`) \
        REFERENCES `binaries` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `templates` ( \
      `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `key` VARCHAR(255) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `name` VARCHAR(255) NOT NULL, \
      `type` ENUM('component', 'page', 'data') NOT NULL, \
      `universal` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `deleted` TINYINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `key_UNIQUE` (`key`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `sites_templates` ( \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      `templateId` SMALLINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`siteId`, `templateId`), \
      CONSTRAINT `FK_sites_templates_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_sites_templates_templates` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `pagerules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `pagetreeId` MEDIUMINT UNSIGNED, \
      `path` VARCHAR(255) NOT NULL DEFAULT '/', \
      `mode` ENUM('self', 'sub', 'selfsub') NOT NULL DEFAULT 'selfsub', \
      `create` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `update` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `move` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `publish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `unpublish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      INDEX `path` (`path`), \
      CONSTRAINT `FK_pagerules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `FK_pagerules_pagetrees` \
        FOREIGN KEY (`pagetreeId`) \
        REFERENCES `pagetrees` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `assetrules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `path` VARCHAR(255) NOT NULL DEFAULT '/', \
      `mode` ENUM('self', 'sub', 'selfsub') NOT NULL DEFAULT 'selfsub', \
      `create` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `update` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `move` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      INDEX `path` (`path`), \
      CONSTRAINT `FK_assetrules_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_assetrules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `pagetrees_templates` ( \
      `pagetreeId` MEDIUMINT UNSIGNED NOT NULL, \
      `templateId` SMALLINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`pagetreeId`, `templateId`), \
      CONSTRAINT `FK_pagetrees_templates_pagetrees` \
        FOREIGN KEY (`pagetreeId`) \
        REFERENCES `pagetrees` (`id`), \
      CONSTRAINT `FK_pagetrees_templates_templates` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `datafolders` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `guid` CHAR(10) CHARACTER SET \'ascii\' COLLATE \'ascii_bin\' NOT NULL,\
      `siteId` SMALLINT UNSIGNED, \
      `templateId` SMALLINT UNSIGNED NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `FK_datafolders_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_datafolders_templates` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `data` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `name` VARCHAR(255) NOT NULL, \
      `displayOrder` SMALLINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `folderId` MEDIUMINT UNSIGNED, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `data_UNIQUE` (`dataId`), \
      INDEX `folder_idx` (`folderId`, `displayOrder`), \
      INDEX `name_idx` (`name`(255)), \
      CONSTRAINT `FK_data_users` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `FK_data_storage` \
        FOREIGN KEY (`dataId`) \
        REFERENCES `storage` (`id`), \
      CONSTRAINT `FK_data_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_data_datafolders` \
        FOREIGN KEY (`folderId`) \
        REFERENCES `datafolders` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `datarules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `templateId` SMALLINT UNSIGNED, \
      `path` VARCHAR(255) NOT NULL DEFAULT '/', \
      `create` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `update` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `move` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `publish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `unpublish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `FK_datarules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `FK_datarules_sites` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `FK_datarules_templates` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `templaterules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `templateId` SMALLINT UNSIGNED, \
      `use` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `FK_templaterules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `FK_templaterules_tmpl` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `mutationlog` ( \
      `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      `mutation` VARCHAR(255) NOT NULL, \
      `query` TEXT NOT NULL, \
      `variables` JSON NOT NULL, \
      INDEX `createdAt_idx` (`createdAt`), \
      INDEX `mutation_idx` (`mutation`), \
      CONSTRAINT `FK_mutationlog_users` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `globalrules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `manageUsers` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `createSites` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `manageGlobalData` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `FK_globalrules_roles` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `downloads` ( \
      `binaryId` INT UNSIGNED NOT NULL, \
      `year` SMALLINT UNSIGNED NOT NULL, \
      `month` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `day` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `downloads` INT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`binaryId`, `year`, `month`, `day`), \
      CONSTRAINT `FK_downloads_binaries` \
        FOREIGN KEY (`binaryId`) \
        REFERENCES `binaries` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
}
