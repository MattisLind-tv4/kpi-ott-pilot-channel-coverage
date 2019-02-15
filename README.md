# Stalled buffering KPI NodeJS script
Here's a brief description of the different files and their usage:
### index.js
Main script file, takes care of loading all dependencies and performing the analytics. In essence it does the following:
1. Get all finished sessions from the last day (finished defined as a session that contains the `PLAYING_STOPPED` state) which is in tyhe pilot environment
2. Get all events from sessions gathererd in (1)
3. Perform some basic filtering and sorting by timestamp
4. Run the event sequence through a finite state machine (explained below) to gather analytics
5. Agregate number of session and session length over the different platforms, versions and channels.
6. Push statistics to Elastic

### finiteStateMachine.js
A [finite state machine](https://en.wikipedia.org/wiki/Finite-state_machine) that assigns states to different events in the event stream, and through transitions compiles the actual analytics data. It keeps track of data points such as number of buffering events, total buffering time, effective playing time, number of errors that occured throughout the session, etc.

### elasticClient.js
Configures the Elasticsearch client with correct hosts and auth for use in `index.js`.

### Runtime. 
Need nodejs 10.x or higher.

### Running

Run either trough npm run or direct using node.

The program takes a set of options.

```
 -k or --kibana for use of kibana as a proxy when using the program within the labnet. Requires login and use of option to set password and username.
 -u <user> or --username=<user>. The username to use then using Kibana as a proxy from the labbet.
 -p <passwd> or --password=<passwd>. The password to use when using Kibana as a proxy from the labnet.
 -x <URL of SOCKS proxy> or --proxy=<URL of SOCKS proxy>. Is applied to all network connections.
 -d <index> or --upload=<index>. The destination index to upload to to store the result of the aggregation.
 -t <type> or --type=<type>. The document type to store the uploaded documents under.
 -f <kafka host> or --kafka=<kafka host>. Use kafka to upload the result of the aggregation. Need topic option as well.
 -c <topic> or -topic=<topic>. A topic is needed if kafka option is to be used.
 -i <interval> or -daemon=<interval>. Time interval for running the program.
```


```
npm run kpi-stalling --  -p <password> -u <user> -k
```

or

```
node index.js -p <password>  -u <user> -k
```


### Docker

Docker need to be installed on the target server. Make sure that the /var/lib/docker directory is located on a file system with anough diskspace. If not stop docker 

```
service docker stop
```
Copy all files fromn /var/lib/docker to whatever directory you find on a filesystem with enough space then create a sysmlink from /var/lib/docker to this directory.


Then start the docker service again.
```
service docker start
```




A docker container with this tool can be build using shellscript buildDocker.sh
```
./buildDocker.sh
```

This shell script will create a file stalled-buffering-kpi-docker.tar which can be moved to the computer which is supposed to execute this container. 
Use the docker load command to load this tar acrive into docker.

```
docker load --input stalled-buffering-kpi-docker.tar
```

#### Running in Docker

The docker container takes the same arguments as the node program itself.

To make the docker container stay peristent across reboots use the 

```
docker run --restart unless-stopped stalled-buffering-kpi-docker -c kpi-test -f in001node3:9092 
```

### Notes on running behind a proxy

Setup PROXY to be able to use git.

```
$ export HTTP_PROXY='http://proxy-se-uan.ddc.teliasonera.net:8080'
$ export HTTPS_PROXY='http://proxy-se-uan.ddc.teliasonera.net:8080'
$ export http_proxy='http://proxy-se-uan.ddc.teliasonera.net:8080'
$ export https_proxy='http://proxy-se-uan.ddc.teliasonera.net:8080'
```

#### Docker behind proxy

Docker needs setup to allow it to run behind a proxy if the build is to be performed on the target system from the Dockerfile.

[This](https://docs.docker.com/config/daemon/systemd/) article details this.

Create a systemd drop-in directoryt for the docker service

```
sudo mkdir -p /etc/systemd/system/docker.service.d
```

Create two files called /etc/systemd/system/docker.service.d/http-proxy.conf and /etc/systemd/system/docker.service.d/https-proxy.conf that assds HTTP_PROXY and HTTP_PROXY
These shall contain:

```
[Service]
Environment="HTTP_PROXY=http://proxy-se-uan.ddc.teliasonera.net:8080"
```

Flush changes

```
$ sudo systemctl daemon-reload
```

Restart Docker

```
$ sudo systemctl restart docker 
```

#### Building on a Docker behind a proxy

Since the build process involves an npm install, npm has to be configured to understand proxies as well.  The buildDocker.sh can use the environment variable DOCKER_OPTIONS and thus
specify what PROXY to use for the npm program.

```
export DOCKER_OPTIONS='--build-arg HTTP_PROXY=http://proxy-se-uan.ddc.teliasonera.net:8080'
```


#### Firewall rules

If using Kafka for delivering aggregated data, the nodes kafka is run on is protected by IPTABLES. Check that the computer this tool is installed on has access to the kafka nodes.

If not append a 
```
$ iptables -t filter -A INPUT -s <YOUR MACHINE IP>/32 -m comment --comment "<Your machine host name and description>" -j ACCEPT
```

on all the kafka nodes. I.e. in001node1, in001node2 and in001node3.

To make the firewall rule permanent the file /opt/telia/firewall/ipv4/active/98-elastic.fw has to be edited on each of these servers and the line 

```
-A INPUT -s <YOUR MACHINE IP> -m comment --comment "<Comment describing your host>" -j ACCEPT
```
has to be inserted.

This files has to be compiled with all other firewall rules into to the iptables file located in /etc/sysconfig by the teliasonera_fwctrl

```
teliasonera_fwctrl > iptables.new
```

Then check the diff with the old iptables file and check that the file seem reasonable. In case everything is ok just move the file into iptables.








