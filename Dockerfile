FROM node:10
WORKDIR /usr/local/kpi-ott-pilot-channel-coverage
COPY package.json ./
COPY package-lock.json ./
RUN if [ ! -z $HTTP_PROXY ]; then npm config set https-proxy $HTTP_PROXY; npm config set proxy $HTTP_PROXY; fi
RUN npm install
COPY elasticClient.js ./
COPY finiteStateMachine.js ./
COPY index.js ./
COPY kafkaclient.js ./
COPY kibanaproxy.js ./
COPY queryBuilder.js ./
ENTRYPOINT ["/usr/local/bin/node","index.js"]
CMD []
