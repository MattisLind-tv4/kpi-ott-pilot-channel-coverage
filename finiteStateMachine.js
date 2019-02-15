const StateMachine = require('javascript-state-machine');

const STATES = {
  ANY: '*',
  LOADING: 'loading',
  PLAYING: 'play',
  BUFFERING: 'buffering',
  ERROR: 'error',
  PAUSED: 'pause',
  FINISHED: 'finished',
}

const transitions = [
  // Loading
  { name: 'loadStream', from: STATES.ANY, to: STATES.LOADING },
  { name: 'getRRStreamURL', from: STATES.ANY, to: STATES.LOADING },
  { name: 'loadStreamSeekStart', from: STATES.ANY, to: STATES.LOADING },
  { name: 'loadStreamSeekDone', from: STATES.ANY, to: STATES.LOADING },

  // Playback
  { name: 'bufferingStart', from: [STATES.LOADING, STATES.PLAYING, STATES.PAUSED, STATES.ERROR], to: STATES.BUFFERING },
  { name: 'bufferingDone', from: [STATES.BUFFERING, STATES.PAUSED], to:STATES.PLAYING },
  { name: 'seekStart', from: [STATES.LOADING, STATES.PLAYING, STATES.PAUSED, STATES.ERROR], to: STATES.LOADING },
  { name: 'playbackStart', from: [STATES.LOADING, STATES.PLAYING, STATES.PAUSED, STATES.ERROR], to: STATES.PLAYING },
  { name: 'playing', from: [STATES.LOADING, STATES.PLAYING, STATES.PAUSED, STATES.ERROR], to: STATES.PLAYING },
  { name: 'paused', from: STATES.ANY, to: STATES.PAUSED },
  { name: 'playbackFinished', from: STATES.ANY, to: STATES.FINISHED },

  // Errors
  { name: 'downloadFailed', from: STATES.ANY, to: STATES.ERROR},
  { name: 'playbackFailure', from: STATES.ANY, to: STATES.ERROR},
  { name: 'loadStreamFailed', from: STATES.ANY, to: STATES.ERROR },
  { name: 'getRRStreamURLFailed', from: STATES.ANY, to: STATES.ERROR }
];

const analyticsProperties = {
  // Event being processed
  currentEvent: undefined,

  // Time spent buffering
  bufferEvents: 0,
  bufferStartTimestamp: 0,
  bufferTime: 0,
  intervalTime: 0,

  // Time spent playing
  playingStartTimestamp: 0,
  playingTime: 0,

  // Stream errors
  streamErrorCount: 0,
};

const internalState = {
  // Internal event handling
  lastEvent: undefined,

  // Diagnostics
  eventsToSkip: ['accessLog'],
  unreachableStates: 0,
  unhandledEvents: [],
};

const initialData = Object.assign({}, analyticsProperties, { internal: internalState });

const methods = {
  // Helper methods
  setState: function(event) {
    this.internal.lastEvent = this.currentEvent;
    this.currentEvent = event;
    return this.currentEvent;
  },
  revertState: function() {
    this.currentEvent = this.internal.lastEvent
    this.internal.lastEvent = undefined;
    return this.currentEvent;
  },
  skpppableTransitions: function() {
    return this.internal.eventsToSkip;
  },
  unreachableStateFound: function() {
    this.internal.unreachableStates = this.internal.unreachableStates + 1;
    return this.internal.unreachableStates;
  },
  allUnreachableStates: function() {
    return this.internal.unreachableStates;
  },
  unhandledEvent: function(eventName) {
    this.internal.unhandledEvents.push(eventName);
    return this.internal.unhandledEvents;
  },
  allUnhandledEvents: function() {
    return this.internal.unhandledEvents;
  },

  // Transition lifecycle
  onSeekStart: function() {
    this.bufferStartTimestamp = 0;
  },
  onBufferingStart: function() {
    this.bufferEvents = this.bufferEvents + 1;
    this.bufferStartTimestamp = this.currentEvent.timestamp;
  },
  onBufferingDone: function() {
    this.intervalTime = this.intervalTime + this.currentEvent.eventData.interval;
    //console.debug(`Buffering interval: ${(this.currentEvent.eventData && this.currentEvent.eventData.interval) || 'unavailable'}`);
    if (this.bufferStartTimestamp > 0) {
      this.bufferTime = this.bufferTime + (this.currentEvent.timestamp - this.bufferStartTimestamp);
      this.bufferStartTimestamp = 0;
      return true;
    }
    // bufferStartTimestamp being 0 could indicate a seek happened,
    // or we should otherwise skip counting this buffering event because
    // the timestamp has been reset.
    this.bufferEvents = this.bufferEvents - 1;
  },
  onEnterPlay: function() {
    this.playingStartTimestamp = this.currentEvent.timestamp;
  },
  onLeavePlay: function() {
    this.playingTime = this.playingTime + (this.currentEvent.timestamp - this.playingStartTimestamp);
    this.playingStartTimestamp = 0;
  },
  onEnterLoading: function() {

  },
  onLeaveLoading: function() {

  },
  onTransition: function({ transition, from, to }) {
    if (to === STATES.ERROR) {
      this.streamErrorCount = this.streamErrorCount + 1;
    }
    // console.log(`Current transition: ${transition} from ${from} to ${to}`);
  },
  onFinished: function() {
    //this.unhandledEventsString = this.internal.unhandledEvents.join(' ');
  },
};

const config = {
  init: 'loading',
  transitions: transitions,
  data: initialData,
  methods: methods,
}

module.exports = StateMachine.factory(config);
