const fsmFactory = require('./finiteStateMachine');
const process = require('process');
const socksProxy = require('socks-proxy-agent');
const minimist = require('minimist');

const INDEX = 'ott-stat-media*';

var elasticClient;
var kafkaClient;
var socksAgent;

var args = minimist(process.argv.slice(2));
var daemon = args.daemon || args.i;
var pass = args.password || args.p;
var user = args.user || args.u;
var kibana = args.kibana || args.k;
var proxy = args.proxy || args.x;
var kafka = args.kafka || args.f;
var topic = args.topic || args.c;
var UPLOAD_INDEX = args.upload || args.d || "kpi-ott-pilot-test-coverage";
var type = args.type || args.t || "kpi-channel-coverage";
if (args.help || args.h) {
  console.log ("node index.js");
  console.log ()
}
if (kafka && !topic) {
  console.error("The use of kafka / f option requires topic options to be given.");
  process.exit(1);
}

if (kibana && (!user || !pass)) {
  console.error("The use of kibana / k option requires user and password options to be given.");
  process.exit(1);
}
if (kibana) {
  console.log("Using Kibana as a proxy");
  if (proxy) {
    socksAgent = new socksProxy(proxy);
    console.log ("Using SOCKS proxy at " + proxy);
  }
  elasticClient = new (require('./kibanaproxy')) (socksAgent, kibana);
} else {
  console.log ("Connecting directly to elastic");
  elasticClient = new (require('./elasticClient')) (socksAgent);
  socksAgent = undefined;
}

const REQUEST_SIZE = 5000;

const getStoppedSessionsFromLastFiveMinutes = () => {
  const searchConfig = {
    index: INDEX,
    size: REQUEST_SIZE,
    body:  JSON.parse(`{  
   "query":{  
      "bool":{  
         "must":[  
            {  
               "match_phrase":{  
                  "environment":{  
                     "query":"pilot"
                  }
               }
            },
            {  
               "match_phrase":{  
                  "payload.contentType":{  
                     "query":"CHANNEL"
                  }
               }
            },
            {  
               "range":{  
                  "@timestamp":{  
                     "gte":"now-d",
                     "lt":"now"
                  }
               }
            },{  
              "match_phrase":{  
                "payload.state":{  
                  "query":"PLAYING_STOPPED"
                }
              }
            }
         ]
      }
   },
   "_source": "payload.sessionId"
}`)
  };

  const elasticResponse = elasticClient.search(searchConfig);
  return elasticResponse;
};

const extractSessionIdsFromResponse = (elasticResponse) => {
  const { hits: { hits, total } } = elasticResponse;
  console.log(`Total hits: ${total}, hits fetched: ${hits.length}`);

  if (total === 0) {
    return Promise.reject({ message: 'Error: Session search returned no results' });
  }

  const extractSessionId = (hit) => hit._source.payload.sessionId;
  const sessionIds = hits.map(extractSessionId);
  return sessionIds;
};

const getDataFromSessionIds = (sessionIds) => {
  // retreieves all sessionIds and sorts them after number of events for each session.
  const sessionIdToSearchFunction = (sessionId) => {
    return function () {
      return elasticClient.search({
        index: INDEX,
        size: REQUEST_SIZE,
        body: JSON.parse(`{  
                 "query":{  
                    "term":{  
                       "payload.sessionId":"${sessionId}"
                    }
                 },
                 "_source":[  
                    "channel_info.channel_name",
                    "platformName",
                    "uiVersion",
                    "nativeVersion",
                    "accountId",
                    "payload",
                    "channel_id",
                    "country"
                 ]
              }`)
      });
    }

  };
  const concat = list => Array.prototype.concat.bind(list);
  const promiseConcat = f => x => f().then(concat(x));
  const promiseReduce = (acc,x) => acc.then(promiseConcat(x));
  const serial = funcs => funcs.reduce(promiseReduce, Promise.resolve([]));

  const sessionSearchPromiseReturningFunctions = sessionIds.map(sessionIdToSearchFunction);

  const sessionSearchResponses = serial(sessionSearchPromiseReturningFunctions)
    .then((unparsedSessions) => {
      console.debug(`Sessions fetched: ${unparsedSessions.length}`);
      unparsedSessions.sort((a,b) => b.hits.total - a.hits.total);
      return unparsedSessions;
    });

  return sessionSearchResponses;
};

const extractSessionDataFromResponses = (sessionSearchResponses) => {
  const extractLogRowsFromResponse = (elasticResponse) => {
    const { hits: { hits, total } } = elasticResponse;
    console.log(`Total rows: ${total}, rows fetched: ${hits.length}, session: ${hits[0] && hits[0]._source && hits[0]._source.payload && hits[0]._source.payload.sessionId}`);

    return total > 0 ? hits : [];
  };
  const filterEmptySession = (session) => session.length > 0;

  const sessionData = sessionSearchResponses.map(extractLogRowsFromResponse).filter(filterEmptySession);

  if (!sessionData.length) {
    return Promise.reject({ message: 'Error: No session had any valid events' });
  }
  console.log("extractSessionDataFromResponses Input " + sessionSearchResponses.length + " sessions. Output: " + sessionData.length );
  return sessionData;
};

