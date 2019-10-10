/** @module  @ndk/fn/events */
'use strict'

/** @typedef {any} Event */
/** @typedef {function(...any)} Listener */
/** @typedef {Map<Event, Set<Listener>>} ListenersMap */
/** @type {WeakMap<EventEmitter, ListenersMap>} */
const privateEventsMap = new WeakMap()
/** @type {WeakMap<PromiseEventEmitter, EventEmitter>} */
const privatePromiseEventEmittersMap = new WeakMap()
/** @type {Object<string, Symbol>} */
const pemEvents = {
  resolve: Symbol('PromiseEventEmitter#event:resolve'),
  reject: Symbol('PromiseEventEmitter#event:reject')
}


class EventEmitter {

  /** @returns {EventEmitter} */
  constructor() {
    privateEventsMap.set(this, new Map())
  }

  /**
   * @param {Event} event
   * @param  {...any} args
   * @returns {Promise<void>}
   */
  async emit(event, ...args) {
    const listeners = privateEventsMap.get(this).get(event)

    if (listeners) {
      for (const listener of listeners) {
        await listener(...args)
      }
    }
  }

  /**
   * @param {Event} event
   * @returns {boolean}
   */
  has(event) {
    return privateEventsMap.get(this).has(event)
  }

  /**
   * @param {Event} event
   * @param  {Listener} listener
   * @returns {EventEmitter}
   */
  on(event, listener) {
    const events = privateEventsMap.get(this)

    if (!events.has(event)) {
      events.set(event, new Set())
    }

    events.get(event).add(listener)

    return this
  }

  /**
   * @param {Event} event
   * @param  {Listener} listener
   * @returns {boolean}
   */
  delete(event, listener) {
    const events = privateEventsMap.get(this)
    const listeners = events.get(event)
    let result = false

    if (listeners) {
      result = listeners.delete(listener)
      if (!listeners.size) {
        events.delete(event)
      }
    }

    return result
  }

  /**
   * @param {Event} event
   * @returns {Promise<Array<any>>}
   */
  once(event) {
    const events = privateEventsMap.get(this)

    if (!events.has(event)) {
      events.set(event, new Set())
    }

    return new Promise(resolve => {
      const listeners = events.get(event)
      const listener = (...args) => {
        resolve(args)
        listeners.delete(listener)
        if (!listeners.size) {
          events.delete(event)
        }
      }

      listeners.add(listener)
    })
  }

}


class PromiseEventEmitter extends Promise {

  /**
   * @callback PromiseExecutor
   * @param {function} resolve
   * @param {?function} reject
   * @param {?PromiseEventEmitter} emitter
   * @returns {?Promise<void>}
   */
  /**
   * @param {?PromiseExecutor} executor
   */
  constructor(executor) {
    const emitter = new EventEmitter()
    const promiseExecutor = (resolve, reject) => emitter
      .on(pemEvents.resolve, value => { resolve(value) })
      .on(pemEvents.reject, reason => { reject(reason) })

    super(promiseExecutor)

    privatePromiseEventEmittersMap.set(this, emitter)

    if (executor) {
      const resolve = value => { emitter.emit(pemEvents.resolve, value) }
      const reject = reason => { emitter.emit(pemEvents.reject, reason) }
      const promise = executor(resolve, reject, this)

      if (promise instanceof Promise) {
        promise.catch(reason => { emitter.emit(pemEvents.reject, reason) })
      }
    }
  }

  /**
   * @param {Event} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    const emitter = privatePromiseEventEmittersMap.get(this)

    emitter.emit(event, ...args).catch(reason => {
      emitter.emit(pemEvents.reject, reason)
    })
  }

  /**
   * @param {Event} event
   * @param  {Listener} listener
   * @returns {PromiseEventEmitter}
   */
  on(event, listener) {
    const emitter = privatePromiseEventEmittersMap.get(this)

    emitter.on(event, listener)

    return this
  }

  /**
   * @param {Event} event
   * @returns {Promise<Array<any>>}
   */
  once(event) {
    const emitter = privatePromiseEventEmittersMap.get(this)

    return new Promise((resolve, reject) => {
      emitter.once(pemEvents.reject).then(([reason]) => { reject(reason) })
      emitter.once(event).then(value => { resolve(value) }, reason => { reject(reason) })
    })
  }

  /**
   * @param {any} value
   */
  resolve(value) {
    const emitter = privatePromiseEventEmittersMap.get(this)

    emitter.emit(pemEvents.resolve, value)
  }

  /**
   * @param {any} reason
   */
  reject(reason) {
    const emitter = privatePromiseEventEmittersMap.get(this)

    emitter.emit(pemEvents.reject, reason)
  }

}


exports.EventEmitter = EventEmitter
exports.PromiseEventEmitter = PromiseEventEmitter
