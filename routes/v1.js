var Router = require('express').Router;

/** ----------------------- sanitizers ----------------------- **/
var sanitizers = {
  autocomplete: require('../sanitizer/autocomplete'),
  place: require('../sanitizer/place'),
  search: require('../sanitizer/search'),
  search_fallback: require('../sanitizer/search_fallback'),
  structured_geocoding: require('../sanitizer/structured_geocoding'),
  reverse: require('../sanitizer/reverse'),
  nearby: require('../sanitizer/nearby')
};

/** ----------------------- middleware ------------------------ **/
var middleware = {
  calcSize: require('../middleware/sizeCalculator')
};

/** ----------------------- controllers ----------------------- **/

var controllers = {
  mdToHTML: require('../controller/markdownToHtml'),
  place: require('../controller/place'),
  search: require('../controller/search'),
  status: require('../controller/status')
};

var queries = {
  libpostal: require('../query/search'),
  fallback_to_old_prod: require('../query/search_original'),
  structured_geocoding: require('../query/structured_geocoding'),
  reverse: require('../query/reverse'),
  autocomplete: require('../query/autocomplete')
};

/** ----------------------- controllers ----------------------- **/

var postProc = {
  trimByGranularity: require('../middleware/trimByGranularity'),
  trimByGranularityStructured: require('../middleware/trimByGranularityStructured'),
  distances: require('../middleware/distance'),
  confidenceScores: require('../middleware/confidenceScore'),
  confidenceScoresFallback: require('../middleware/confidenceScoreFallback'),
  confidenceScoresReverse: require('../middleware/confidenceScoreReverse'),
  accuracy: require('../middleware/accuracy'),
  dedupe: require('../middleware/dedupe'),
  localNamingConventions: require('../middleware/localNamingConventions'),
  renamePlacenames: require('../middleware/renamePlacenames'),
  geocodeJSON: require('../middleware/geocodeJSON'),
  sendJSON: require('../middleware/sendJSON'),
  parseBoundingBox: require('../middleware/parseBBox'),
  normalizeParentIds: require('../middleware/normalizeParentIds'),
  assignLabels: require('../middleware/assignLabels')
};

/**
 * Append routes to app
 *
 * @param {object} app
 * @param {object} peliasConfig
 */
function addRoutes(app, peliasConfig) {
  const esclient = require('elasticsearch').Client(peliasConfig.esclient);

  var base = '/v1/';

  /** ------------------------- routers ------------------------- **/

  var routers = {
    index: createRouter([
      controllers.mdToHTML(peliasConfig.api, './public/apiDoc.md')
    ]),
    attribution: createRouter([
      controllers.mdToHTML(peliasConfig.api, './public/attribution.md')
    ]),
    search: createRouter([
      sanitizers.search.middleware,
      middleware.calcSize(),
      // 3rd parameter is which query module to use, use fallback/geodisambiguation
      //  first, then use original search strategy if first query didn't return anything
      controllers.search(peliasConfig.api, esclient, queries.libpostal),
      sanitizers.search_fallback.middleware,
      controllers.search(peliasConfig.api, esclient, queries.fallback_to_old_prod),
      postProc.trimByGranularity(),
      postProc.distances('focus.point.'),
      postProc.confidenceScores(peliasConfig.api),
      postProc.confidenceScoresFallback(),
      postProc.dedupe(),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    structured: createRouter([
      sanitizers.structured_geocoding.middleware,
      middleware.calcSize(),
      controllers.search(peliasConfig.api, esclient, queries.structured_geocoding),
      postProc.trimByGranularityStructured(),
      postProc.distances('focus.point.'),
      postProc.confidenceScores(peliasConfig.api),
      postProc.confidenceScoresFallback(),
      postProc.dedupe(),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    autocomplete: createRouter([
      sanitizers.autocomplete.middleware,
      controllers.search(peliasConfig.api, esclient, queries.autocomplete),
      postProc.distances('focus.point.'),
      postProc.confidenceScores(peliasConfig.api),
      postProc.dedupe(),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    reverse: createRouter([
      sanitizers.reverse.middleware,
      middleware.calcSize(),
      controllers.search(peliasConfig.api, esclient, queries.reverse),
      postProc.distances('point.'),
      // reverse confidence scoring depends on distance from origin
      //  so it must be calculated first
      postProc.confidenceScoresReverse(),
      postProc.dedupe(),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    nearby: createRouter([
      sanitizers.nearby.middleware,
      middleware.calcSize(),
      controllers.search(peliasConfig.api, esclient, queries.reverse),
      postProc.distances('point.'),
      // reverse confidence scoring depends on distance from origin
      //  so it must be calculated first
      postProc.confidenceScoresReverse(),
      postProc.dedupe(),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    place: createRouter([
      sanitizers.place.middleware,
      controllers.place(peliasConfig.api, esclient),
      postProc.accuracy(),
      postProc.localNamingConventions(),
      postProc.renamePlacenames(),
      postProc.parseBoundingBox(),
      postProc.normalizeParentIds(),
      postProc.assignLabels(),
      postProc.geocodeJSON(peliasConfig.api, base),
      postProc.sendJSON
    ]),
    status: createRouter([
      controllers.status
    ])
  };


  // static data endpoints
  app.get ( base,                          routers.index );
  app.get ( base + 'attribution',          routers.attribution );
  app.get (        '/attribution',         routers.attribution );
  app.get (        '/status',              routers.status );

  // backend dependent endpoints
  app.get ( base + 'place',                routers.place );
  app.get ( base + 'autocomplete',         routers.autocomplete );
  app.get ( base + 'search',               routers.search );
  app.post( base + 'search',               routers.search );
  app.get ( base + 'search/structured',    routers.structured );
  app.get ( base + 'reverse',              routers.reverse );
  app.get ( base + 'nearby',               routers.nearby );

}

/**
 * Helper function for creating routers
 *
 * @param {[{function}]} functions
 * @returns {express.Router}
 */
function createRouter(functions) {
  var router = Router(); // jshint ignore:line
  functions.forEach(function (f) {
    router.use(f);
  });
  return router;
}


module.exports.addRoutes = addRoutes;
