/**
 * Created by mattis on 2019-01-17.
 */

const kafka = require('kafka-node');

function kafkaClient (topic, kafkaHost) {
  return new Promise(function (resolve,reject) {

    const client = new kafka.KafkaClient({kafkaHost: kafkaHost});
    const producer = new kafka.Producer(client);
    const exports =  {
      create: function create(param) {
        return new Promise(function (resolve, reject) {
	    producer.send([{topic: topic, messages: [JSON.stringify(param.body)], type: param.type}], function (err, data) {
            if (err) {
              reject();
            } else {
              resolve(data);
            }
          });
        });
      },
      createTopic: function createTopic (topic) {
        return new Promise(function (resolve, reject) {
          client.createTopics([topic], function (err, res) {
            if (err) {
              reject(res);
            } else {
              resolve(res);
            }
          });
        });
      }
    };
    producer.on('ready', function () {
      resolve(exports);
    });

    producer.on('error', function () {
      reject();
    });


  });

}


module.exports = kafkaClient;

