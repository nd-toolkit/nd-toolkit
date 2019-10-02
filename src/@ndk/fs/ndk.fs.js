/** @module @ndk/fs */
'use strict'

const { dirname, join, resolve } = require('path')
const {
  existsSync,
  promises: {
    copyFile,
    lstat,
    mkdir,
    readdir,
    readFile,
    readlink,
    rmdir,
    stat,
    symlink: symlinkFile,
    writeFile
  },
  constants: { COPYFILE_EXCL }
} = require('fs')

/**
 * @typedef CONSTANTS
 * @property {number} COPY_EXCL
 * @property {number} COPY_RMNONEXISTENT
 * @property {number} SYMLINK_EXCL
 * @property {number} SYMLINK_RMNONEXISTENT
 * @property {number} WALK_FILEFIRST
 * @property {number} WRITE_EXCL
 */
/** @type {CONSTANTS} */
const constants = Object.create(null)
const COPY_EXCL = constants.COPY_EXCL = 0b000001
const COPY_RMNONEXISTENT = constants.COPY_RMNONEXISTENT = 0b000010
const SYMLINK_EXCL = constants.SYMLINK_EXCL = 0b000100
const SYMLINK_RMNONEXISTENT = constants.SYMLINK_RMNONEXISTENT = 0b001000
const WALK_FILEFIRST = constants.WALK_FILEFIRST = 0b010000
const WRITE_EXCL = constants.WRITE_EXCL = 0b100000


/**
 * @callback Walker
 * @param {string} path
 * @param {import('fs').Dirent} dirent
 * @returns {boolean|Promise<boolean>}
 */
/**
 * @param {string} path
 * @param {number|Walker} [flags]
 * @param {Walker} [walker]
 * @returns {Promise<void>}
 */
async function walk(path, flags, walker) {
  if (typeof flags === 'function') {
    [flags, walker] = [walker, flags]
  }
  await __walk('.', { root: path, flags, walker })
}


/**
 * @typedef WalkOptions
 * @property {string} root
 * @property {number} [flags]
 * @property {Walker} walker
 */
/**
 * @param {string} path
 * @param {WalkOptions} options
 * @returns {Promise<void>}
 */
async function __walk(path, options) {
  const { root, flags, walker } = options
  const files = await readdir(join(root, path), { withFileTypes: true })

  for (const file of files) {
    const filePath = join(path, file.name)

    if (file.isDirectory()) {
      if (flags & WALK_FILEFIRST) {
        await __walk(filePath, options)
        await walker(filePath, file)
      } else {
        const needNested = await walker(filePath, file)

        if (needNested !== false) {
          await __walk(filePath, options)
        }
      }
    } else {
      await walker(filePath, file)
    }
  }
}


