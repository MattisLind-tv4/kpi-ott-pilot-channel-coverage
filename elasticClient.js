const elasticsearch = require('elasticsearch');

function ElasticClient (socksAgent) {
  const hosts = [
    {
      host: 'el001node1.ddc.teliasonera.net',
      port: 9200
    },
    {
      host: 'el001node2.ddc.teliasonera.net',
      port: 9200
    },
    {
      host: 'el001node3.ddc.teliasonera.net',
      port: 9200
    },
    {
      host: 'el001node4.ddc.teliasonera.net',
      port: 9200
    }
  ];
  return new elasticsearch.Client({
    host: hosts,
    httpAuth:'analytics_producer:MduwXRtp4u',
    createNodeAgent: socksAgent
    //log: 'trace',
  });
}


module.exports = ElasticClient;
