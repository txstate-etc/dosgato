/* eslint-disable no-multi-str */
import db from 'mysql2-async/db'

export async function init () {
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
      `deletedBy` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `nameinsite` (`siteId`, `name`), \
      INDEX `site_idx` (`siteId`, `type`), \
      CONSTRAINT `deletedBy` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `siteId` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `sites` ( \
      `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `primaryPagetreeId` MEDIUMINT UNSIGNED NOT NULL, \
      `rootAssetFolderId` MEDIUMINT UNSIGNED NOT NULL, \
      `launchHost` VARCHAR(255) NOT NULL, \
      `launchPath` VARCHAR(255) NOT NULL DEFAULT '/', \
      `organizationId` SMALLINT UNSIGNED, \
      `ownerId` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `name_UNIQUE` (`name`), \
      UNIQUE INDEX `primary_pagetree_id_UNIQUE` (`primaryPagetreeId`), \
      UNIQUE INDEX `asset_root_id_UNIQUE` (`rootAssetFolderId`), \
      INDEX `launchUrl` (`launchHost`, `launchPath`), \
      CONSTRAINT `pagetree` \
        FOREIGN KEY (`primaryPagetreeId`) \
        REFERENCES `pagetrees` (`id`), \
      CONSTRAINT `owner` \
        FOREIGN KEY (`ownerId`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `organization` \
        FOREIGN KEY (`organizationId`) \
        REFERENCES `organizations` (`id`), \
      CONSTRAINT `rootAssetFolder` \
        FOREIGN KEY (`rootAssetFolderId`) \
        REFERENCES `assetfolders` (`id`)) \
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
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `sites_managers` ( \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`siteId`,`userId`), \
      CONSTRAINT `site` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `user` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `assetfolders` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `siteId` SMALLINT UNSIGNED NOT NULL COMMENT 'for lookup convenience, not canonical', \
      `parentId` MEDIUMINT UNSIGNED, \
      `name` VARCHAR(255) NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `site` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `folder` \
        FOREIGN KEY (`parentId`) \
        REFERENCES `assetfolders` (`id`), \
      CONSTRAINT `deletedBy` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `assets` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `folderId` MEDIUMINT UNSIGNED NOT NULL, \
      `path` VARCHAR(255) NOT NULL COMMENT 'does not include name. not canonical, here for fast lookups', \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_general_ci' NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      INDEX `path_idx` (`path`, `name`), \
      CONSTRAINT `folder` \
        FOREIGN KEY (`folderId`) \
        REFERENCES `assetfolders` (`id`), \
      CONSTRAINT `deletedBy` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`)) \
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
      CONSTRAINT `role` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `site` \
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
      CONSTRAINT `user` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `group` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `pages` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `pagetreeId` MEDIUMINT UNSIGNED NOT NULL, \
      `parentId` INT UNSIGNED, \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `linkId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `data_UNIQUE` (`dataId`), \
      UNIQUE INDEX `linkId_in_pagetree` (`pagetreeId`, `linkId`), \
      INDEX `linkId_idx` (`linkId`) \
      CONSTRAINT `pagetree` \
        FOREIGN KEY (`pagetreeId`) \
        REFERENCES `pagetrees` (`id`), \
      CONSTRAINT `parent` \
        FOREIGN KEY (`parentId`) \
        REFERENCES `pages` (`id`), \
      CONSTRAINT `data` \
        FOREIGN KEY (`dataId`) \
        REFERENCES `storage` (`id`), \
      CONSTRAINT `deletedBy` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
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
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `groups_roles` ( \
      `groupId` MEDIUMINT UNSIGNED NOT NULL, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`roleId`, `groupId`), \
      CONSTRAINT `group` \
        FOREIGN KEY (`groupId`) \
        REFERENCES `groups` (`id`), \
      CONSTRAINT `role` \
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
      CONSTRAINT `user` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `role` \
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
      CONSTRAINT `binary` \
        FOREIGN KEY (`binaryId`) \
        REFERENCES `binaries` (`id`), \
      CONSTRAINT `originalBinary` \
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
      `deleted` TINYINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `name_UNIQUE` (`name`), \
      UNIQUE INDEX `key_UNIQUE` (`key`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `sites_templates` ( \
      `siteId` SMALLINT UNSIGNED NOT NULL, \
      `templateId` SMALLINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`siteId`, `templateId`), \
      CONSTRAINT `site` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `template` \
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
      `viewlatest` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `create` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `update` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `move` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `publish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `unpublish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      INDEX `path` (`path`), \
      CONSTRAINT `role` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `pagetree` \
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
      CONSTRAINT `siteId` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `roleId` \
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
      CONSTRAINT `pagetree` \
        FOREIGN KEY (`pagetreeId`) \
        REFERENCES `pagetrees` (`id`), \
      CONSTRAINT `template` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `datafolders` ( \
      `id` MEDIUMINT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `name` VARCHAR(255) NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `templateId` SMALLINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `siteId` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `templateId` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute("\
    CREATE TABLE IF NOT EXISTS `data` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `dataId` CHAR(10) CHARACTER SET 'ascii' COLLATE 'ascii_bin' NOT NULL, \
      `siteId` SMALLINT UNSIGNED, \
      `folderId` MEDIUMINT UNSIGNED, \
      `deletedAt` DATETIME, \
      `deletedBy` MEDIUMINT UNSIGNED, \
      PRIMARY KEY (`id`), \
      UNIQUE INDEX `data_UNIQUE` (`dataId`), \
      CONSTRAINT `deletedBy` \
        FOREIGN KEY (`deletedBy`) \
        REFERENCES `users` (`id`), \
      CONSTRAINT `data` \
        FOREIGN KEY (`dataId`) \
        REFERENCES `storage` (`id`), \
      CONSTRAINT `siteId` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `folderId` \
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
      `viewlatest` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `create` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `update` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `publish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `unpublish` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `delete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      `undelete` TINYINT UNSIGNED NOT NULL DEFAULT 0, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `role` \
        FOREIGN KEY (`roleId`) \
        REFERENCES `roles` (`id`), \
      CONSTRAINT `site` \
        FOREIGN KEY (`siteId`) \
        REFERENCES `sites` (`id`), \
      CONSTRAINT `template` \
        FOREIGN KEY (`templateId`) \
        REFERENCES `templates` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;")
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `mutationlog` ( \
      `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, \
      `userId` MEDIUMINT UNSIGNED NOT NULL, \
      `mutation` VARCHAR(255) NOT NULL, \
      `query` TEXT NOT NULL, \
      `variables` JSON NOT NULL, \
      INDEX `createdAt_idx` (`createdAt`), \
      INDEX `mutation_idx` (`mutation`), \
      CONSTRAINT `user` \
        FOREIGN KEY (`userId`) \
        REFERENCES `users` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
  await db.execute('\
    CREATE TABLE IF NOT EXISTS `globalrules` ( \
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT, \
      `roleId` MEDIUMINT UNSIGNED NOT NULL, \
      `manageUsers` TINYINT UNSIGNED NOT NULL, \
      PRIMARY KEY (`id`), \
      CONSTRAINT `roleId` \
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
      CONSTRAINT `binaryId` \
        FOREIGN KEY (`binaryId`) \
        REFERENCES `binaries` (`id`)) \
    ENGINE = InnoDB \
    DEFAULT CHARACTER SET = utf8mb4 \
    DEFAULT COLLATE = utf8mb4_general_ci;')
}
