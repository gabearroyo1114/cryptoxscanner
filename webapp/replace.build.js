var replace = require('replace-in-file');

var uiVersion = process.argv[2];
var protoVersion = process.argv[3];

var files = [
    "./src/environments/environment.ts",
    "./src/environments/environment.prod.ts",
];

var buildNumberOptions = {
    files: files,
    from: /buildNumber: \d+/g,
    to: "buildNumber: " + uiVersion,
    allowEmptyPaths: false
};

var uiVersionOptions = {
    files: files,
    from: /uiVersion: \d+/g,
    to: "uiVersion: " + uiVersion,
    allowEmptyPaths: false
};

var protoVersionOptions = {
    files: files,
    from: /protoVersion: \d+/g,
    to: "protoVersion: " + protoVersion,
    allowEmptyPaths: false
};

try {
    replace.sync(buildNumberOptions);
    replace.sync(uiVersionOptions);
    replace.sync(protoVersionOptions);
    console.log('UI version set to: ' + uiVersion);
    console.log('Proto version set to: ' + protoVersion);
}
catch (error) {
    console.error('Error occurred:', error);
}