/**
 * @param {string} src
 * @param {string} dest
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function copy(src, dest, flags) {
  const srcStat = await stat(src)

  if (srcStat.isDirectory()) {
    await __copy(src, dest, flags)
  } else {
    const excl = flags & COPY_EXCL
    const fsFlags = excl ? COPYFILE_EXCL : 0

    if (!excl) {
      await mkdir(dirname(dest), { recursive: true })
    }
    await copyFile(src, dest, fsFlags)
  }
}


/**
 * @param {string} src
 * @param {string} dest
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function __copy(src, dest, flags) {
  const mkdirOptions = { recursive: !(flags & COPY_EXCL) }
  const existentPaths = flags & COPY_RMNONEXISTENT ? [] : false

  await mkdir(dest, mkdirOptions)
  await __walk('.', {
    root: src,
    walker: async (path, dirent) => {
      const destPath = join(dest, path)

      if (existentPaths) {
        existentPaths.push(destPath)
      }
      if (dirent.isDirectory()) {
        await mkdir(destPath, mkdirOptions)
      } else {
        await copyFile(join(src, path), destPath)
      }
    }
  })
  if (existentPaths) {
    await __walk('.', {
      root: dest,
      walker: async path => {
        const destPath = join(dest, path)

        if (!existentPaths.includes(destPath)) {
          await remove(destPath)

          return false
        }
      }
    })
  }
}


/**
 * @param {string} src
 * @param {string} dest
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function symlink(src, dest, flags) {
  const srcStat = await stat(src)

  if (srcStat.isDirectory()) {
    await __symlink(src, dest, flags)
  } else {
    if (!(flags & SYMLINK_EXCL)) {
      await mkdir(dirname(dest), { recursive: true })
    }
    await __symlinkFile(src, dest, flags)
  }
}


/**
 * @param {string} src
 * @param {string} dest
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function __symlink(src, dest, flags) {
  const mkdirOptions = { recursive: !(flags & SYMLINK_EXCL) }
  const existentPaths = flags & SYMLINK_RMNONEXISTENT ? [] : false

  await mkdir(dest, mkdirOptions)
  await __walk('.', {
    root: src,
    walker: async (path, dirent) => {
      const destPath = join(dest, path)

      if (existentPaths) {
        existentPaths.push(destPath)
      }
      if (dirent.isDirectory()) {
        await mkdir(destPath, mkdirOptions)
      } else {
        await __symlinkFile(join(src, path), destPath)
      }
    }
  })
  if (existentPaths) {
    await __walk('.', {
      root: dest,
      walker: async path => {
        const destPath = join(dest, path)

        if (!existentPaths.includes(destPath)) {
          await remove(destPath)

          return false
        }
      }
    })
  }
}


/**
 * @param {string} src
 * @param {string} dest
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function __symlinkFile(src, dest, flags) {
  const resolvedSrc = resolve(src)

  if (flags & SYMLINK_EXCL || !existsSync(dest)) {
    await symlinkFile(resolvedSrc, dest)
  } else {
    const destStat = await lstat(dest)

    if (destStat.isSymbolicLink()) {
      const link = await readlink(dest)

      if (resolvedSrc !== link) {
        await remove(dest)
        await symlinkFile(resolvedSrc, dest)
      }
    } else {
      await remove(dest)
      await symlinkFile(resolvedSrc, dest)
    }
  }
}


/**
 * @param {string} path
 * @returns {Promise<void>}
 */
async function remove(path) {
  await rmdir(path, { recursive: true })
}


/**
 * @param {string} path
 * @param {object} defaultValue
 * @returns {Promise<object>}
 */
async function readJSON(path, defaultValue) {
  const data = await readFile(path, 'utf8').then(JSON.parse).catch(error => {
    if (error.code === 'ENOENT' && typeof defaultValue !== 'undefined') {
      return defaultValue
    }
    throw error
  })

  return data
}


/**
 * @param {string} path
 * @param {string} defaultValue
 * @returns {Promise<string>}
 */
async function readText(path, defaultValue) {
  const data = await readFile(path, 'utf8').catch(error => {
    if (error.code === 'ENOENT' && typeof defaultValue !== 'undefined') {
      return defaultValue
    }
    throw error
  })

  return data
}


/**
 * @param {string} path
 * @param {object} data
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function writeJSON(path, data, flags) {
  const jsonData = JSON.stringify(data, null, 2)

  await writeText(path, jsonData, flags)
}


/**
 * @param {string} path
 * @param {string} data
 * @param {number} flags
 * @returns {Promise<void>}
 */
async function writeText(path, data, flags) {
  const recursive = !(flags & WRITE_EXCL)

  if (recursive) {
    await mkdir(dirname(path), { recursive })
  }

  await writeFile(path, data, {
    encoding: 'utf8',
    flag: recursive ? 'w' : 'wx'
  })
}


exports.constants = constants
exports.copy = copy
exports.readJSON = readJSON
exports.readText = readText
exports.remove = remove
exports.symlink = symlink
exports.walk = walk
exports.writeJSON = writeJSON
exports.writeText = writeText