const parseSessionsAndExtractLogData = (sessionData) => {
  const splitLogDataFromSession = (session) => {

    const aggregateUnknownFields = function aggregateUnknownFields (acc, current) {
      var tmp={};
      tmp.channel_info = (typeof(current.channel_info)!="undefined")?current.channel_info:acc.channel_info;
      tmp.channel_id = (typeof(current.channel_id)!="undefined")?current.channel_id:acc.channel_id;
      return tmp;
    };

//    console.log("session[0]="+JSON.stringify(session[0]));

    const {
      accountId,
      platformName,
      payload,
      country
    } = session[0];

    const lastPayload = session[session.length - 1].payload;

    var logData = {
      accountId,
      sessionStartTime: payload.timestamp,
      sessionStopTime: lastPayload.timestamp,
      platformName,
      clientVersion: session[0].nativeVersion?"NATIVE-"+session[0].nativeVersion:"UI-"+ session[0].uiVersion,
      country
    };

    const t = session.reduce(aggregateUnknownFields, { contentType: 'unknown', contentId: 'unknown', protocol:'unknown'});

//    console.log("t="+JSON.stringify(t));
    logData.channelId = t.channel_id?t.channel_id:"Unknown";
    logData.channelName = (t.channel_info && t.channel_info.channel_name) ? t.channel_info.channel_name:"Unknown";

//    console.log("logData="+JSON.stringify(logData));

    return {
      logData,
      session
    };
  };

  const parseEvents = (session) => {
    const extractSource = (event) => event._source;
    const filterMissingEvent = (source) => source.payload.event !== undefined;
    const sortByPayloadTimestamp = (a,b) => a.payload.timestamp - b.payload.timestamp;

    return session.map(extractSource)
      .filter(filterMissingEvent)
      .sort(sortByPayloadTimestamp);
  };



  const sessionsAndLogData = sessionData.map(parseEvents).map(splitLogDataFromSession);
  console.log("parseSessionsAndExtractLogData Input " + sessionData.length + " sessions. Output: " + sessionsAndLogData.length );
  return sessionsAndLogData;
};

const analyseSessionsAndCombineWithLogData = (sessionsAndLogData) => {
  console.log(`${sessionsAndLogData.length} results so far`);

  const analyseSessionAndCompileResultData = ({ session, logData }) => {
    const extractAnalyticsDataFromSession = (session) => {
      const { payload: { event, details, state, sequence, timestamp } } = session;
      return {
        eventName: event.name,
        eventData: event.data,
        state,
        sequence,
        timestamp,
        details
      }
    };
    const eventStreamAnalysis = (fsm, event) => {
      const { eventName } = event;

      //console.log("EventName:" + eventName);
      fsm.setState(event);
      if (fsm.can(eventName)) {
        // console.log(`Transitioning to ${eventName}`)
        const transitionCompleted = fsm[eventName]();
        if (!transitionCompleted) {
          fsm.revertState();
        }
      } else if (fsm.allTransitions().indexOf(eventName) > -1) {
        // console.log(`\nCan't reach state ${eventName} from state ${fsm.state}`);
        fsm.unreachableStateFound();
      } else if (fsm.skpppableTransitions().indexOf(eventName) > -1) {
        // console.log(`\nSkipping ${eventName}, filtered out in 'eventsToSkip' array`);
      } else if (fsm.allUnhandledEvents().indexOf(eventName) === -1) {
        console.log("Adding an unhandled event " + eventName);
        fsm.unhandledEvent(eventName);
      }

      return fsm;
    };

    const result = session.map(extractAnalyticsDataFromSession).reduce(eventStreamAnalysis, new fsmFactory());
    result.totalEvents = session.length;
    result.unhandledEventsString = result.allUnhandledEvents().join(' ');
    const combinedResult = Object.assign({}, result, logData);

    return combinedResult;
  };
  const hasPlayingTime = (combinedResult) => combinedResult.playingTime > 0;

  const analysedData = sessionsAndLogData.map(analyseSessionAndCompileResultData).filter(hasPlayingTime);
  console.log("analyseSessionsAndCombineWithLogData Input " + sessionsAndLogData.length + " sessions. Output: " + analysedData.length );

  const aggregateChannelViewingStatistics = (accumulatedViewingStats, channelSession) => {
    if ((typeof accumulatedViewingStats[channelSession.platformName]) == 'undefined') {
      accumulatedViewingStats[channelSession.platformName] = {};
    }
    if ((typeof accumulatedViewingStats[channelSession.platformName][channelSession.clientVersion])=='undefined') {
      accumulatedViewingStats[channelSession.platformName][channelSession.clientVersion] = {};
    }
    if ((typeof accumulatedViewingStats[channelSession.platformName][channelSession.clientVersion][channelSession.channelId])=='undefined') {
      accumulatedViewingStats[channelSession.platformName][channelSession.clientVersion][channelSession.channelId] = {
        count: 1,
        time: channelSession.sessionStopTime-channelSession.sessionStartTime,
        accounts: [channelSession.accountId],
        channelName: channelSession.channelName,
        country: channelSession.country
    };
    } else {
      var rec = accumulatedViewingStats[channelSession.platformName][channelSession.clientVersion][channelSession.channelId];
      rec.count++;
      rec.time += channelSession.sessionStopTime-channelSession.sessionStartTime;
      if (rec.accounts.indexOf(channelSession.accountId) == -1) {
        rec.accounts.push(channelSession.accountId);
      }
    }
    return accumulatedViewingStats;
  };

  const aggregatedData = analysedData.reduce(aggregateChannelViewingStatistics, {});

  var dataRecordsToUpload = [];

  Object.keys(aggregatedData).forEach(function (platform) {
    Object.keys(aggregatedData[platform]).forEach(function (clientVersion) {
      Object.keys(aggregatedData[platform][clientVersion]).forEach(function (channelId) {
        dataRecordsToUpload.push ({
          platform: platform,
          clientVersion: clientVersion,
          channelId: channelId,
          channelName: aggregatedData[platform][clientVersion][channelId].channelName,
          time:aggregatedData[platform][clientVersion][channelId].time,
          cnt:aggregatedData[platform][clientVersion][channelId].count,
          accounts:aggregatedData[platform][clientVersion][channelId].accounts,
          country:aggregatedData[platform][clientVersion][channelId].country
        });
      });
    });
  });

  return dataRecordsToUpload;
};

