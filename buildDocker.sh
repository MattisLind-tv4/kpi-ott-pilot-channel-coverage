#!/bin/bash
TEMP=`mktemp -d`
echo $TEMP
cp package.json $TEMP
cp package-lock.json $TEMP
cp elasticClient.js $TEMP
cp finiteStateMachine.js $TEMP
cp index.js $TEMP
cp kafkaclient.js $TEMP
cp kibanaproxy.js $TEMP
cp Dockerfile $TEMP
docker build -t kpi-ott-pilot-channel-coverage-docker $DOCKER_OPTIONS $TEMP
docker save -o kpi-ott-pilot-channel-coverage-docker.tar  kpi-ott-pilot-channel-coverage-docker
rm -rf $TEMP
