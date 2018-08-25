
const stream = require('stream');
const split2 = require('split2');
const pumpify = require('pumpify');

var SPLIT_COMMENT = /^\/\* cephes\/([a-z0-9]+)\.c \*\/$/;
var SPLIT_PROTO = /^(double|int) cephes_([a-z0-9]+)\(([A-Za-z0-9_ ,*\[\]]+)\);$/;
var SPLIT_ARG = /^(double|int) (\*)?(?:cephes_)?([A-Za-z0-9]+)(\[\])?$/;

class ProtoParser extends stream.Transform {
  constructor() {
    super({ objectMode: true });

    this._currentFilename = '';
  }

  _parseFilename(comment) {
    const [, filename ] = comment.match(SPLIT_COMMENT);
    this._currentFilename = filename;
  }

  _parseProto(proto) {
    const [
      , returnType, functionName, functionArgsStr
    ] = proto.match(SPLIT_PROTO);

    const functionArgs = functionArgsStr.split(/, ?/).map(function (arg) {
      const [, mainType, pointer, name, array] = arg.match(SPLIT_ARG);
      return {
        type: mainType,
        isPointer: pointer === '*',
        name: name,
        isArray: array === '[]',
        fullType: `${mainType}${pointer || ''}${array || ''}`
      };
    });

    this.push({
      returnType,
      functionName,
      functionArgs,
      filename: this._currentFilename
    });
  }

  _transform(line, encoding, done) {
    if (line.startsWith('/*')) {
      this._parseFilename(line);
    } else {
      this._parseProto(line);
    }

    done(null);
  }
}

function parser() {
  return pumpify.obj(
    split2(),
    new ProtoParser()
  );
}

module.exports = parser;
