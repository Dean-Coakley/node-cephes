
const fs = require('fs');
const path = require('path');

//
// setup memory
//
const TOTAL_STACK = 1024 * 1024; // 1MB
const TOTAL_MEMORY = 1024 * 1024; // 1MB
const WASM_PAGE_SIZE = 64 * 1024; // Defined in WebAssembly specs

// Initialize the runtime's memory
const wasmMemory = new WebAssembly.Memory({
  'initial': TOTAL_MEMORY / WASM_PAGE_SIZE,
  'maximum': TOTAL_MEMORY / WASM_PAGE_SIZE
});

const HEAP8 = new Int8Array(wasmMemory.buffer);
const HEAP16 = new Int16Array(wasmMemory.buffer);
const HEAP32 = new Int32Array(wasmMemory.buffer);
const HEAPF32 = new Float32Array(wasmMemory.buffer);
const HEAPF64 = new Float64Array(wasmMemory.buffer);

// Define stack to start at 16
const STACK_BASE = 16;
const STACK_MAX = STACK_BASE + TOTAL_STACK;

// Define the dynamic top to start at STACK_MAX
const DYNAMICTOP_PTR = 0;
HEAP32[DYNAMICTOP_PTR>>2] = STACK_MAX;

//
// define WASM imports
//
function AsciiToString(ptr) {
  let str = '';
  while (1) {
    const ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

function _mtherr(name /* char* */, code /* int */) {
  // from mtherr.c
  const mtherr_codemsg = new Map([
    [0, 'unknown error'],
    [1, 'argument domain error'],
    [2, 'function singularity'],
    [3, 'overflow range error'],
    [4, 'underflow range error'],
    [5, 'total loss of precision'],
    [6, 'partial loss of precision'],
    [33, 'Unix domain error code'],
    [34, 'Unix range error code']
  ]);

  const fnname = AsciiToString(name);
  const codemsg = mtherr_codemsg.get(code);
  const message = 'cephes reports "' + codemsg + '" in ' + fnname;
  if (code == 1) {
    throw new RangeError(message);
  } else {
    throw new Error(message);
  }
}

function makeDeadFunction(name) {
  return function () {
    throw new Error(msg + ' should never be called, arguments: ' + JSON.stringify(arguments));
  }
}

const wasmImports = {
  'env': {
    // dead functions
    enlargeMemory: makeDeadFunction('enlargeMemory'),
    getTotalMemory: makeDeadFunction('getTotalMemory'),
    abortOnCannotGrowMemory: makeDeadFunction('abortOnCannotGrowMemory'),
    ___setErrNo: makeDeadFunction('___setErrNo'),
    _abort: makeDeadFunction('_abort'),
    ___errno_location: makeDeadFunction('___errno_location'),

    // cephes error handler
    "_mtherr": _mtherr,

    // memory
    "memory": wasmMemory,
    "DYNAMICTOP_PTR": DYNAMICTOP_PTR,
    "STACKTOP": STACK_BASE,
    "STACK_MAX": STACK_MAX
  }
};

//
// read and compile program
//
const wasmFileContent = fs.readFileSync(path.join(__dirname, 'cephes.wasm'));
const program = new WebAssembly.Instance(
  new WebAssembly.Module(wasmFileContent),
  wasmImports
);

//
// export
//

// export cephes functions
for (const key of Object.keys(program.exports)) {
  if (key.startsWith('_cephes_')) {
    exports[key] = program.exports[key];
  }
}

// export special stack functions
exports.stackAlloc = program.exports.stackAlloc;
exports.stackRestore = program.exports.stackRestore;
exports.stackSave = program.exports.stackSave;

// export helper functions
exports.getValue = function getValue(ptr, type) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: throw new Error('invalid type for getValue: ' + type);
    }
  return null;
};

exports.writeArrayToMemory = function writeArrayToMemory(array, buffer) {
  HEAP8.set(array, buffer);
};