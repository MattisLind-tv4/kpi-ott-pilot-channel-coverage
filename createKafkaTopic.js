/**
 * Created by mattis on 2019-01-18.
 */


const kafkaHost = process.argv[2];
const topic = process.argv[3];

const p = require('./kafkaclient') (kafkaHost);

p.then(function (kafkaClient) {
  return kafkaClient.createTopic (topic);
}).finally(function () {process.exit(0);});