const logResults = (dataRecordsToUpload) => {
  dataRecordsToUpload.forEach(function (data) {
    const accounts = JSON.stringify(data.accounts);
    console.log (`
    ----------------------------
      platform: ${data.platform}
      clientVersion: ${data.clientVersion}
      channelId: ${data.channelId}
      channelName: ${data.channelName}
      Time: ${parseInt(data.time/1000)}
      Country: ${data.country}
      Count: ${data.cnt}
      Accounts: ${accounts}
    `);
  });
  return dataRecordsToUpload;
};

const uploadResultsToElastic = (dataRecordsToUpload) => {
  const now = new Date().toISOString();
  const uploadDataToUploadFunction = (data) => {
    return function () {
      var p = {
        index: UPLOAD_INDEX,
        type: type,
        body: data
      };
      if (kafka) {
        return kafkaClient.create(p);
      } else {
        return elasticClient.index(p);
      }

    }

  };
  const concat = list => Array.prototype.concat.bind(list);
  const promiseConcat = f => x => f().then(concat(x));
  const promiseReduce = (acc,x) => acc.then(promiseConcat(x));
  const serial = funcs => funcs.reduce(promiseReduce, Promise.resolve([]));

  const scaleAndConvertData = (data) => {
    var tmp = {
      platform: data.platform,
      clientVersion: data.clientVersion,
      channelId: data.channelId,
      channelName: data.channelName,
      time: parseInt(data.time/1000),
      count: data.cnt,
      accounts: data.accounts,
      country: data.country,
      type: "OTTPilotLiveStatistics",
      timestamp: now,
      version: "6"
    };
    return tmp;
  };
  console.log ("# records to upload = " + dataRecordsToUpload.length);
  const uploadPromiseReturningFunctions = dataRecordsToUpload.map(scaleAndConvertData).map(uploadDataToUploadFunction);

  const uploadResponses = serial(uploadPromiseReturningFunctions);

  return uploadResponses;

};

var run = function run () {
  var p;
  if (kibana) {
    p = elasticClient.login(user, pass).then(function () {
      if (kafka) {
        return require('./kafkaClient')(topic, kafka).then(function (k) { kafkaClient = k; });
      }
    });
  }
  else {
    if (kafka) {
      p = require('./kafkaclient')(topic, kafka).then(function (k) { kafkaClient = k; });
    } else {
      p = Promise.resolve();
    }
  }
  p.then(getStoppedSessionsFromLastFiveMinutes)
    .then(extractSessionIdsFromResponse)
    .then(getDataFromSessionIds)
    .then(extractSessionDataFromResponses)
    .then(parseSessionsAndExtractLogData)
    .then(analyseSessionsAndCombineWithLogData)
    .then(logResults)
    .then(uploadResultsToElastic)
    .catch((err) => {
      console.log(err.message);
    }).finally(() => { if (!daemon) { process.exit() } }).then(function () {
    if (kibana) {
      return elasticClient.logout();
    }
  });
};


if (daemon) {
  console.log ("Daemon mode interval " + daemon + " minutes");
  run();
  setInterval(run, 60 * 1000 * daemon);
} else {
  run();
}
