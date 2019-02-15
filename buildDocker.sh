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
cp queryBuilder.js $TEMP
cp Dockerfile $TEMP
docker build -t stalled-buffering-kpi-docker $DOCKER_OPTIONS $TEMP
docker save -o stalled-buffering-kpi-docker.tar stalled-buffering-kpi-docker 
rm -rf $TEMP
