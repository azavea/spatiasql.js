$(function () {

// modified example from sql.js
var id = 1;
var start = Date.now();
var layer = null;
var worker = new Worker("js/spatiasql.worker.js");
var textarea = $('#code');
var time = $('#time');
var pre = $('#res');
var runBtn = $('#run');
var clearBtn = $('#clear');
var input = $('input[type=file]');
var editor = CodeMirror.fromTextArea(textarea.get(0), {
    mode: 'text/x-sql',
    keyMap: 'sublime'
});
var map = new L.Map('map');
map.setView([49.8, 7.8], 9);
L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors',
    maxZoom: 18
}).addTo(map);

runBtn.prop('disabled', true);
input.prop('disabled', true);

var xhr = new XMLHttpRequest();
xhr.open('GET', 'test-2.3.sqlite', true);
xhr.responseType = 'arraybuffer';
xhr.onload = function(e) {
    var uInt8Array = new Uint8Array(this.response);
    worker.postMessage({
        id: id,
        action: 'open',
        buffer: uInt8Array
    });
};
xhr.send();

runBtn.on('click', function () {
    var sql = editor.getValue();
    if (sql.length > 0) {
    runBtn.prop('disabled', true);
    runBtn.html('...running...');
    id++;
    start = Date.now();
    worker.postMessage({
        id: id,
        action: 'exec',
        sql: sql
    });
    }
});

clearBtn.on('click', function () {
    pre.html('');
    if (layer)
    map.removeLayer(layer);
});

input.on('change', function () {
    var file = input.get(0).files.item(0);
    if (file) {
    var reader = new FileReader();
    runBtn.prop('disabled', true);
    input.prop('disabled', true);
    runBtn.html('...loading...');
    reader.onload = function () {
        pre.html('');
        id = 1;
        worker.postMessage({
        id: id,
        action: 'open',
        buffer: new Uint8Array(reader.result)
        });
        id++
        worker.postMessage({
            id: id,
            action: 'exec',
            sql: 'SELECT name FROM sqlite_master WHERE type="table"'
        });
    }
    reader.readAsArrayBuffer(file);
    }
});

worker.onmessage = function (event) {
    if (event.data.id > 1) {
    time.html(((Date.now() - start) / 1000).toFixed(3) + ' sec');
    findAndDrawGeoJSON(event.data.results);
    pre.prepend('\n');
    pre.prepend((typeof event.data === 'string' ? event.data : (
        event.data.results ? JSON.stringify(event.data.results, null, 2) : JSON.stringify(event.data, null, 2)
        )
    ));
    runBtn.prop('disabled', false);
    input.prop('disabled', false);
    runBtn.html('run');
    } else {
    id++
    worker.postMessage({
        id: id,
        action: 'exec',
        sql: 'SELECT sqlite_version(), spatialite_version(), proj4_version(), geos_version()'
    });
    }
};

worker.onerror = function (event) {
    pre.prepend('\n');
    pre.prepend('Error: ' + event.message);
    runBtn.prop('disabled', false);
    runBtn.html('run');
};

function findAndDrawGeoJSON (res) {

    if (Array.isArray(res)) {

    var features = [];

    for (var q = 0, qs = res.length; q < qs; q++) {

        var cols = res[q].columns
        , rows = res[q].values
        ;

        if (res[q].columns.length == 0)
        continue;

        for (var c = 0, cs = cols.length; c < cs; c++) {
        if (cols[c].toLowerCase() === 'geojson') {
            for (var r = 0, rs = rows.length; r < rs; r++) {
            try {
                var geojson = JSON.parse(rows[r][c]);
                var feature = {
                type: 'Feature',
                properties: {},
                geometry: geojson
                };
                rows[r].forEach(function (data, index) {
                if (index !== c) {
                    if (typeof data === 'number')
                    feature.properties[cols[index]] = data.toFixed(2);
                    else if (typeof data === 'string')
                    feature.properties[cols[index]] = (data.length > 20 ? data.substr(0, 20) + '..' : data);
                }
                });
                rows[r][c] = geojson; // nicer to render in pre
                if (feature.geometry)
                features.push(feature);
            } catch (e) {
                console.log(e);
                pre.prepend('Error: ' + e.message + '\n');
            }
            }
        }
        }

    }

    if (features.length > 0) {
        if (layer)
        map.removeLayer(layer);
        layer = L.geoJson(features, {
        onEachFeature: function onEachFeature(feature, layer) {
            layer.bindPopup(JSON.stringify(feature.properties, null, 2));
        }
        });
        layer.addTo(map);
        map.fitBounds(layer.getBounds());
        // if (features[0].geometry.bbox) {
        //   map.fitBounds([
        //     [features[0].geometry.bbox[1], features[0].geometry.bbox[0]],
        //     [features[0].geometry.bbox[3], features[0].geometry.bbox[2]]
        //   ]);
        // }
    }

    }
}

});
