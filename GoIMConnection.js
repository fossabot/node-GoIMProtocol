const net = require("net")
let websocketAvaliable = false
/**
 * @type {ws}
 */
let ws;
try {
    ws = require('ws');
    websocketAvaliable = true;
} catch (error) {
    websocketAvaliable = false;
}
var events = require('events')
const Decoder = require("./decoder");
const Encoder = require("./encoder");

class GoIMConnection extends events.EventEmitter {

    constructor(config) {
        super()
        this.type = config.type || (websocketAvaliable ? "websocket" : "tcp")
        /**
         * @type {Decoder}
         */
        this.decoder = config.decoder || new Decoder();
        /**
         * @type {Encoder}
         */
        this.host = config.host;
        this.port = config.port;
        this.path = config.path || "";// /sub
        this.wss = config.wss || false;
        this.encoder = config.encoder || new Encoder();
        this.__connection = config.connection;
        this.authInfo = config.authInfo; // {roomId:912226,token:12}
        this.onAuth = config.onAuth;
        this.onHeartbeat = config.onHeartbeat;
        this.version = config.version || 1
        this.heartbeatTimer = 0;
        this.on('AuthSucceeded', this.onAuthSucceeded)
        this.operationMap = {
            3: "heartbeatReply",
            8: "AuthSucceeded",
            5: "message"
        }
    }
    Auth() {
        this.send({
            protocolVersion: this.version,
            operation: 7,
            body: Buffer.isBuffer(this.authInfo) ? this.authInfo : Buffer.from((JSON.stringify(this.authInfo) || ""))
        })
    }
    onAuthSucceeded(body) {
        this.Heartbeat()
        this.heartbeatTimer = setInterval(this.Heartbeat.bind(this), 30 * 1000);
    }
    Heartbeat() {
        this.send({
            protocolVersion: this.version,
            operation: 2,
            body: Buffer.from('[object Object]')
        })
    }
    connect() {
        if (this.type == "tcp") {
            /**
             * @type {net.Socket}
             */
            this.__connection = new net.Socket();
            this.__connection.on('connect', this.__onConnect.bind(this))
            this.__connection.on('error', this.__onError.bind(this))
            this.__connection.on('close', this.__onClose.bind(this))
            this.__connection.on('data', this.__onData.bind(this))
            this.__connection.connect({
                host: this.host,
                port: this.port
            })
            this.connection = this.__connection
        } else if (this.type == "websocket" && websocketAvaliable) {
            /**
             * @type {WebSocket}
             */
            this.__connection = new ws(`${this.wss ? 'wss': 'ws'}://${this.host}:${this.port}/${this.path}`)
            this.__connection.on('open', this.__onConnect.bind(this))
            this.__connection.on('error', this.__onError.bind(this))
            this.__connection.on('close', this.__onClose.bind(this))
            this.connection = ws.createWebSocketStream(this.__connection)
            this.connection.on('data', this.__onData.bind(this))
        }
    }
    __onConnect() {
        this.Auth();
        this.emit('connect')
    }
    __onError(e) {
        this.emit('error', e)
    }
    __onClose(e) {
        clearInterval(this.heartbeatTimer);
        this.emit('close',e)
    }
    __onData(data) {
        while (data.length > 0) {
            let packet = this.decoder.decode(data);
            if (this.operationMap[packet.operation]) {
                this.emit(this.operationMap[packet.operation] || "UnknownOperation",packet)
            }
            data = data.slice(packet.packageLength);
        }
    }
    send(packet){
        return this.connection.write(this.encoder.encode(packet))
    }
}
module.exports = GoIMConnection;