/* globals describe, it */
var assert = require("assert"),
    vm = require("vm");

var recast = require("recast");

var Bundler = require("..").Bundler;

function run(mods) {
    var b = new Bundler(),
        k, v;

    for (k in mods) {
        v = mods[k];
        b.setSourceFile(k, recast.parse(v).program);
    }

    var init = {
        assert:assert,
        console:console
    };
    init.global = init;

    var ctx = vm.createContext(init);

    vm.runInContext(recast.print(b.bundle()).code, ctx);

    return ctx;
}

describe("bundler", function() {
    it('should throw error without main module', function() {
        var b = new Bundler();
        assert.throws(function() {
            b.bundle();
        }, function(err) {
            assert.equal(err.name, "BundlerError");
            return true;
        });
    });

    it('should add uAMD to bundle', function() {
        var mods = {
            "main.js": "define([], function() {});"
        };
        var ctx = run(mods);
        assert.ok(ctx.define);
        assert.ok(ctx.require);
        assert.ok(ctx._uAMD_r);
        assert.ok(ctx._uAMD_m);
    });

    it('should execute the main module', function() {
        var mods = {
            "main.js": "define([], function() { this.foo = 42; });"
        };
        var ctx = run(mods);
        assert.equal(ctx.foo, 42);
    });

    it('should fail if dependency is missing', function() {
        var mods = {
            "main.js": "define(['bar'], function() {});"
        };
        assert.throws(function() {
            run(mods);
        }, function(err) {
            assert.equal(err.name, "BundlerError");
            return true;
        });
    });

    it('should execute imported modules', function() {
        var mods = {
            "main.js": "define(['foo'], function() {});",
            "foo.js": "define([], function() { this.foo = 42; });"
        };
        var ctx = run(mods);
        assert.equal(ctx.foo, 42);
    });

    it('should execute imported modules of imported modules', function() {
        var mods = {
            "main.js": "define(['foo'], function() {});",
            "foo.js": "define(['bar'], function() { this.foo = 'hello'; });",
            "bar.js": "define([], function() { this.bar = 'world'; });"
        };
        var ctx = run(mods);
        assert.equal(ctx.foo, "hello");
        assert.equal(ctx.bar, "world");
    });

    it('should support cyclic dependencies', function() {
        var mods = {
            "main.js": "define(['foo'], function() {});",
            "foo.js": "define(['bar','exports'], function(bar, exports) { " +
                "exports.out = bar.out+'foo'; });",
            "bar.js": "define(['foo','exports'], function(foo, exports) { " +
                " exports.out = foo.out+'bar'; });"
        };
        var ctx = run(mods);
        assert.equal(ctx._uAMD_r.foo.out, "undefinedbarfoo");
        assert.equal(ctx._uAMD_r.bar.out, "undefinedbar");
    });

    it('should use correct module resolution order', function() {
        var mods = {
            "main.js": "define(['bar'], function() {});",
            "foo.js": "define(['bar','exports'], function(bar, exports) { " +
                "exports.out = bar.out+'foo'; });",
            "bar.js": "define(['foo','exports'], function(foo, exports) { " +
                "exports.out = foo.out+'bar'; });"
        };
        var ctx = run(mods);
        assert.equal(ctx._uAMD_r.foo.out, "undefinedfoo");
        assert.equal(ctx._uAMD_r.bar.out, "undefinedfoobar");
    });
});
