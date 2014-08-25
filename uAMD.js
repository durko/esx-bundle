var _uAMD_m = {}, _uAMD_r = {};

var define = function(name, deps, func) {
    _uAMD_m[name] = [ deps, func ];
};

var require = function(name) {
    if (!_uAMD_m[name]) {
        throw new Error("Module \"" +name+ "\" required, but does not exist.");
    }
    if (!_uAMD_r[name]) {
        _uAMD_r[name] = {};
        var ref, i, len, d, deps=[];
        for (i=0, ref=_uAMD_m[name][0], len=ref.length; i<len; i++) {
            deps[i] = ((d=ref[i])==="exports") ? _uAMD_r[name] : require(d);
        }
        _uAMD_m[name][1].apply(this.global||this, deps);
    }
    return _uAMD_r[name];
};
