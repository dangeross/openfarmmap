window.iD = function () {
    window.locale.en = iD.data.en;
    window.locale.current('en');

    var context = {},
        storage;

    // https://github.com/systemed/iD/issues/772
    // http://mathiasbynens.be/notes/localstorage-pattern#comment-9
    try { storage = localStorage; } catch (e) {}
    storage = storage || {};

    context.storage = function(k, v) {
        if (arguments.length === 1) return storage[k];
        else if (v === null) delete storage[k];
        else storage[k] = v;
    };

    var history = iD.History(context),
        dispatch = d3.dispatch('enter', 'exit', 'toggleFullscreen'),
        mode,
        container,
        ui = iD.ui(context),
        map = iD.Map(context),
        connection = iD.Connection(),
        locale = iD.detect().locale,
        localePath;

    if (locale && iD.data.locales.indexOf(locale) === -1) {
        locale = locale.split('-')[0];
    }

    connection.on('load.context', function loadContext(err, result) {
        history.merge(result.data, result.extent);
    });

    context.preauth = function(options) {
        connection.switch(options);
        return context;
    };

    context.locale = function(_, path) {
        locale = _;
        localePath = path;
        return context;
    };

    context.loadLocale = function(cb) {
        if (locale && locale !== 'en' && iD.data.locales.indexOf(locale) !== -1) {
            localePath = localePath || context.assetPath() + 'locales/' + locale + '.json';
            d3.json(localePath, function(err, result) {
                window.locale[locale] = result;
                window.locale.current(locale);
                cb();
            });
        } else {
            cb();
        }
    };

    /* Straight accessors. Avoid using these if you can. */
    context.ui = function() { return ui; };
    context.connection = function() { return connection; };
    context.history = function() { return history; };
    context.map = function() { return map; };

    /* History */
    context.graph = history.graph;
    context.perform = history.perform;
    context.replace = history.replace;
    context.pop = history.pop;
    context.undo = history.undo;
    context.redo = history.redo;
    context.changes = history.changes;
    context.intersects = history.intersects;

    context.flush = function() {
        history.reset();
        connection.flush();
        map.redraw();
        return context;
    };

    /* Graph */
    context.hasEntity = function(id) {
        return history.graph().hasEntity(id);
    };

    context.entity = function(id) {
        return history.graph().entity(id);
    };

    context.childNodes = function(way) {
        return history.graph().childNodes(way);
    };

    context.geometry = function(id) {
        return context.entity(id).geometry(history.graph());
    };

    /* Modes */
    context.enter = function(newMode) {
        if (mode) {
            mode.exit();
            dispatch.exit(mode);
        }

        mode = newMode;
        mode.enter();
        dispatch.enter(mode);
    };

    context.mode = function() {
        return mode;
    };

    context.selectedIDs = function() {
        if (mode && mode.selectedIDs) {
            return mode.selectedIDs();
        } else {
            return [];
        }
    };

    /* Behaviors */
    context.install = function(behavior) {
        context.surface().call(behavior);
    };

    context.uninstall = function(behavior) {
        context.surface().call(behavior.off);
    };

    /* Map */
    context.layers = function() { return map.layers; };
    context.background = function() { return map.layers[0]; };
    context.surface = function() { return map.surface; };
    context.mouse = map.mouse;
    context.projection = map.projection;
    context.extent = map.extent;
    context.redraw = map.redraw;
    context.pan = map.pan;
    context.zoomIn = map.zoomIn;
    context.zoomOut = map.zoomOut;

    /* Background */
    var backgroundSources = iD.data.imagery.map(function(source) {
        if (source.sourcetag === 'Bing') {
            return iD.BackgroundSource.Bing(source, context.background().dispatch);
        } else {
            return iD.BackgroundSource.template(source);
        }
    });
    backgroundSources.push(iD.BackgroundSource.Custom);

    context.backgroundSources = function() {
        return backgroundSources;
    };

    /* Presets */
    var presets = iD.presets()
        .load(iD.data.presets);

    context.presets = function() {
        return presets;
    };

    context.container = function(_) {
        if (!arguments.length) return container;
        container = _;
        container.classed('id-container', true);
        return context;
    };

    var q = iD.util.stringQs(location.hash.substring(1)),
        detected = false,
        background = q.background || q.layer;

    if (background && background.indexOf('custom:') === 0) {
        context.layers()[0]
           .source(iD.BackgroundSource.template({
                template: background.replace(/^custom:/, ''),
                name: 'Custom'
            }));
        detected = true;
    } else if (background) {
        context.layers()[0]
           .source(_.find(backgroundSources, function(l) {
               if (l.data.sourcetag === background) {
                   detected = true;
                   return true;
               }
           }));
    }

    if (!detected) {
        context.background()
            .source(_.find(backgroundSources, function(l) {
                return l.data.name === 'Bing aerial imagery';
            }));
    }

    var embed = false;
    context.embed = function(_) {
        if (!arguments.length) return embed;
        embed = _;
        return context;
    };

    var assetPath = '';
    context.assetPath = function(_) {
        if (!arguments.length) return assetPath;
        assetPath = _;
        return context;
    };

    context.imagePath = function(_) {
        return assetPath + 'img/' + _;
    };

    context.toggleFullscreen = function() {
        dispatch.toggleFullscreen();
    };

    return d3.rebind(context, dispatch, 'on');
};

iD.version = '1.1.0beta1';

(function() {
    var detected = {};

    var ua = navigator.userAgent,
        msie = new RegExp("MSIE ([0-9]{1,}[\\.0-9]{0,})");

    if (msie.exec(ua) !== null) {
        var rv = parseFloat(RegExp.$1);
        detected.support = !(rv && rv < 9);
    } else {
        detected.support = true;
    }

    // Added due to incomplete svg style support. See #715
    detected.opera = ua.indexOf('Opera') >= 0;

    detected.locale = navigator.language || navigator.userLanguage;

    detected.filedrop = (window.FileReader && 'ondrop' in window);

    function nav(x) {
        return navigator.userAgent.indexOf(x) !== -1;
    }

    if (nav('Win')) detected.os = 'win';
    else if (nav('Mac')) detected.os = 'mac';
    else if (nav('X11')) detected.os = 'linux';
    else if (nav('Linux')) detected.os = 'linux';
    else detected.os = 'win';

    iD.detect = function() { return detected; };
})();
