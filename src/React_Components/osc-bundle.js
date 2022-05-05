(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
'use strict'

exports.byteLength = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}

},{}],3:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict'

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

var K_MAX_LENGTH = 0x7fffffff
exports.kMaxLength = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1)
    arr.__proto__ = { __proto__: Uint8Array.prototype, foo: function () { return 42 } }
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length)
  buf.__proto__ = Buffer.prototype
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null &&
    Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  })
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value)
  }

  if (value == null) {
    throw TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  var valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  var b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(
      value[Symbol.toPrimitive]('string'), encodingOrOffset, length
    )
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype
Buffer.__proto__ = Uint8Array

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  var length = byteLength(string, encoding) | 0
  var buf = createBuffer(length)

  var actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0
  var buf = createBuffer(length)
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  var buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype
  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0
    var buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  var buffer = Buffer.allocUnsafe(length)
  var pos = 0
  for (i = 0; i < list.length; ++i) {
    var buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf)
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    }
    buf.copy(buffer, pos)
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  var len = string.length
  var mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  var loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  var i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  var len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  var len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  var len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  var length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  var x = thisEnd - thisStart
  var y = end - start
  var len = Math.min(x, y)

  var thisCopy = this.slice(thisStart, thisEnd)
  var targetCopy = target.slice(start, end)

  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [ val ], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  var indexSize = 1
  var arrLength = arr.length
  var valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  var i
  if (dir) {
    var foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      var found = true
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  var strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function latin1Write (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  var res = []

  var i = start
  while (i < end) {
    var firstByte = buf[i]
    var codePoint = null
    var bytesPerSequence = (firstByte > 0xEF) ? 4
      : (firstByte > 0xDF) ? 3
        : (firstByte > 0xBF) ? 2
          : 1

    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  var len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = ''
  var i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype
  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    var limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  var i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    var bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    var len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []

  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":2,"buffer":3,"ieee754":4}],4:[function(require,module,exports){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(require,module,exports){
const OSC = require('osc-js');
console.log("OSC GET");

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

if(urlParams.get("host") != null){
	hostIP = urlParams.get("host");
	clientIP = urlParams.get("client");
	hostPort = urlParams.get("port");
}

const hostIP = "192.168.0.189";
const clientIP = "192.168.0.170";
const hostPort = 3333;

if(hostIP == null || hostPort == null || clientIP == null){
	console.log("HOST OR PORT UNDEFINED");
	return;
}

const osc = new OSC({plugin: new OSC.WebsocketClientPlugin({host:hostIP,port:hostPort,secure:false})});
console.log("OSC NOT SECURE");

initOSC(clientIP);

function initOSC(localIP){
    osc.open();
    osc.on("open", () =>{
        console.log("OSC OPEN");
        osc.send(new OSC.Message('/frontend', localIP));
    });
    osc.on('*', (message)=>{
        getOSCMessage(message);
    });
}

window.sendOSC = function(address, message){
	osc.send(new OSC.Message(address, message));
}
},{"osc-js":7}],6:[function(require,module,exports){
(function (global){(function (){
// https://github.com/maxogden/websocket-stream/blob/48dc3ddf943e5ada668c31ccd94e9186f02fafbd/ws-fallback.js

var ws = null

if (typeof WebSocket !== 'undefined') {
  ws = WebSocket
} else if (typeof MozWebSocket !== 'undefined') {
  ws = MozWebSocket
} else if (typeof global !== 'undefined') {
  ws = global.WebSocket || global.MozWebSocket
} else if (typeof window !== 'undefined') {
  ws = window.WebSocket || window.MozWebSocket
} else if (typeof self !== 'undefined') {
  ws = self.WebSocket || self.MozWebSocket
}

module.exports = ws

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],7:[function(require,module,exports){
(function (global,Buffer,__dirname){(function (){
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.OSC = factory());
}(this, (function () { 'use strict';

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  function _createClass(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
  }

  function _defineProperty(obj, key, value) {
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }

    return obj;
  }

  function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);

    if (Object.getOwnPropertySymbols) {
      var symbols = Object.getOwnPropertySymbols(object);
      if (enumerableOnly) symbols = symbols.filter(function (sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      });
      keys.push.apply(keys, symbols);
    }

    return keys;
  }

  function _objectSpread2(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] != null ? arguments[i] : {};

      if (i % 2) {
        ownKeys(Object(source), true).forEach(function (key) {
          _defineProperty(target, key, source[key]);
        });
      } else if (Object.getOwnPropertyDescriptors) {
        Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
      } else {
        ownKeys(Object(source)).forEach(function (key) {
          Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
      }
    }

    return target;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function");
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        writable: true,
        configurable: true
      }
    });
    if (superClass) _setPrototypeOf(subClass, superClass);
  }

  function _getPrototypeOf(o) {
    _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf : function _getPrototypeOf(o) {
      return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _getPrototypeOf(o);
  }

  function _setPrototypeOf(o, p) {
    _setPrototypeOf = Object.setPrototypeOf || function _setPrototypeOf(o, p) {
      o.__proto__ = p;
      return o;
    };

    return _setPrototypeOf(o, p);
  }

  function _isNativeReflectConstruct() {
    if (typeof Reflect === "undefined" || !Reflect.construct) return false;
    if (Reflect.construct.sham) return false;
    if (typeof Proxy === "function") return true;

    try {
      Date.prototype.toString.call(Reflect.construct(Date, [], function () {}));
      return true;
    } catch (e) {
      return false;
    }
  }

  function _assertThisInitialized(self) {
    if (self === void 0) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return self;
  }

  function _possibleConstructorReturn(self, call) {
    if (call && (typeof call === "object" || typeof call === "function")) {
      return call;
    }

    return _assertThisInitialized(self);
  }

  function _createSuper(Derived) {
    var hasNativeReflectConstruct = _isNativeReflectConstruct();

    return function _createSuperInternal() {
      var Super = _getPrototypeOf(Derived),
          result;

      if (hasNativeReflectConstruct) {
        var NewTarget = _getPrototypeOf(this).constructor;

        result = Reflect.construct(Super, arguments, NewTarget);
      } else {
        result = Super.apply(this, arguments);
      }

      return _possibleConstructorReturn(this, result);
    };
  }

  function _superPropBase(object, property) {
    while (!Object.prototype.hasOwnProperty.call(object, property)) {
      object = _getPrototypeOf(object);
      if (object === null) break;
    }

    return object;
  }

  function _get(target, property, receiver) {
    if (typeof Reflect !== "undefined" && Reflect.get) {
      _get = Reflect.get;
    } else {
      _get = function _get(target, property, receiver) {
        var base = _superPropBase(target, property);

        if (!base) return;
        var desc = Object.getOwnPropertyDescriptor(base, property);

        if (desc.get) {
          return desc.get.call(receiver);
        }

        return desc.value;
      };
    }

    return _get(target, property, receiver || target);
  }

  function isInt(n) {
    return Number(n) === n && n % 1 === 0;
  }
  function isFloat(n) {
    return Number(n) === n && n % 1 !== 0;
  }
  function isString(n) {
    return typeof n === 'string';
  }
  function isArray(n) {
    return Object.prototype.toString.call(n) === '[object Array]';
  }
  function isObject(n) {
    return Object.prototype.toString.call(n) === '[object Object]';
  }
  function isFunction(n) {
    return typeof n === 'function';
  }
  function isBlob(n) {
    return n instanceof Uint8Array;
  }
  function isDate(n) {
    return n instanceof Date;
  }
  function isUndefined(n) {
    return typeof n === 'undefined';
  }
  function pad(n) {
    return n + 3 & ~0x03;
  }
  function hasProperty(name) {
    return Object.prototype.hasOwnProperty.call(typeof global !== 'undefined' ? global : window,
    name);
  }
  function dataView(obj) {
    if (obj.buffer) {
      return new DataView(obj.buffer);
    } else if (obj instanceof ArrayBuffer) {
      return new DataView(obj);
    }
    return new DataView(new Uint8Array(obj));
  }

  function typeTag(item) {
    if (isInt(item)) {
      return 'i';
    } else if (isFloat(item)) {
      return 'f';
    } else if (isString(item)) {
      return 's';
    } else if (isBlob(item)) {
      return 'b';
    }
    throw new Error('OSC typeTag() found unknown value type');
  }
  function prepareAddress(obj) {
    var address = '';
    if (isArray(obj)) {
      return "/".concat(obj.join('/'));
    } else if (isString(obj)) {
      address = obj;
      if (address.length > 1 && address[address.length - 1] === '/') {
        address = address.slice(0, address.length - 1);
      }
      if (address.length > 1 && address[0] !== '/') {
        address = "/".concat(address);
      }
      return address;
    }
    throw new Error('OSC prepareAddress() needs addresses of type array or string');
  }
  function prepareRegExPattern(str) {
    var pattern;
    if (!isString(str)) {
      throw new Error('OSC prepareRegExPattern() needs strings');
    }
    pattern = str.replace(/\./g, '\\.');
    pattern = pattern.replace(/\(/g, '\\(');
    pattern = pattern.replace(/\)/g, '\\)');
    pattern = pattern.replace(/\{/g, '(');
    pattern = pattern.replace(/\}/g, ')');
    pattern = pattern.replace(/,/g, '|');
    pattern = pattern.replace(/\[!/g, '[^');
    pattern = pattern.replace(/\?/g, '.');
    pattern = pattern.replace(/\*/g, '.*');
    return pattern;
  }
  var EncodeHelper = function () {
    function EncodeHelper() {
      _classCallCheck(this, EncodeHelper);
      this.data = [];
      this.byteLength = 0;
    }
    _createClass(EncodeHelper, [{
      key: "add",
      value: function add(item) {
        var buffer = item.pack();
        this.byteLength += buffer.byteLength;
        this.data.push(buffer);
        return this;
      }
    }, {
      key: "merge",
      value: function merge() {
        var result = new Uint8Array(this.byteLength);
        var offset = 0;
        this.data.forEach(function (data) {
          result.set(data, offset);
          offset += data.byteLength;
        });
        return result;
      }
    }]);
    return EncodeHelper;
  }();

  var Atomic = function () {
    function Atomic(value) {
      _classCallCheck(this, Atomic);
      this.value = value;
      this.offset = 0;
    }
    _createClass(Atomic, [{
      key: "pack",
      value: function pack(method, byteLength) {
        if (!(method && byteLength)) {
          throw new Error('OSC Atomic cant\'t be packed without given method or byteLength');
        }
        var data = new Uint8Array(byteLength);
        var dataView = new DataView(data.buffer);
        if (isUndefined(this.value)) {
          throw new Error('OSC Atomic cant\'t be encoded with empty value');
        }
        dataView[method](this.offset, this.value, false);
        return data;
      }
    }, {
      key: "unpack",
      value: function unpack(dataView, method, byteLength) {
        var initialOffset = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
        if (!(dataView && method && byteLength)) {
          throw new Error('OSC Atomic cant\'t be unpacked without given dataView, method or byteLength');
        }
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC Atomic expects an instance of type DataView');
        }
        this.value = dataView[method](initialOffset, false);
        this.offset = initialOffset + byteLength;
        return this.offset;
      }
    }]);
    return Atomic;
  }();

  var AtomicInt32 = function (_Atomic) {
    _inherits(AtomicInt32, _Atomic);
    var _super = _createSuper(AtomicInt32);
    function AtomicInt32(value) {
      _classCallCheck(this, AtomicInt32);
      if (value && !isInt(value)) {
        throw new Error('OSC AtomicInt32 constructor expects value of type number');
      }
      return _super.call(this, value);
    }
    _createClass(AtomicInt32, [{
      key: "pack",
      value: function pack() {
        return _get(_getPrototypeOf(AtomicInt32.prototype), "pack", this).call(this, 'setInt32', 4);
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        return _get(_getPrototypeOf(AtomicInt32.prototype), "unpack", this).call(this, dataView, 'getInt32', 4, initialOffset);
      }
    }]);
    return AtomicInt32;
  }(Atomic);

  var STR_SLICE_SIZE = 65537;
  var STR_ENCODING = 'utf-8';
  function charCodesToString(charCodes) {
    if (hasProperty('Buffer')) {
      return Buffer.from(charCodes).toString(STR_ENCODING);
    } else if (hasProperty('TextDecoder')) {
      return new TextDecoder(STR_ENCODING)
      .decode(new Int8Array(charCodes));
    }
    var str = '';
    for (var i = 0; i < charCodes.length; i += STR_SLICE_SIZE) {
      str += String.fromCharCode.apply(null, charCodes.slice(i, i + STR_SLICE_SIZE));
    }
    return str;
  }
  var AtomicString = function (_Atomic) {
    _inherits(AtomicString, _Atomic);
    var _super = _createSuper(AtomicString);
    function AtomicString(value) {
      _classCallCheck(this, AtomicString);
      if (value && !isString(value)) {
        throw new Error('OSC AtomicString constructor expects value of type string');
      }
      return _super.call(this, value);
    }
    _createClass(AtomicString, [{
      key: "pack",
      value: function pack() {
        if (isUndefined(this.value)) {
          throw new Error('OSC AtomicString can not be encoded with empty value');
        }
        var terminated = "".concat(this.value, "\0");
        var byteLength = pad(terminated.length);
        var buffer = new Uint8Array(byteLength);
        for (var i = 0; i < terminated.length; i += 1) {
          buffer[i] = terminated.charCodeAt(i);
        }
        return buffer;
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC AtomicString expects an instance of type DataView');
        }
        var offset = initialOffset;
        var charcode;
        var charCodes = [];
        for (; offset < dataView.byteLength; offset += 1) {
          charcode = dataView.getUint8(offset);
          if (charcode !== 0) {
            charCodes.push(charcode);
          } else {
            offset += 1;
            break;
          }
        }
        if (offset === dataView.length) {
          throw new Error('OSC AtomicString found a malformed OSC string');
        }
        this.offset = pad(offset);
        this.value = charCodesToString(charCodes);
        return this.offset;
      }
    }]);
    return AtomicString;
  }(Atomic);

  var SECONDS_70_YEARS = 2208988800;
  var TWO_POWER_32 = 4294967296;
  var Timetag = function () {
    function Timetag() {
      var seconds = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      var fractions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      _classCallCheck(this, Timetag);
      if (!(isInt(seconds) && isInt(fractions))) {
        throw new Error('OSC Timetag constructor expects values of type integer number');
      }
      this.seconds = seconds;
      this.fractions = fractions;
    }
    _createClass(Timetag, [{
      key: "timestamp",
      value: function timestamp(milliseconds) {
        var seconds;
        if (typeof milliseconds === 'number') {
          seconds = milliseconds / 1000;
          var rounded = Math.floor(seconds);
          this.seconds = rounded + SECONDS_70_YEARS;
          this.fractions = Math.round(TWO_POWER_32 * (seconds - rounded));
          return milliseconds;
        }
        seconds = this.seconds - SECONDS_70_YEARS;
        return (seconds + Math.round(this.fractions / TWO_POWER_32)) * 1000;
      }
    }]);
    return Timetag;
  }();
  var AtomicTimetag = function (_Atomic) {
    _inherits(AtomicTimetag, _Atomic);
    var _super = _createSuper(AtomicTimetag);
    function AtomicTimetag() {
      var value = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : Date.now();
      _classCallCheck(this, AtomicTimetag);
      var timetag = new Timetag();
      if (value instanceof Timetag) {
        timetag = value;
      } else if (isInt(value)) {
        timetag.timestamp(value);
      } else if (isDate(value)) {
        timetag.timestamp(value.getTime());
      }
      return _super.call(this, timetag);
    }
    _createClass(AtomicTimetag, [{
      key: "pack",
      value: function pack() {
        if (isUndefined(this.value)) {
          throw new Error('OSC AtomicTimetag can not be encoded with empty value');
        }
        var _this$value = this.value,
            seconds = _this$value.seconds,
            fractions = _this$value.fractions;
        var data = new Uint8Array(8);
        var dataView = new DataView(data.buffer);
        dataView.setInt32(0, seconds, false);
        dataView.setInt32(4, fractions, false);
        return data;
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC AtomicTimetag expects an instance of type DataView');
        }
        var seconds = dataView.getUint32(initialOffset, false);
        var fractions = dataView.getUint32(initialOffset + 4, false);
        this.value = new Timetag(seconds, fractions);
        this.offset = initialOffset + 8;
        return this.offset;
      }
    }]);
    return AtomicTimetag;
  }(Atomic);

  var AtomicBlob = function (_Atomic) {
    _inherits(AtomicBlob, _Atomic);
    var _super = _createSuper(AtomicBlob);
    function AtomicBlob(value) {
      _classCallCheck(this, AtomicBlob);
      if (value && !isBlob(value)) {
        throw new Error('OSC AtomicBlob constructor expects value of type Uint8Array');
      }
      return _super.call(this, value);
    }
    _createClass(AtomicBlob, [{
      key: "pack",
      value: function pack() {
        if (isUndefined(this.value)) {
          throw new Error('OSC AtomicBlob can not be encoded with empty value');
        }
        var byteLength = pad(this.value.byteLength);
        var data = new Uint8Array(byteLength + 4);
        var dataView = new DataView(data.buffer);
        dataView.setInt32(0, this.value.byteLength, false);
        data.set(this.value, 4);
        return data;
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC AtomicBlob expects an instance of type DataView');
        }
        var byteLength = dataView.getInt32(initialOffset, false);
        this.value = new Uint8Array(dataView.buffer, initialOffset + 4, byteLength);
        this.offset = pad(initialOffset + 4 + byteLength);
        return this.offset;
      }
    }]);
    return AtomicBlob;
  }(Atomic);

  var AtomicFloat32 = function (_Atomic) {
    _inherits(AtomicFloat32, _Atomic);
    var _super = _createSuper(AtomicFloat32);
    function AtomicFloat32(value) {
      _classCallCheck(this, AtomicFloat32);
      if (value && !isFloat(value)) {
        throw new Error('OSC AtomicFloat32 constructor expects value of type float');
      }
      return _super.call(this, value);
    }
    _createClass(AtomicFloat32, [{
      key: "pack",
      value: function pack() {
        return _get(_getPrototypeOf(AtomicFloat32.prototype), "pack", this).call(this, 'setFloat32', 4);
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        return _get(_getPrototypeOf(AtomicFloat32.prototype), "unpack", this).call(this, dataView, 'getFloat32', 4, initialOffset);
      }
    }]);
    return AtomicFloat32;
  }(Atomic);

  var Message = function () {
    function Message() {
      _classCallCheck(this, Message);
      this.offset = 0;
      this.address = '';
      this.types = '';
      this.args = [];
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      if (args.length > 0) {
        if (!(isString(args[0]) || isArray(args[0]))) {
          throw new Error('OSC Message constructor first argument (address) must be a string or array');
        }
        this.address = prepareAddress(args.shift());
        this.types = args.map(function (item) {
          return typeTag(item);
        }).join('');
        this.args = args;
      }
    }
    _createClass(Message, [{
      key: "add",
      value: function add(item) {
        if (isUndefined(item)) {
          throw new Error('OSC Message needs a valid OSC Atomic Data Type');
        }
        this.args.push(item);
        this.types += typeTag(item);
      }
    }, {
      key: "pack",
      value: function pack() {
        if (this.address.length === 0 || this.address[0] !== '/') {
          throw new Error('OSC Message has an invalid address');
        }
        var encoder = new EncodeHelper();
        encoder.add(new AtomicString(this.address));
        encoder.add(new AtomicString(",".concat(this.types)));
        if (this.args.length > 0) {
          var argument;
          this.args.forEach(function (value) {
            if (isInt(value)) {
              argument = new AtomicInt32(value);
            } else if (isFloat(value)) {
              argument = new AtomicFloat32(value);
            } else if (isString(value)) {
              argument = new AtomicString(value);
            } else if (isBlob(value)) {
              argument = new AtomicBlob(value);
            } else {
              throw new Error('OSC Message found unknown argument type');
            }
            encoder.add(argument);
          });
        }
        return encoder.merge();
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC Message expects an instance of type DataView.');
        }
        var address = new AtomicString();
        address.unpack(dataView, initialOffset);
        var types = new AtomicString();
        types.unpack(dataView, address.offset);
        if (address.value.length === 0 || address.value[0] !== '/') {
          throw new Error('OSC Message found malformed or missing address string');
        }
        if (types.value.length === 0 && types.value[0] !== ',') {
          throw new Error('OSC Message found malformed or missing type string');
        }
        var offset = types.offset;
        var next;
        var type;
        var args = [];
        for (var i = 1; i < types.value.length; i += 1) {
          type = types.value[i];
          if (type === 'i') {
            next = new AtomicInt32();
          } else if (type === 'f') {
            next = new AtomicFloat32();
          } else if (type === 's') {
            next = new AtomicString();
          } else if (type === 'b') {
            next = new AtomicBlob();
          } else {
            throw new Error('OSC Message found non-standard argument type');
          }
          offset = next.unpack(dataView, offset);
          args.push(next.value);
        }
        this.offset = offset;
        this.address = address.value;
        this.types = types.value;
        this.args = args;
        return this.offset;
      }
    }]);
    return Message;
  }();

  var BUNDLE_TAG = '#bundle';
  var Bundle = function () {
    function Bundle() {
      var _this = this;
      _classCallCheck(this, Bundle);
      this.offset = 0;
      this.timetag = new AtomicTimetag();
      this.bundleElements = [];
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      if (args.length > 0) {
        if (args[0] instanceof Date || isInt(args[0])) {
          this.timetag = new AtomicTimetag(args[0]);
        } else if (isArray(args[0])) {
          args[0].forEach(function (item) {
            _this.add(item);
          });
          if (args.length > 1 && (args[1] instanceof Date || isInt(args[0]))) {
            this.timetag = new AtomicTimetag(args[1]);
          }
        } else {
          args.forEach(function (item) {
            _this.add(item);
          });
        }
      }
    }
    _createClass(Bundle, [{
      key: "timestamp",
      value: function timestamp(ms) {
        if (!isInt(ms)) {
          throw new Error('OSC Bundle needs an integer for setting the timestamp');
        }
        this.timetag = new AtomicTimetag(ms);
      }
    }, {
      key: "add",
      value: function add(item) {
        if (!(item instanceof Message || item instanceof Bundle)) {
          throw new Error('OSC Bundle contains only Messages and Bundles');
        }
        this.bundleElements.push(item);
      }
    }, {
      key: "pack",
      value: function pack() {
        var encoder = new EncodeHelper();
        encoder.add(new AtomicString(BUNDLE_TAG));
        if (!this.timetag) {
          this.timetag = new AtomicTimetag();
        }
        encoder.add(this.timetag);
        this.bundleElements.forEach(function (item) {
          encoder.add(new AtomicInt32(item.pack().byteLength));
          encoder.add(item);
        });
        return encoder.merge();
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC Bundle expects an instance of type DataView');
        }
        var parentHead = new AtomicString();
        parentHead.unpack(dataView, initialOffset);
        if (parentHead.value !== BUNDLE_TAG) {
          throw new Error('OSC Bundle does not contain a valid #bundle head');
        }
        var timetag = new AtomicTimetag();
        var offset = timetag.unpack(dataView, parentHead.offset);
        this.bundleElements = [];
        while (offset < dataView.byteLength) {
          var head = new AtomicString();
          var size = new AtomicInt32();
          offset = size.unpack(dataView, offset);
          var item = void 0;
          head.unpack(dataView, offset);
          if (head.value === BUNDLE_TAG) {
            item = new Bundle();
          } else {
            item = new Message();
          }
          offset = item.unpack(dataView, offset);
          this.bundleElements.push(item);
        }
        this.offset = offset;
        this.timetag = timetag;
        return this.offset;
      }
    }]);
    return Bundle;
  }();

  var Packet = function () {
    function Packet(value) {
      _classCallCheck(this, Packet);
      if (value && !(value instanceof Message || value instanceof Bundle)) {
        throw new Error('OSC Packet value has to be Message or Bundle');
      }
      this.value = value;
      this.offset = 0;
    }
    _createClass(Packet, [{
      key: "pack",
      value: function pack() {
        if (!this.value) {
          throw new Error('OSC Packet can not be encoded with empty body');
        }
        return this.value.pack();
      }
    }, {
      key: "unpack",
      value: function unpack(dataView) {
        var initialOffset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        if (!(dataView instanceof DataView)) {
          throw new Error('OSC Packet expects an instance of type DataView');
        }
        if (dataView.byteLength % 4 !== 0) {
          throw new Error('OSC Packet byteLength has to be a multiple of four');
        }
        var head = new AtomicString();
        head.unpack(dataView, initialOffset);
        var item;
        if (head.value === BUNDLE_TAG) {
          item = new Bundle();
        } else {
          item = new Message();
        }
        item.unpack(dataView, initialOffset);
        this.offset = item.offset;
        this.value = item;
        return this.offset;
      }
    }]);
    return Packet;
  }();

  var defaultOptions = {
    discardLateMessages: false
  };
  var EventHandler = function () {
    function EventHandler(options) {
      _classCallCheck(this, EventHandler);
      this.options = _objectSpread2(_objectSpread2({}, defaultOptions), options);
      this.addressHandlers = [];
      this.eventHandlers = {
        open: [],
        error: [],
        close: []
      };
      this.uuid = 0;
    }
    _createClass(EventHandler, [{
      key: "dispatch",
      value: function dispatch(packet, rinfo) {
        var _this = this;
        if (!(packet instanceof Packet)) {
          throw new Error('OSC EventHander dispatch() accepts only arguments of type Packet');
        }
        if (!packet.value) {
          throw new Error('OSC EventHander dispatch() can\'t read empty Packets');
        }
        if (packet.value instanceof Bundle) {
          var bundle = packet.value;
          return bundle.bundleElements.forEach(function (bundleItem) {
            if (bundleItem instanceof Bundle) {
              if (bundle.timetag.value.timestamp() < bundleItem.timetag.value.timestamp()) {
                throw new Error('OSC Bundle timestamp is older than the timestamp of enclosed Bundles');
              }
              return _this.dispatch(bundleItem);
            } else if (bundleItem instanceof Message) {
              var message = bundleItem;
              return _this.notify(message.address, message, bundle.timetag.value.timestamp(), rinfo);
            }
            throw new Error('OSC EventHander dispatch() can\'t dispatch unknown Packet value');
          });
        } else if (packet.value instanceof Message) {
          var message = packet.value;
          return this.notify(message.address, message, 0, rinfo);
        }
        throw new Error('OSC EventHander dispatch() can\'t dispatch unknown Packet value');
      }
    }, {
      key: "call",
      value: function call(name, data, rinfo) {
        var success = false;
        if (isString(name) && name in this.eventHandlers) {
          this.eventHandlers[name].forEach(function (handler) {
            handler.callback(data, rinfo);
            success = true;
          });
          return success;
        }
        var handlerKeys = Object.keys(this.addressHandlers);
        var handlers = this.addressHandlers;
        handlerKeys.forEach(function (key) {
          var foundMatch = false;
          var regex = new RegExp(prepareRegExPattern(prepareAddress(name)), 'g');
          var test = regex.test(key);
          if (test && key.length === regex.lastIndex) {
            foundMatch = true;
          }
          if (!foundMatch) {
            var reverseRegex = new RegExp(prepareRegExPattern(prepareAddress(key)), 'g');
            var reverseTest = reverseRegex.test(name);
            if (reverseTest && name.length === reverseRegex.lastIndex) {
              foundMatch = true;
            }
          }
          if (foundMatch) {
            handlers[key].forEach(function (handler) {
              handler.callback(data, rinfo);
              success = true;
            });
          }
        });
        return success;
      }
    }, {
      key: "notify",
      value: function notify() {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }
        if (args.length === 0) {
          throw new Error('OSC EventHandler can not be called without any argument');
        }
        if (args[0] instanceof Packet) {
          return this.dispatch(args[0], args[1]);
        } else if (args[0] instanceof Bundle || args[0] instanceof Message) {
          return this.dispatch(new Packet(args[0]), args[1]);
        } else if (!isString(args[0])) {
          var packet = new Packet();
          packet.unpack(dataView(args[0]));
          return this.dispatch(packet, args[1]);
        }
        var name = args[0];
        var data = null;
        if (args.length > 1) {
          data = args[1];
        }
        var timestamp = null;
        if (args.length > 2) {
          if (isInt(args[2])) {
            timestamp = args[2];
          } else if (args[2] instanceof Date) {
            timestamp = args[2].getTime();
          } else {
            throw new Error('OSC EventHandler timestamp has to be a number or Date');
          }
        }
        var rinfo = null;
        if (args.length >= 3) {
          rinfo = args[3];
        }
        if (timestamp) {
          var now = Date.now();
          if (now > timestamp) {
            if (!this.options.discardLateMessages) {
              return this.call(name, data, rinfo);
            }
          }
          var that = this;
          setTimeout(function () {
            that.call(name, data, rinfo);
          }, timestamp - now);
          return true;
        }
        return this.call(name, data, rinfo);
      }
    }, {
      key: "on",
      value: function on(name, callback) {
        if (!(isString(name) || isArray(name))) {
          throw new Error('OSC EventHandler accepts only strings or arrays for address patterns');
        }
        if (!isFunction(callback)) {
          throw new Error('OSC EventHandler callback has to be a function');
        }
        this.uuid += 1;
        var handler = {
          id: this.uuid,
          callback: callback
        };
        if (isString(name) && name in this.eventHandlers) {
          this.eventHandlers[name].push(handler);
          return this.uuid;
        }
        var address = prepareAddress(name);
        if (!(address in this.addressHandlers)) {
          this.addressHandlers[address] = [];
        }
        this.addressHandlers[address].push(handler);
        return this.uuid;
      }
    }, {
      key: "off",
      value: function off(name, subscriptionId) {
        if (!(isString(name) || isArray(name))) {
          throw new Error('OSC EventHandler accepts only strings or arrays for address patterns');
        }
        if (!isInt(subscriptionId)) {
          throw new Error('OSC EventHandler subscription id has to be a number');
        }
        var key;
        var haystack;
        if (isString(name) && name in this.eventHandlers) {
          key = name;
          haystack = this.eventHandlers;
        } else {
          key = prepareAddress(name);
          haystack = this.addressHandlers;
        }
        if (key in haystack) {
          return haystack[key].some(function (item, index) {
            if (item.id === subscriptionId) {
              haystack[key].splice(index, 1);
              return true;
            }
            return false;
          });
        }
        return false;
      }
    }]);
    return EventHandler;
  }();

  var dgram = typeof __dirname !== 'undefined' ? require('dgram') : undefined;
  var STATUS = {
    IS_NOT_INITIALIZED: -1,
    IS_CONNECTING: 0,
    IS_OPEN: 1,
    IS_CLOSING: 2,
    IS_CLOSED: 3
  };
  var defaultOpenOptions = {
    host: 'localhost',
    port: 41234,
    exclusive: false
  };
  var defaultSendOptions = {
    host: 'localhost',
    port: 41235
  };
  var defaultOptions$1 = {
    type: 'udp4',
    open: defaultOpenOptions,
    send: defaultSendOptions
  };
  function mergeOptions(base, custom) {
    return _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$1), base), custom), {}, {
      open: _objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$1.open), base.open), custom.open),
      send: _objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$1.send), base.send), custom.send)
    });
  }
  var DatagramPlugin = function () {
    function DatagramPlugin() {
      var _this = this;
      var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      _classCallCheck(this, DatagramPlugin);
      if (!dgram) {
        throw new Error('DatagramPlugin can not be used in browser context');
      }
      this.options = mergeOptions({}, customOptions);
      this.socket = dgram.createSocket(this.options.type);
      this.socketStatus = STATUS.IS_NOT_INITIALIZED;
      this.socket.on('message', function (message, rinfo) {
        _this.notify(message, rinfo);
      });
      this.socket.on('error', function (error) {
        _this.notify('error', error);
      });
      this.notify = function () {};
    }
    _createClass(DatagramPlugin, [{
      key: "registerNotify",
      value: function registerNotify(fn) {
        this.notify = fn;
      }
    }, {
      key: "status",
      value: function status() {
        return this.socketStatus;
      }
    }, {
      key: "open",
      value: function open() {
        var _this2 = this;
        var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var options = _objectSpread2(_objectSpread2({}, this.options.open), customOptions);
        var port = options.port,
            exclusive = options.exclusive;
        this.socketStatus = STATUS.IS_CONNECTING;
        this.socket.bind({
          address: options.host,
          port: port,
          exclusive: exclusive
        }, function () {
          _this2.socketStatus = STATUS.IS_OPEN;
          _this2.notify('open');
        });
      }
    }, {
      key: "close",
      value: function close() {
        var _this3 = this;
        this.socketStatus = STATUS.IS_CLOSING;
        this.socket.close(function () {
          _this3.socketStatus = STATUS.IS_CLOSED;
          _this3.notify('close');
        });
      }
    }, {
      key: "send",
      value: function send(binary) {
        var customOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        var options = _objectSpread2(_objectSpread2({}, this.options.send), customOptions);
        var port = options.port,
            host = options.host;
        this.socket.send(Buffer.from(binary), 0, binary.byteLength, port, host);
      }
    }]);
    return DatagramPlugin;
  }();

  var dgram$1 = typeof __dirname !== 'undefined' ? require('dgram') : undefined;
  var WebSocketServer = typeof __dirname !== 'undefined' ? require('isomorphic-ws').Server : undefined;
  var STATUS$1 = {
    IS_NOT_INITIALIZED: -1,
    IS_CONNECTING: 0,
    IS_OPEN: 1,
    IS_CLOSING: 2,
    IS_CLOSED: 3
  };
  var defaultOptions$2 = {
    udpServer: {
      host: 'localhost',
      port: 41234,
      exclusive: false
    },
    udpClient: {
      host: 'localhost',
      port: 41235
    },
    wsServer: {
      host: 'localhost',
      port: 8080
    },
    receiver: 'ws'
  };
  function mergeOptions$1(base, custom) {
    return _objectSpread2(_objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$2), base), custom), {}, {
      udpServer: _objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$2.udpServer), base.udpServer), custom.udpServer),
      udpClient: _objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$2.udpClient), base.udpClient), custom.udpClient),
      wsServer: _objectSpread2(_objectSpread2(_objectSpread2({}, defaultOptions$2.wsServer), base.wsServer), custom.wsServer)
    });
  }
  var BridgePlugin = function () {
    function BridgePlugin() {
      var _this = this;
      var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      _classCallCheck(this, BridgePlugin);
      if (!dgram$1 || !WebSocketServer) {
        throw new Error('BridgePlugin can not be used in browser context');
      }
      this.options = mergeOptions$1({}, customOptions);
      this.websocket = null;
      this.socket = dgram$1.createSocket('udp4');
      this.socketStatus = STATUS$1.IS_NOT_INITIALIZED;
      this.socket.on('message', function (message) {
        _this.send(message, {
          receiver: 'ws'
        });
        _this.notify(message.buffer);
      });
      this.socket.on('error', function (error) {
        _this.notify('error', error);
      });
      this.notify = function () {};
    }
    _createClass(BridgePlugin, [{
      key: "registerNotify",
      value: function registerNotify(fn) {
        this.notify = fn;
      }
    }, {
      key: "status",
      value: function status() {
        return this.socketStatus;
      }
    }, {
      key: "open",
      value: function open() {
        var _this2 = this;
        var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var options = mergeOptions$1(this.options, customOptions);
        this.socketStatus = STATUS$1.IS_CONNECTING;
        this.socket.bind({
          address: options.udpServer.host,
          port: options.udpServer.port,
          exclusive: options.udpServer.exclusive
        }, function () {
          _this2.websocket = new WebSocketServer({
            host: options.wsServer.host,
            port: options.wsServer.port
          });
          _this2.websocket.binaryType = 'arraybuffer';
          _this2.websocket.on('listening', function () {
            _this2.socketStatus = STATUS$1.IS_OPEN;
            _this2.notify('open');
          });
          _this2.websocket.on('error', function (error) {
            _this2.notify('error', error);
          });
          _this2.websocket.on('connection', function (client) {
            client.on('message', function (message, rinfo) {
              _this2.send(message, {
                receiver: 'udp'
              });
              _this2.notify(new Uint8Array(message), rinfo);
            });
          });
        });
      }
    }, {
      key: "close",
      value: function close() {
        var _this3 = this;
        this.socketStatus = STATUS$1.IS_CLOSING;
        this.socket.close(function () {
          _this3.websocket.close(function () {
            _this3.socketStatus = STATUS$1.IS_CLOSED;
            _this3.notify('close');
          });
        });
      }
    }, {
      key: "send",
      value: function send(binary) {
        var customOptions = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
        var options = mergeOptions$1(this.options, customOptions);
        var receiver = options.receiver;
        if (receiver === 'udp') {
          var data = binary instanceof Buffer ? binary : Buffer.from(binary);
          this.socket.send(data, 0, data.byteLength, options.udpClient.port, options.udpClient.host);
        } else if (receiver === 'ws') {
          this.websocket.clients.forEach(function (client) {
            client.send(binary, {
              binary: true
            });
          });
        } else {
          throw new Error('BridgePlugin can not send message to unknown receiver');
        }
      }
    }]);
    return BridgePlugin;
  }();

  var scope = typeof global === 'undefined' ? window : global;
  var WebSocket = typeof __dirname === 'undefined' ? scope.WebSocket : require('isomorphic-ws');
  var STATUS$2 = {
    IS_NOT_INITIALIZED: -1,
    IS_CONNECTING: 0,
    IS_OPEN: 1,
    IS_CLOSING: 2,
    IS_CLOSED: 3
  };
  var defaultOptions$3 = {
    host: 'localhost',
    port: 8080,
    secure: false
  };
  var WebsocketClientPlugin = function () {
    function WebsocketClientPlugin(customOptions) {
      _classCallCheck(this, WebsocketClientPlugin);
      if (!WebSocket) {
        throw new Error('WebsocketClientPlugin can\'t find a WebSocket class');
      }
      this.options = _objectSpread2(_objectSpread2({}, defaultOptions$3), customOptions);
      this.socket = null;
      this.socketStatus = STATUS$2.IS_NOT_INITIALIZED;
      this.notify = function () {};
    }
    _createClass(WebsocketClientPlugin, [{
      key: "registerNotify",
      value: function registerNotify(fn) {
        this.notify = fn;
      }
    }, {
      key: "status",
      value: function status() {
        return this.socketStatus;
      }
    }, {
      key: "open",
      value: function open() {
        var _this = this;
        var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var options = _objectSpread2(_objectSpread2({}, this.options), customOptions);
        var port = options.port,
            host = options.host,
            secure = options.secure;
        if (this.socket) {
          this.close();
        }
        var protocol = secure ? 'wss' : 'ws';
        var rinfo = {
          address: host,
          family: protocol,
          port: port,
          size: 0
        };
        this.socket = new WebSocket("".concat(protocol, "://").concat(host, ":").concat(port));
        this.socket.binaryType = 'arraybuffer';
        this.socketStatus = STATUS$2.IS_CONNECTING;
        this.socket.onopen = function () {
          _this.socketStatus = STATUS$2.IS_OPEN;
          _this.notify('open');
        };
        this.socket.onclose = function () {
          _this.socketStatus = STATUS$2.IS_CLOSED;
          _this.notify('close');
        };
        this.socket.onerror = function (error) {
          _this.notify('error', error);
        };
        this.socket.onmessage = function (message) {
          _this.notify(message.data, rinfo);
        };
      }
    }, {
      key: "close",
      value: function close() {
        this.socketStatus = STATUS$2.IS_CLOSING;
        this.socket.close();
      }
    }, {
      key: "send",
      value: function send(binary) {
        this.socket.send(binary);
      }
    }]);
    return WebsocketClientPlugin;
  }();

  var WebSocketServer$1 = typeof __dirname !== 'undefined' ? require('isomorphic-ws').Server : undefined;
  var STATUS$3 = {
    IS_NOT_INITIALIZED: -1,
    IS_CONNECTING: 0,
    IS_OPEN: 1,
    IS_CLOSING: 2,
    IS_CLOSED: 3
  };
  var defaultOptions$4 = {
    host: 'localhost',
    port: 8080
  };
  var WebsocketServerPlugin = function () {
    function WebsocketServerPlugin(customOptions) {
      _classCallCheck(this, WebsocketServerPlugin);
      if (!WebSocketServer$1) {
        throw new Error('WebsocketServerPlugin can not be used in browser context');
      }
      this.options = _objectSpread2(_objectSpread2({}, defaultOptions$4), customOptions);
      this.socket = null;
      this.socketStatus = STATUS$3.IS_NOT_INITIALIZED;
      this.notify = function () {};
    }
    _createClass(WebsocketServerPlugin, [{
      key: "registerNotify",
      value: function registerNotify(fn) {
        this.notify = fn;
      }
    }, {
      key: "status",
      value: function status() {
        return this.socketStatus;
      }
    }, {
      key: "open",
      value: function open() {
        var _this = this;
        var customOptions = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
        var options = _objectSpread2(_objectSpread2({}, this.options), customOptions);
        var port = options.port,
            host = options.host;
        var rinfo = {
          address: host,
          family: 'wsserver',
          port: port,
          size: 0
        };
        if (this.socket) {
          this.close();
        }
        this.socket = new WebSocketServer$1({
          host: host,
          port: port
        });
        this.socket.binaryType = 'arraybuffer';
        this.socketStatus = STATUS$3.IS_CONNECTING;
        this.socket.on('listening', function () {
          _this.socketStatus = STATUS$3.IS_OPEN;
          _this.notify('open');
        });
        this.socket.on('error', function (error) {
          _this.notify('error', error);
        });
        this.socket.on('connection', function (client) {
          client.on('message', function (message) {
            _this.notify(new Uint8Array(message), rinfo);
          });
        });
      }
    }, {
      key: "close",
      value: function close() {
        var _this2 = this;
        this.socketStatus = STATUS$3.IS_CLOSING;
        this.socket.close(function () {
          _this2.socketStatus = STATUS$3.IS_CLOSED;
          _this2.notify('close');
        });
      }
    }, {
      key: "send",
      value: function send(binary) {
        this.socket.clients.forEach(function (client) {
          client.send(binary, {
            binary: true
          });
        });
      }
    }]);
    return WebsocketServerPlugin;
  }();

  var defaultOptions$5 = {
    discardLateMessages: false,
    plugin: new WebsocketClientPlugin()
  };
  var STATUS$4 = {
    IS_NOT_INITIALIZED: -1,
    IS_CONNECTING: 0,
    IS_OPEN: 1,
    IS_CLOSING: 2,
    IS_CLOSED: 3
  };
  var OSC = function () {
    function OSC(options) {
      _classCallCheck(this, OSC);
      if (options && !isObject(options)) {
        throw new Error('OSC options argument has to be an object.');
      }
      this.options = _objectSpread2(_objectSpread2({}, defaultOptions$5), options);
      this.eventHandler = new EventHandler({
        discardLateMessages: this.options.discardLateMessages
      });
      var eventHandler = this.eventHandler;
      if (this.options.plugin && this.options.plugin.registerNotify) {
        this.options.plugin.registerNotify(function () {
          return eventHandler.notify.apply(eventHandler, arguments);
        });
      }
    }
    _createClass(OSC, [{
      key: "on",
      value: function on(eventName, callback) {
        if (!(isString(eventName) && isFunction(callback))) {
          throw new Error('OSC on() needs event- or address string and callback function');
        }
        return this.eventHandler.on(eventName, callback);
      }
    }, {
      key: "off",
      value: function off(eventName, subscriptionId) {
        if (!(isString(eventName) && isInt(subscriptionId))) {
          throw new Error('OSC off() needs string and number (subscriptionId) to unsubscribe');
        }
        return this.eventHandler.off(eventName, subscriptionId);
      }
    }, {
      key: "open",
      value: function open(options) {
        if (options && !isObject(options)) {
          throw new Error('OSC open() options argument needs to be an object');
        }
        if (!(this.options.plugin && isFunction(this.options.plugin.open))) {
          throw new Error('OSC Plugin API #open is not implemented!');
        }
        return this.options.plugin.open(options);
      }
    }, {
      key: "status",
      value: function status() {
        if (!(this.options.plugin && isFunction(this.options.plugin.status))) {
          throw new Error('OSC Plugin API #status is not implemented!');
        }
        return this.options.plugin.status();
      }
    }, {
      key: "close",
      value: function close() {
        if (!(this.options.plugin && isFunction(this.options.plugin.close))) {
          throw new Error('OSC Plugin API #close is not implemented!');
        }
        return this.options.plugin.close();
      }
    }, {
      key: "send",
      value: function send(packet, options) {
        if (!(this.options.plugin && isFunction(this.options.plugin.send))) {
          throw new Error('OSC Plugin API #send is not implemented!');
        }
        if (!(packet instanceof Message || packet instanceof Bundle || packet instanceof Packet)) {
          throw new Error('OSC send() needs Messages, Bundles or Packets');
        }
        if (options && !isObject(options)) {
          throw new Error('OSC send() options argument has to be an object');
        }
        return this.options.plugin.send(packet.pack(), options);
      }
    }]);
    return OSC;
  }();
  OSC.STATUS = STATUS$4;
  OSC.Packet = Packet;
  OSC.Bundle = Bundle;
  OSC.Message = Message;
  OSC.DatagramPlugin = DatagramPlugin;
  OSC.WebsocketClientPlugin = WebsocketClientPlugin;
  OSC.WebsocketServerPlugin = WebsocketServerPlugin;
  OSC.BridgePlugin = BridgePlugin;

  return OSC;

})));

}).call(this)}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {},require("buffer").Buffer,"/node_modules/osc-js/lib")
},{"buffer":3,"dgram":1,"isomorphic-ws":6}]},{},[5]);
