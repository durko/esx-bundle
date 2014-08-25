var fs = require("fs"),
    path = require("path"),
    esprima = require("esprima");

var uAMD = esprima.parse(fs.readFileSync(path.join(__dirname, "uAMD.js")));



function BundlerError(message) {
    this.message = message || "An error occured in bundler";
}
BundlerError.prototype = new Error();
BundlerError.prototype.constructor = BundlerError;
BundlerError.prototype.name = "BundlerError";



function createLiteral(value) {
    return { type: "Literal", value: value, raw: "\""+value+"\"" };
}

function createIdentifier(name) {
    return { type: "Identifier", name: name };
}

function entryPoint(main) {
    return {
        type: "ExpressionStatement",
        expression: {
            type: "CallExpression",
            callee: createIdentifier("require"),
            arguments: [{
                type: "ArrayExpression",
                elements: [ createLiteral(main) ]
            }]
        }
    };
}

function deps(ast) {
    return ast.body[0].expression.arguments[1].elements.map(function(d) {
        return d.value;
    }).filter(function(value) {
        return value !== "exports";
    });
}

function isDefine(node) {
    return node &&
        node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        node.expression.callee.name === "define";
}

function findDefine(node) {
    while (node &&
        node.type === "ExpressionStatement" &&
        node.expression.type === "CallExpression" &&
        node.expression.callee.type === "FunctionExpression" ) {

        return node.expression.callee.body[0];
    }

    return node;
}


function Bundler(options) {
    options = options || {};

    this.state = options.state || {};

    this.state.files = this.state.files || {};
    this.state.packages = this.state.packages || [];
    this.state.namemap = this.state.namemap || {};

    this.out = options.out || "main-built.js";
    var parts = (options.main || "main.js").split("/");
    this.main = parts.pop().replace(/\.js$/, "");
    this.baseUrl = parts.join("/");

    this.loader = uAMD;
    this.entryPoint = entryPoint(this.main);
}

Bundler.prototype.setPackages = function(packages) {
    this.state.packages = packages;

    var k, v;
    for (k in packages) {
        v = packages[k];
        this.state.namemap[path.join(v.name, v.main)] = v.name;
    }
};

Bundler.prototype.setSourceFile = function(name, ast) {
    var depname, modname, pkg, i, defineArgs, dir, fullname;

    // find define call
    ast.body = [ findDefine(ast.body[0]) ];
    if (!isDefine(ast.body[0])) {
        return;
    }

    // figure out modname
    modname = path.relative(this.baseUrl, name).replace(/\.js$/, "");

    // replace package path by package name
    for (i=0; i<this.state.packages.length; i++) {
        pkg = this.state.packages[i];
        if (new RegExp("^"+pkg.location+"/").test(modname)) {
            modname = pkg.name + modname.slice(pkg.location.length);
            break;
        }
    }

    if (this.state.namemap[modname]) {
        modname = this.state.namemap[modname];
    }

    // set module name
    defineArgs = ast.body[0].expression.arguments;
    if (defineArgs && defineArgs[0].type !== "Literal") {
        defineArgs.unshift(createLiteral(modname));
    } else {
        modname = defineArgs[0].value;
    }

    // make module names absolute
    for (i=0; i<ast.body[0].expression.arguments[1].elements.length; i++) {
        depname = ast.body[0].expression.arguments[1].elements[i].value;

        if (depname[0] === ".") {
            dir = path.dirname(name);
            fullname = path.relative(
                this.baseUrl,
                path.normalize(path.join(dir, depname))
            );

            ast.body[0].expression.arguments[1].elements[i].value = fullname;
        }
    }

    this.state.files[modname] = ast;
};

Bundler.prototype.pkglist = function() {
    var files = this.state.files,
        mods = [],
        todo = [ this.main ],
        next, i, j, deplist;

    while(true) {
        next = [];
        for (i=0; i<todo.length; i++) {
            if (~mods.indexOf(todo[i])) {
                continue;
            }

            if (!files[todo[i]]) {
                throw new BundlerError("The main module `" + todo[i] +
                    "` was not added to the bundler.");
            }

            mods.unshift(todo[i]);
            deplist = deps(files[todo[i]]);

            for (j=0; j<deplist.length; j++) {
                if (files[deplist[j]]) {
                    next.push(deplist[j]);
                } else {
                    throw new BundlerError("Package " + deplist[j] +
                        " is required, but missing.");
                }
            }

        }

        if (!next.length) {
            break;
        }

        todo = next;
    }
    return mods.sort();
};

Bundler.prototype.order = function(mods) {
    var ordered = [],
        i, resolved;

    var inOrdered = function (dep) {
        return ~ordered.indexOf(dep);
    };

    while (mods.length !== ordered.length) {
        for (i=0; i<mods.length; i++) {
            if (~ordered.indexOf(mods[i])) {
                continue;
            }

            resolved = deps(this.state.files[mods[i]]).every(inOrdered);

            if (resolved) {
                ordered.push(mods[i]);
            }
        }
    }
    return ordered;
};

Bundler.prototype.catast = function(mods) {
    var i;
    var ast = {
        type: "Program",
        body: [],
        comments: []
    };

    ast.body = ast.body.concat(this.loader.body);

    for (i=0; i<mods.length; i++) {
        ast.body = ast.body.concat(this.state.files[mods[i]].body);
    }

    ast.body = ast.body.concat(this.entryPoint);
    return ast;
};

Bundler.prototype.bundle = function() {
    var mods = this.pkglist();
    return this.catast(mods);
};

module.exports.Bundler = Bundler;
