/**
 * Created by mattis on 2019-01-09.
 */


const request = require('request');



function KibanaProxy (socksAgent, kbnVersion) {

  var cookie;
  this.login = function login(username, password) {
    return new Promise(function (resolve, reject) {
      var headers = {
        'kbn-version': kbnVersion,
        'Content-Type': 'application/json;charset=UTF-8',
        'Accept': 'application/json, text/plain, */*'
      };

      var dataString = '{"username":"' + username + '","password":"' + password + '"}';

      var options = {
        url: 'http://kb001kibanaext1.ddc.teliasonera.net:5601/api/security/v1/login',
        method: 'POST',
        headers: headers,
        body: dataString,
        agent: socksAgent
      };
      function callback(error, response) {
        console.log(response.statusCode);
        if (!error && ((response.statusCode == 200) || (response.statusCode == 204))) {
          cookie = response.headers['set-cookie'][0].split(';')[0];
          resolve();
        } else {
          reject();
        }
      }
      request(options, callback);
    });
  };

  this.search = function search(param) {
    return new Promise (function (resolve, reject) {
      var headers = {
        'kbn-version': kbnVersion,
        'Content-Type': 'application/json',
        'Cookie': cookie
      };

      var options = {
        url: 'http://kb001kibanaext1.ddc.teliasonera.net:5601/api/console/proxy?path=%2F' + param.index + '%2F_search%3Fsize%3D'+ param.size+'&method=POST',
        method: 'POST',
        headers: headers,
        body: JSON.stringify(param.body),
        agent: socksAgent
      };

      function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
          //console.log(body);
          resolve(JSON.parse(body));
        } else {
          reject({ message: `Search request got ${(response && response.statusCode?response.statusCode:" no statusCode")} `});
        }
      }
      request(options, callback);
    });
  };


  this.create = function upload(param) {
    return new Promise (function (resolve, reject) {
      var backoff=1;
      var headers = {
        'kbn-version': kbnVersion,
        'Content-Type': 'application/json',
        'Cookie': cookie
      };
      //console.log(JSON.stringify(param.body));
      var options = {
        url: 'http://kb001kibanaext1.ddc.teliasonera.net:5601/api/console/proxy?path=%2F' + param.index + '%2F' + param.type+ '%2F&method=POST',
        method: 'POST',
        headers: headers,
        body: JSON.stringify(param.body),
        agent: socksAgent
      };
      var callback = function callback(error, response, body) {
        if (!error && (response.statusCode === 200 || response.statusCode === 201)) {
          //console.log (response && response.statusCode);
          //console.log(body);
          resolve(JSON.parse(body));
        } else if (!error && (response.statusCode === 429) || (response.statusCode === 502)) {
          if (backoff > 1024) {
            reject("Too many retries!")
          } else {
            setTimeout(function () { request(options, callback);}, backoff*10);
            console.log ("Got " + response && response.statusCode + " - retrying,  backoff time = " + backoff*10);
            backoff*=2;
          }
        }
        else {
          //console.log("Retry-After: " + response.headers['retry-after'] );
          //console.log(JSON.stringify(response.headers));
          //console.log(body);
          reject({ message: `Request got ${(response && response.statusCode?response.statusCode:" no statusCode")} 
        HEADERS ${JSON.stringify(response.headers)} BODY: ${body}`});
        }
      };

      request(options, callback);
    });
  };

  this.logout = function logout() {
    return new Promise (function (resolve, reject) {
      var options = {
        url: 'http://kb001kibanaext1.ddc.teliasonera.net:5601/api/security/v1/logout',
        agent: socksAgent
      };

      function callback(error, response) {
        if (!error && response.statusCode == 200) {
          resolve();
        } else {
          reject();
        }
      }

      request(options, callback);
    });
  };
}



module.exports =  KibanaProxy;