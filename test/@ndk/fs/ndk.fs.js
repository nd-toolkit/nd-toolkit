'use strict'

const { Test, assert } = require('@ndk/test')
const { copy, walk, WALK_FILE_FIRST } = require('@ndk/fs')
const { normalize } = require('path')
const { mkdir, rmdir } = require('fs').promises


exports['@ndk/fs'] = class FsTest extends Test {

  /** перебираем сначала папки затем вложенные файлы */
  async ['walk - базовый проход']() {
    const files = []
    const expected = [
      'f1.txt',
      'p1',
      normalize('p1/p1f1.txt'),
      normalize('p1/p1f2.txt'),
      'p2',
      normalize('p2/p2f1.txt')
    ]

    await walk('test/example/fs/walk', path => {
      files.push(path)
    })

    assert.deepEqual(files, expected)
  }

  /** если сначала перебираются папки, то можно вернуть false,
   * чтобы не проходить по вложениям папки */
  async ['walk - исключение папок']() {
    const files = []
    const expected = [
      'f1.txt',
      'p1',
      'p2',
      normalize('p2/p2f1.txt')
    ]

    await walk('test/example/fs/walk', (path, dirent) => {
      files.push(path)
      if (dirent.isDirectory() && path === 'p1') {
        return false
      }
    })

    assert.deepEqual(files, expected)
  }

  /** перебираем сначала вложенные файлы затем папки
   * + асинхронный walker */
  async ['walk - сначала вложенные файлы']() {
    const files = []
    const expected = [
      'f1.txt', true,
      normalize('p1/p1f1.txt'), true,
      normalize('p1/p1f2.txt'), true,
      'p1', false,
      normalize('p2/p2f1.txt'), true,
      'p2', false
    ]

    await walk('test/example/fs/walk', WALK_FILE_FIRST, async (path, dirent) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      files.push(path)
      files.push(dirent.isFile())
    })

    assert.deepEqual(files, expected)
  }

  /** купируем в несуществующую папку */
  async ['copy - базовый']() {
    const filesA = []
    const filesB = []

    await copy('test/example/fs/walk', 'test/example/fs/copy')
    await walk('test/example/fs/walk', path => filesA.push(path))
    await walk('test/example/fs/copy', path => filesB.push(path))
    await rmdir('test/example/fs/copy', { recursive: true })

    assert.deepEqual(filesB, filesA)
  }

  /** купируем в существующую папку с заменой */
  /** купируем в существующую папку с ошибкой */

  /** копируем файл */
  async ['copy - файл']() {
    const files = []

    await mkdir('test/example/fs/copy')
    await copy('test/example/fs/walk/f1.txt', 'test/example/fs/copy/f1.txt')
    await walk('test/example/fs/copy', path => files.push(path))
    await rmdir('test/example/fs/copy', { recursive: true })

    assert.deepEqual(files, ['f1.txt'])
  }

  /** копируем файл, если каталог назначения не создан */
  async ['copy - файл (без каталога)']() {
    const files = []

    await copy('test/example/fs/walk/f1.txt', 'test/example/fs/copy/f1.txt')
    await walk('test/example/fs/copy', path => files.push(path))
    await rmdir('test/example/fs/copy', { recursive: true })

    assert.deepEqual(files, ['f1.txt'])
  }

}
